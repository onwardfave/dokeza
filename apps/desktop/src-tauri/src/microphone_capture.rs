use std::{
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

use cpal::{
    traits::{DeviceTrait, HostTrait, StreamTrait},
    SampleFormat, StreamConfig,
};
use serde::Serialize;

const DEFAULT_CAPTURE_DURATION_MS: u64 = 1000;
const TARGET_SAMPLE_RATE_HZ: u32 = 16_000;
const TARGET_CHANNELS: u16 = 1;
const DEFAULT_CHUNK_DURATION_MS: u32 = 100;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CapturedMicrophoneChunk {
    pub chunk_id: String,
    pub chunk_index: u32,
    pub stream: String,
    pub format: String,
    pub sample_rate_hz: u32,
    pub channels: u16,
    pub duration_ms: u32,
    pub timestamp_ms: u32,
    pub byte_length: usize,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CapturedMicrophoneChunksReport {
    pub device_name: Option<String>,
    pub input_sample_rate_hz: u32,
    pub input_channels: u16,
    pub output_sample_rate_hz: u32,
    pub output_channels: u16,
    pub chunk_duration_ms: u32,
    pub chunks: Vec<CapturedMicrophoneChunk>,
}

#[tauri::command]
pub fn capture_default_microphone_chunks() -> Result<CapturedMicrophoneChunksReport, String> {
    capture_default_microphone_chunks_for(Duration::from_millis(DEFAULT_CAPTURE_DURATION_MS))
}

pub fn capture_default_microphone_chunks_for(
    duration: Duration,
) -> Result<CapturedMicrophoneChunksReport, String> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| "microphone_default_device_missing".to_string())?;
    let device_name = device.name().ok();
    let supported_config = device
        .default_input_config()
        .map_err(|error| error.to_string())?;
    let sample_format = supported_config.sample_format();
    let stream_config: StreamConfig = supported_config.into();
    let input_sample_rate_hz = stream_config.sample_rate.0;
    let input_channels = stream_config.channels.max(1);
    let captured_samples = Arc::new(Mutex::new(Vec::<i16>::new()));

    let stream = match sample_format {
        SampleFormat::F32 => build_collecting_stream_f32(
            &device,
            &stream_config,
            input_channels,
            captured_samples.clone(),
        ),
        SampleFormat::I16 => build_collecting_stream_i16(
            &device,
            &stream_config,
            input_channels,
            captured_samples.clone(),
        ),
        SampleFormat::U16 => build_collecting_stream_u16(
            &device,
            &stream_config,
            input_channels,
            captured_samples.clone(),
        ),
        other => Err(format!("microphone_sample_format_unsupported:{other:?}")),
    }?;

    stream.play().map_err(|error| error.to_string())?;
    thread::sleep(duration);
    drop(stream);

    let samples = captured_samples
        .lock()
        .map_err(|_| "microphone_capture_samples_lock_poisoned".to_string())?
        .clone();
    let output_samples =
        resample_mono_nearest(&samples, input_sample_rate_hz, TARGET_SAMPLE_RATE_HZ);
    let bytes = encode_pcm_s16le(&output_samples);
    let chunks = chunk_pcm_s16le_bytes(&bytes, DEFAULT_CHUNK_DURATION_MS);

    Ok(CapturedMicrophoneChunksReport {
        device_name,
        input_sample_rate_hz,
        input_channels,
        output_sample_rate_hz: TARGET_SAMPLE_RATE_HZ,
        output_channels: TARGET_CHANNELS,
        chunk_duration_ms: DEFAULT_CHUNK_DURATION_MS,
        chunks,
    })
}

fn build_collecting_stream_f32(
    device: &cpal::Device,
    config: &StreamConfig,
    channels: u16,
    captured_samples: Arc<Mutex<Vec<i16>>>,
) -> Result<cpal::Stream, String> {
    device
        .build_input_stream(
            config,
            move |data: &[f32], _| {
                append_samples(&captured_samples, &f32_to_mono_i16(data, channels))
            },
            move |_error| {},
            None,
        )
        .map_err(|error| error.to_string())
}

fn build_collecting_stream_i16(
    device: &cpal::Device,
    config: &StreamConfig,
    channels: u16,
    captured_samples: Arc<Mutex<Vec<i16>>>,
) -> Result<cpal::Stream, String> {
    device
        .build_input_stream(
            config,
            move |data: &[i16], _| {
                append_samples(&captured_samples, &i16_to_mono_i16(data, channels))
            },
            move |_error| {},
            None,
        )
        .map_err(|error| error.to_string())
}

fn build_collecting_stream_u16(
    device: &cpal::Device,
    config: &StreamConfig,
    channels: u16,
    captured_samples: Arc<Mutex<Vec<i16>>>,
) -> Result<cpal::Stream, String> {
    device
        .build_input_stream(
            config,
            move |data: &[u16], _| {
                append_samples(&captured_samples, &u16_to_mono_i16(data, channels))
            },
            move |_error| {},
            None,
        )
        .map_err(|error| error.to_string())
}

fn append_samples(captured_samples: &Arc<Mutex<Vec<i16>>>, samples: &[i16]) {
    if let Ok(mut captured) = captured_samples.lock() {
        captured.extend_from_slice(samples);
    }
}

pub fn f32_to_mono_i16(samples: &[f32], channels: u16) -> Vec<i16> {
    samples
        .chunks(usize::from(channels.max(1)))
        .map(|frame| {
            let sum = frame
                .iter()
                .map(|sample| sample.clamp(-1.0, 1.0))
                .sum::<f32>();
            let average = sum / frame.len().max(1) as f32;
            (average * f32::from(i16::MAX)).round() as i16
        })
        .collect()
}

pub fn i16_to_mono_i16(samples: &[i16], channels: u16) -> Vec<i16> {
    samples
        .chunks(usize::from(channels.max(1)))
        .map(|frame| {
            let sum = frame.iter().map(|sample| i32::from(*sample)).sum::<i32>();
            (sum / i32::try_from(frame.len().max(1)).unwrap_or(1)) as i16
        })
        .collect()
}

pub fn u16_to_mono_i16(samples: &[u16], channels: u16) -> Vec<i16> {
    samples
        .chunks(usize::from(channels.max(1)))
        .map(|frame| {
            let sum = frame
                .iter()
                .map(|sample| i32::from(*sample) - 32_768)
                .sum::<i32>();
            (sum / i32::try_from(frame.len().max(1)).unwrap_or(1)) as i16
        })
        .collect()
}

pub fn resample_mono_nearest(samples: &[i16], input_rate_hz: u32, output_rate_hz: u32) -> Vec<i16> {
    if samples.is_empty() || input_rate_hz == 0 || input_rate_hz == output_rate_hz {
        return samples.to_vec();
    }

    let output_len =
        ((samples.len() as u64 * u64::from(output_rate_hz)) / u64::from(input_rate_hz)) as usize;
    (0..output_len)
        .map(|output_index| {
            let input_index = (output_index as u64 * u64::from(input_rate_hz)
                / u64::from(output_rate_hz)) as usize;
            samples[input_index.min(samples.len() - 1)]
        })
        .collect()
}

pub fn encode_pcm_s16le(samples: &[i16]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(samples.len() * 2);
    for sample in samples {
        bytes.extend_from_slice(&sample.to_le_bytes());
    }
    bytes
}

pub fn chunk_pcm_s16le_bytes(bytes: &[u8], chunk_duration_ms: u32) -> Vec<CapturedMicrophoneChunk> {
    let samples_per_chunk = (TARGET_SAMPLE_RATE_HZ as usize * chunk_duration_ms as usize) / 1000;
    let bytes_per_chunk = samples_per_chunk * 2;
    if bytes_per_chunk == 0 {
        return Vec::new();
    }

    bytes
        .chunks(bytes_per_chunk)
        .enumerate()
        .map(|(index, chunk)| {
            let timestamp_ms = index as u32 * chunk_duration_ms;
            let duration_ms = ((chunk.len() / 2) as u32 * 1000) / TARGET_SAMPLE_RATE_HZ;
            CapturedMicrophoneChunk {
                chunk_id: format!("mic_{index}"),
                chunk_index: index as u32,
                stream: "microphone".to_string(),
                format: "pcm_s16le".to_string(),
                sample_rate_hz: TARGET_SAMPLE_RATE_HZ,
                channels: TARGET_CHANNELS,
                duration_ms: duration_ms.max(1),
                timestamp_ms,
                byte_length: chunk.len(),
                bytes: chunk.to_vec(),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn f32_samples_are_clamped_downmixed_and_scaled() {
        let samples = f32_to_mono_i16(&[-2.0, 1.0, 0.5, -0.5], 2);

        expect_approx(samples[0], 0, 1);
        expect_approx(samples[1], 0, 1);
    }

    #[test]
    fn i16_stereo_samples_are_downmixed_to_mono() {
        let samples = i16_to_mono_i16(&[1000, 3000, -1000, -3000], 2);

        assert_eq!(samples, vec![2000, -2000]);
    }

    #[test]
    fn u16_samples_are_centered_around_zero() {
        let samples = u16_to_mono_i16(&[32_768, 65_535, 0, 32_768], 2);

        assert_eq!(samples[0], 16_383);
        assert_eq!(samples[1], -16_384);
    }

    #[test]
    fn resampler_outputs_target_rate_length() {
        let input = vec![1_i16; 48_000];
        let output = resample_mono_nearest(&input, 48_000, 16_000);

        assert_eq!(output.len(), 16_000);
    }

    #[test]
    fn chunker_outputs_protocol_compatible_100ms_chunks() {
        let samples = vec![42_i16; 3_200];
        let bytes = encode_pcm_s16le(&samples);
        let chunks = chunk_pcm_s16le_bytes(&bytes, 100);

        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].chunk_id, "mic_0");
        assert_eq!(chunks[0].chunk_index, 0);
        assert_eq!(chunks[0].stream, "microphone");
        assert_eq!(chunks[0].format, "pcm_s16le");
        assert_eq!(chunks[0].sample_rate_hz, 16_000);
        assert_eq!(chunks[0].channels, 1);
        assert_eq!(chunks[0].duration_ms, 100);
        assert_eq!(chunks[0].timestamp_ms, 0);
        assert_eq!(chunks[0].byte_length, 3_200);
        assert_eq!(chunks[0].bytes.len(), 3_200);
        assert_eq!(chunks[1].timestamp_ms, 100);
    }

    fn expect_approx(actual: i16, expected: i16, tolerance: i16) {
        assert!((actual - expected).abs() <= tolerance);
    }
}
