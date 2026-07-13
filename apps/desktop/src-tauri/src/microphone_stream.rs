use std::{
    collections::VecDeque,
    sync::{
        atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering},
        mpsc::{self, Receiver, SyncSender, TrySendError},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::Duration,
};

use cpal::{
    traits::{DeviceTrait, StreamTrait},
    SampleFormat, StreamConfig,
};
use serde::Serialize;
use tauri::{ipc::Channel, State};

use crate::{
    microphone_capture::{f32_to_mono_i16, i16_to_mono_i16, select_input_device, u16_to_mono_i16},
    microphone_resampler::StreamingPcmResampler,
};

const TARGET_SAMPLE_RATE_HZ: u32 = 16_000;
const CHUNK_DURATION_MS: u32 = 100;
const SAMPLES_PER_CHUNK: usize = 1_600;
const BYTES_PER_CHUNK: usize = 3_200;
const NATIVE_QUEUE_CAPACITY: usize = 32;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct NativeMicrophoneStreamChunk {
    pub stream: String,
    pub format: String,
    pub sample_rate_hz: u32,
    pub channels: u16,
    pub duration_ms: u32,
    pub byte_length: usize,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum NativeMicrophoneStreamEvent {
    Chunk { chunk: NativeMicrophoneStreamChunk },
    Gap { reason: String, dropped_chunks: u32 },
    Error { code: String, recoverable: bool },
    State { state: String },
}

enum CaptureMessage {
    Samples { epoch: u32, samples: Vec<i16> },
    State(&'static str),
}

pub struct MicrophoneStreamManager {
    active: Mutex<Option<ActiveMicrophoneStream>>,
}

struct ActiveMicrophoneStream {
    stream: cpal::Stream,
    paused: Arc<AtomicBool>,
    stopped: Arc<AtomicBool>,
    failed: Arc<AtomicBool>,
    capture_epoch: Arc<AtomicU32>,
    discarded_pause_input_samples: Arc<AtomicU64>,
    discarded_pause_output_samples: Arc<AtomicU64>,
    processor: Arc<Mutex<AudioProcessor>>,
    sender: SyncSender<CaptureMessage>,
    worker: Option<JoinHandle<()>>,
}

struct AudioProcessor {
    resampler: StreamingPcmResampler,
    output: VecDeque<i16>,
}

struct CaptureWorkerContext {
    stopped: Arc<AtomicBool>,
    failed: Arc<AtomicBool>,
    processor: Arc<Mutex<AudioProcessor>>,
    capture_epoch: Arc<AtomicU32>,
    dropped_samples: Arc<AtomicU64>,
    discarded_pause_input_samples: Arc<AtomicU64>,
    discarded_pause_output_samples: Arc<AtomicU64>,
    input_rate_hz: u32,
}

impl Default for MicrophoneStreamManager {
    fn default() -> Self {
        Self {
            active: Mutex::new(None),
        }
    }
}

impl Drop for MicrophoneStreamManager {
    fn drop(&mut self) {
        if let Ok(active) = self.active.get_mut() {
            if let Some(stream) = active.take() {
                stop_active_stream(stream);
            }
        }
    }
}

#[tauri::command]
pub fn start_microphone_stream(
    manager: State<'_, MicrophoneStreamManager>,
    device_id: Option<String>,
    on_event: Channel<NativeMicrophoneStreamEvent>,
) -> Result<(), String> {
    let mut active_guard = manager
        .active
        .lock()
        .map_err(|_| "microphone_stream_state_unavailable".to_string())?;

    if active_guard.as_ref().is_some_and(|active| {
        active.stopped.load(Ordering::Acquire) || active.failed.load(Ordering::Acquire)
    }) {
        if let Some(stale) = active_guard.take() {
            stop_active_stream(stale);
        }
    }

    if active_guard.is_some() {
        return Err("microphone_stream_already_active".to_string());
    }

    let host = cpal::default_host();
    let device = select_input_device(&host, device_id.as_deref())?;
    let supported_config = device
        .default_input_config()
        .map_err(|error| classify_start_error(&error.to_string()))?;
    let sample_format = supported_config.sample_format();
    let stream_config: StreamConfig = supported_config.into();
    let input_rate_hz = stream_config.sample_rate.0;
    let input_channels = stream_config.channels.max(1);
    let processor = Arc::new(Mutex::new(AudioProcessor::new(input_rate_hz)?));
    let paused = Arc::new(AtomicBool::new(false));
    let stopped = Arc::new(AtomicBool::new(false));
    let failed = Arc::new(AtomicBool::new(false));
    let capture_epoch = Arc::new(AtomicU32::new(0));
    let dropped_samples = Arc::new(AtomicU64::new(0));
    let discarded_pause_input_samples = Arc::new(AtomicU64::new(0));
    let discarded_pause_output_samples = Arc::new(AtomicU64::new(0));
    let (sender, receiver) = mpsc::sync_channel(NATIVE_QUEUE_CAPACITY);

    let stream = match sample_format {
        SampleFormat::F32 => build_stream_f32(
            &device,
            &stream_config,
            input_channels,
            sender.clone(),
            paused.clone(),
            stopped.clone(),
            failed.clone(),
            capture_epoch.clone(),
            dropped_samples.clone(),
        ),
        SampleFormat::I16 => build_stream_i16(
            &device,
            &stream_config,
            input_channels,
            sender.clone(),
            paused.clone(),
            stopped.clone(),
            failed.clone(),
            capture_epoch.clone(),
            dropped_samples.clone(),
        ),
        SampleFormat::U16 => build_stream_u16(
            &device,
            &stream_config,
            input_channels,
            sender.clone(),
            paused.clone(),
            stopped.clone(),
            failed.clone(),
            capture_epoch.clone(),
            dropped_samples.clone(),
        ),
        _ => Err("microphone_sample_format_unsupported".to_string()),
    }?;

    let worker_context = CaptureWorkerContext {
        stopped: stopped.clone(),
        failed: failed.clone(),
        processor: processor.clone(),
        capture_epoch: capture_epoch.clone(),
        dropped_samples,
        discarded_pause_input_samples: discarded_pause_input_samples.clone(),
        discarded_pause_output_samples: discarded_pause_output_samples.clone(),
        input_rate_hz,
    };
    let worker = thread::spawn(move || forward_capture_events(receiver, on_event, worker_context));

    stream
        .play()
        .map_err(|error| classify_start_error(&error.to_string()))?;
    let _ = sender.try_send(CaptureMessage::State("capturing"));
    *active_guard = Some(ActiveMicrophoneStream {
        stream,
        paused,
        stopped,
        failed,
        capture_epoch,
        discarded_pause_input_samples,
        discarded_pause_output_samples,
        processor,
        sender,
        worker: Some(worker),
    });
    Ok(())
}

#[tauri::command]
pub fn pause_microphone_stream(manager: State<'_, MicrophoneStreamManager>) -> Result<(), String> {
    let active_guard = manager
        .active
        .lock()
        .map_err(|_| "microphone_stream_state_unavailable".to_string())?;
    let active = active_guard
        .as_ref()
        .ok_or_else(|| "microphone_stream_not_active".to_string())?;
    active.paused.store(true, Ordering::Release);
    active.capture_epoch.fetch_add(1, Ordering::AcqRel);
    let (discarded_input_samples, discarded_output_samples) = active
        .processor
        .lock()
        .map_err(|_| "microphone_stream_state_unavailable".to_string())?
        .reset();
    active
        .discarded_pause_input_samples
        .fetch_add(discarded_input_samples as u64, Ordering::Relaxed);
    active
        .discarded_pause_output_samples
        .fetch_add(discarded_output_samples as u64, Ordering::Relaxed);
    active
        .sender
        .send(CaptureMessage::State("paused"))
        .map_err(|_| "microphone_stream_failed".to_string())
}

#[tauri::command]
pub fn resume_microphone_stream(manager: State<'_, MicrophoneStreamManager>) -> Result<(), String> {
    let active_guard = manager
        .active
        .lock()
        .map_err(|_| "microphone_stream_state_unavailable".to_string())?;
    let active = active_guard
        .as_ref()
        .ok_or_else(|| "microphone_stream_not_active".to_string())?;
    if active.failed.load(Ordering::Acquire) {
        return Err("microphone_stream_failed".to_string());
    }
    active
        .sender
        .send(CaptureMessage::State("capturing"))
        .map_err(|_| "microphone_stream_failed".to_string())?;
    active.paused.store(false, Ordering::Release);
    Ok(())
}

#[tauri::command]
pub fn stop_microphone_stream(manager: State<'_, MicrophoneStreamManager>) -> Result<(), String> {
    let active = manager
        .active
        .lock()
        .map_err(|_| "microphone_stream_state_unavailable".to_string())?
        .take();
    if let Some(active) = active {
        stop_active_stream(active);
    }
    Ok(())
}

impl AudioProcessor {
    fn new(input_rate_hz: u32) -> Result<Self, String> {
        Ok(Self {
            resampler: StreamingPcmResampler::new(input_rate_hz)?,
            output: VecDeque::with_capacity(SAMPLES_PER_CHUNK * 2),
        })
    }

    fn process(&mut self, samples: &[i16]) -> Result<Vec<NativeMicrophoneStreamChunk>, String> {
        self.output.extend(self.resampler.push(samples)?);
        let mut chunks = Vec::new();
        while self.output.len() >= SAMPLES_PER_CHUNK {
            let samples = self.output.drain(..SAMPLES_PER_CHUNK);
            let mut bytes = Vec::with_capacity(BYTES_PER_CHUNK);
            for sample in samples {
                bytes.extend_from_slice(&sample.to_le_bytes());
            }
            chunks.push(NativeMicrophoneStreamChunk {
                stream: "microphone".to_string(),
                format: "pcm_s16le".to_string(),
                sample_rate_hz: TARGET_SAMPLE_RATE_HZ,
                channels: 1,
                duration_ms: CHUNK_DURATION_MS,
                byte_length: bytes.len(),
                bytes,
            });
        }
        Ok(chunks)
    }

    fn reset(&mut self) -> (usize, usize) {
        let discarded_output_samples = self.output.len();
        self.output.clear();
        (self.resampler.reset(), discarded_output_samples)
    }
}

fn enqueue_samples(
    sender: &SyncSender<CaptureMessage>,
    failed: &AtomicBool,
    capture_epoch: u32,
    dropped_samples: &AtomicU64,
    samples: Vec<i16>,
) {
    let sample_count = samples.len() as u64;
    match sender.try_send(CaptureMessage::Samples {
        epoch: capture_epoch,
        samples,
    }) {
        Ok(()) => {}
        Err(TrySendError::Full(_)) => {
            dropped_samples.fetch_add(sample_count, Ordering::Relaxed);
        }
        Err(TrySendError::Disconnected(_)) => {
            failed.store(true, Ordering::Release);
        }
    }
}

macro_rules! build_stream {
    ($name:ident, $sample_type:ty, $convert:ident) => {
        #[allow(clippy::too_many_arguments)]
        fn $name(
            device: &cpal::Device,
            config: &StreamConfig,
            channels: u16,
            sender: SyncSender<CaptureMessage>,
            paused: Arc<AtomicBool>,
            stopped: Arc<AtomicBool>,
            failed: Arc<AtomicBool>,
            capture_epoch: Arc<AtomicU32>,
            dropped_samples: Arc<AtomicU64>,
        ) -> Result<cpal::Stream, String> {
            let stream_failed = failed.clone();
            device
                .build_input_stream(
                    config,
                    move |data: &[$sample_type], _| {
                        let epoch = capture_epoch.load(Ordering::Acquire);
                        if paused.load(Ordering::Acquire) || stopped.load(Ordering::Acquire) {
                            return;
                        }
                        let mono = $convert(data, channels);
                        enqueue_samples(&sender, &failed, epoch, &dropped_samples, mono);
                    },
                    move |_error| {
                        stream_failed.store(true, Ordering::Release);
                    },
                    None,
                )
                .map_err(|error| classify_start_error(&error.to_string()))
        }
    };
}

build_stream!(build_stream_f32, f32, f32_to_mono_i16);
build_stream!(build_stream_i16, i16, i16_to_mono_i16);
build_stream!(build_stream_u16, u16, u16_to_mono_i16);

fn forward_capture_events(
    receiver: Receiver<CaptureMessage>,
    on_event: Channel<NativeMicrophoneStreamEvent>,
    context: CaptureWorkerContext,
) {
    let mut failure_reported = false;
    while !context.stopped.load(Ordering::Acquire) {
        let dropped_sample_count = context.dropped_samples.swap(0, Ordering::AcqRel);
        if dropped_sample_count > 0
            && on_event
                .send(NativeMicrophoneStreamEvent::Gap {
                    reason: "local_buffer_full".to_string(),
                    dropped_chunks: dropped_chunk_estimate(
                        dropped_sample_count,
                        context.input_rate_hz,
                    ),
                })
                .is_err()
        {
            context.stopped.store(true, Ordering::Release);
            break;
        }

        let discarded_input_samples = context
            .discarded_pause_input_samples
            .swap(0, Ordering::AcqRel);
        let discarded_output_samples = context
            .discarded_pause_output_samples
            .swap(0, Ordering::AcqRel);
        let discarded_chunks =
            dropped_chunk_estimate(discarded_input_samples, context.input_rate_hz)
                + dropped_output_chunk_estimate(discarded_output_samples);
        if discarded_chunks > 0 {
            let _ = on_event.send(NativeMicrophoneStreamEvent::Gap {
                reason: "user_paused_capture".to_string(),
                dropped_chunks: discarded_chunks,
            });
        }

        if context.failed.load(Ordering::Acquire) && !failure_reported {
            failure_reported = true;
            let _ = on_event.send(NativeMicrophoneStreamEvent::Error {
                code: "microphone_stream_failed".to_string(),
                recoverable: true,
            });
            context.stopped.store(true, Ordering::Release);
        }

        match receiver.recv_timeout(Duration::from_millis(20)) {
            Ok(CaptureMessage::Samples { epoch, samples }) => {
                if epoch == context.capture_epoch.load(Ordering::Acquire) {
                    let chunks = context
                        .processor
                        .lock()
                        .ok()
                        .and_then(|mut value| value.process(&samples).ok());
                    match chunks {
                        Some(chunks) => {
                            for chunk in chunks {
                                if on_event
                                    .send(NativeMicrophoneStreamEvent::Chunk { chunk })
                                    .is_err()
                                {
                                    context.stopped.store(true, Ordering::Release);
                                    break;
                                }
                            }
                        }
                        None => context.failed.store(true, Ordering::Release),
                    }
                } else {
                    context
                        .discarded_pause_input_samples
                        .fetch_add(samples.len() as u64, Ordering::Relaxed);
                }
            }
            Ok(CaptureMessage::State(state)) => {
                let _ = on_event.send(NativeMicrophoneStreamEvent::State {
                    state: state.to_string(),
                });
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }
}

fn dropped_chunk_estimate(dropped_samples: u64, input_rate_hz: u32) -> u32 {
    if dropped_samples == 0 {
        return 0;
    }
    let samples_per_chunk = (u64::from(input_rate_hz) * u64::from(CHUNK_DURATION_MS)) / 1_000;
    let chunks = dropped_samples.div_ceil(samples_per_chunk.max(1));
    u32::try_from(chunks).unwrap_or(u32::MAX).max(1)
}

fn dropped_output_chunk_estimate(dropped_samples: u64) -> u32 {
    if dropped_samples == 0 {
        return 0;
    }
    u32::try_from(dropped_samples.div_ceil(SAMPLES_PER_CHUNK as u64))
        .unwrap_or(u32::MAX)
        .max(1)
}

fn stop_active_stream(mut active: ActiveMicrophoneStream) {
    active.stopped.store(true, Ordering::Release);
    drop(active.stream);
    if let Some(worker) = active.worker.take() {
        let _ = worker.join();
    }
}

fn classify_start_error(error: &str) -> String {
    let normalized = error.to_ascii_lowercase();
    if normalized.contains("permission") || normalized.contains("access denied") {
        "microphone_permission_denied".to_string()
    } else {
        "microphone_stream_failed".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn processor_emits_exact_protocol_chunks() {
        let mut processor = AudioProcessor::new(16_000).unwrap();
        let chunks = processor.process(&vec![42_i16; 3_200]).unwrap();

        assert_eq!(chunks.len(), 2);
        assert!(chunks.iter().all(|chunk| chunk.byte_length == 3_200));
        assert!(chunks.iter().all(|chunk| chunk.duration_ms == 100));
        assert!(chunks.iter().all(|chunk| chunk.sample_rate_hz == 16_000));
    }

    #[test]
    fn pause_reset_accounts_for_partial_protocol_audio() {
        let mut processor = AudioProcessor::new(16_000).unwrap();
        assert!(processor.process(&vec![42_i16; 800]).unwrap().is_empty());

        assert_eq!(processor.reset(), (0, 800));
        assert_eq!(dropped_output_chunk_estimate(800), 1);
    }

    #[test]
    fn bounded_queue_reports_every_overflow() {
        let (sender, _receiver) = mpsc::sync_channel(1);
        let dropped_samples = AtomicU64::new(0);
        let failed = AtomicBool::new(false);
        let capture_epoch = 0;

        for _ in 0..3 {
            enqueue_samples(
                &sender,
                &failed,
                capture_epoch,
                &dropped_samples,
                vec![1_i16; 1_600],
            );
        }

        assert_eq!(dropped_samples.load(Ordering::Relaxed), 3_200);
        assert_eq!(dropped_chunk_estimate(3_200, 16_000), 2);
        assert!(!failed.load(Ordering::Relaxed));
    }

    #[test]
    fn native_error_classification_never_returns_backend_details() {
        assert_eq!(
            classify_start_error("WASAPI access denied for Secret Device"),
            "microphone_permission_denied"
        );
        assert_eq!(
            classify_start_error("backend exploded for Secret Device"),
            "microphone_stream_failed"
        );
    }
}
