use std::{
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    thread,
    time::Duration,
};

use cpal::{
    traits::{DeviceTrait, HostTrait, StreamTrait},
    SampleFormat, StreamConfig,
};
use serde::Serialize;

const DEFAULT_PROBE_DURATION_MS: u64 = 250;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AudioProbeReport {
    pub device_name: Option<String>,
    pub sample_rate_hz: u32,
    pub channels: u16,
    pub sample_format: String,
    pub captured_frames: u64,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AudioInputDeviceSummary {
    pub name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AudioOutputDeviceSummary {
    pub name: Option<String>,
}

pub fn list_input_devices() -> Result<Vec<AudioInputDeviceSummary>, String> {
    let host = cpal::default_host();
    let devices = host.input_devices().map_err(|error| error.to_string())?;

    Ok(devices
        .map(|device| AudioInputDeviceSummary {
            name: device.name().ok(),
        })
        .collect())
}

pub fn list_output_devices() -> Result<Vec<AudioOutputDeviceSummary>, String> {
    let host = cpal::default_host();
    let devices = host.output_devices().map_err(|error| error.to_string())?;

    Ok(devices
        .map(|device| AudioOutputDeviceSummary {
            name: device.name().ok(),
        })
        .collect())
}

#[tauri::command]
pub fn probe_default_microphone() -> Result<AudioProbeReport, String> {
    probe_default_microphone_for(Duration::from_millis(DEFAULT_PROBE_DURATION_MS))
}

#[tauri::command]
pub fn list_microphone_devices() -> Result<Vec<AudioInputDeviceSummary>, String> {
    list_input_devices()
}

#[tauri::command]
pub fn list_system_audio_output_devices() -> Result<Vec<AudioOutputDeviceSummary>, String> {
    list_output_devices()
}

pub fn probe_default_microphone_for(duration: Duration) -> Result<AudioProbeReport, String> {
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
    let frame_counter = Arc::new(AtomicU64::new(0));

    let stream = match sample_format {
        SampleFormat::F32 => {
            build_counting_stream::<f32>(&device, &stream_config, frame_counter.clone())
        }
        SampleFormat::I16 => {
            build_counting_stream::<i16>(&device, &stream_config, frame_counter.clone())
        }
        SampleFormat::U16 => {
            build_counting_stream::<u16>(&device, &stream_config, frame_counter.clone())
        }
        other => Err(format!("microphone_sample_format_unsupported:{other:?}")),
    }?;

    stream.play().map_err(|error| error.to_string())?;
    thread::sleep(duration);
    drop(stream);

    Ok(AudioProbeReport {
        device_name,
        sample_rate_hz: stream_config.sample_rate.0,
        channels: stream_config.channels,
        sample_format: format!("{sample_format:?}"),
        captured_frames: frame_counter.load(Ordering::Relaxed),
        duration_ms: duration.as_millis().try_into().unwrap_or(u64::MAX),
    })
}

fn build_counting_stream<T>(
    device: &cpal::Device,
    config: &StreamConfig,
    frame_counter: Arc<AtomicU64>,
) -> Result<cpal::Stream, String>
where
    T: cpal::SizedSample,
{
    let channels = u64::from(config.channels.max(1));
    device
        .build_input_stream(
            config,
            move |data: &[T], _| {
                let frames = (data.len() as u64) / channels;
                frame_counter.fetch_add(frames, Ordering::Relaxed);
            },
            move |_error| {},
            None,
        )
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn audio_probe_report_preserves_metadata_without_audio_content() {
        let report = AudioProbeReport {
            device_name: Some("Synthetic microphone".to_string()),
            sample_rate_hz: 48_000,
            channels: 2,
            sample_format: "F32".to_string(),
            captured_frames: 12_000,
            duration_ms: 250,
        };

        assert_eq!(report.sample_rate_hz, 48_000);
        assert_eq!(report.channels, 2);
        assert_eq!(report.captured_frames, 12_000);
    }

    #[test]
    fn input_device_summary_keeps_only_device_name() {
        let summary = AudioInputDeviceSummary {
            name: Some("Synthetic microphone".to_string()),
        };

        assert_eq!(summary.name.as_deref(), Some("Synthetic microphone"));
    }

    #[test]
    fn output_device_summary_keeps_only_device_name() {
        let summary = AudioOutputDeviceSummary {
            name: Some("Synthetic speaker".to_string()),
        };

        assert_eq!(summary.name.as_deref(), Some("Synthetic speaker"));
    }
}
