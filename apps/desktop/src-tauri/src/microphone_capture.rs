use std::collections::HashMap;

use cpal::traits::{DeviceTrait, HostTrait};
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MicrophoneCaptureDevice {
    pub id: String,
    pub name: Option<String>,
    pub is_default: bool,
}

#[tauri::command]
pub fn list_microphone_capture_devices() -> Result<Vec<MicrophoneCaptureDevice>, String> {
    let host = cpal::default_host();
    let default_name = host
        .default_input_device()
        .and_then(|device| device.name().ok());
    let devices = host
        .input_devices()
        .map_err(|_| "microphone_device_list_failed".to_string())?;
    let mut ordinals = HashMap::<String, usize>::new();

    Ok(devices
        .map(|device| {
            let name = device.name().ok();
            let is_default = name.is_some() && name == default_name;
            let ordinal = next_device_ordinal(&mut ordinals, name.as_deref());
            MicrophoneCaptureDevice {
                id: input_device_id(name.as_deref(), ordinal),
                name,
                is_default,
            }
        })
        .collect())
}

pub(crate) fn select_input_device(
    host: &cpal::Host,
    device_id: Option<&str>,
) -> Result<cpal::Device, String> {
    match device_id.filter(|id| !id.trim().is_empty() && *id != "default") {
        Some(id) => {
            let devices = host
                .input_devices()
                .map_err(|_| "microphone_device_unavailable".to_string())?;
            let mut ordinals = HashMap::<String, usize>::new();
            for device in devices {
                let name = device.name().ok();
                let ordinal = next_device_ordinal(&mut ordinals, name.as_deref());
                if input_device_id(name.as_deref(), ordinal) == id {
                    return Ok(device);
                }
            }
            Err("microphone_device_unavailable".to_string())
        }
        None => host
            .default_input_device()
            .ok_or_else(|| "microphone_default_device_missing".to_string()),
    }
}

fn next_device_ordinal(ordinals: &mut HashMap<String, usize>, name: Option<&str>) -> usize {
    let key = name.unwrap_or("<unnamed>").trim().to_ascii_lowercase();
    let ordinal = *ordinals.get(&key).unwrap_or(&0);
    ordinals.insert(key, ordinal + 1);
    ordinal
}

fn input_device_id(name: Option<&str>, ordinal: usize) -> String {
    let normalized = name.unwrap_or("<unnamed>").trim().to_ascii_lowercase();
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in normalized.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("mic_{hash:016x}_{ordinal}")
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
        assert_eq!(
            i16_to_mono_i16(&[1000, 3000, -1000, -3000], 2),
            vec![2000, -2000]
        );
    }

    #[test]
    fn u16_samples_are_centered_around_zero() {
        let samples = u16_to_mono_i16(&[32_768, 65_535, 0, 32_768], 2);

        assert_eq!(samples[0], 16_383);
        assert_eq!(samples[1], -16_384);
    }

    #[test]
    fn capture_device_ids_are_stable_name_fingerprints_with_duplicate_ordinals() {
        let first = input_device_id(Some("Array Microphone"), 0);
        let repeated = input_device_id(Some(" array microphone "), 0);
        let duplicate = input_device_id(Some("Array Microphone"), 1);

        assert_eq!(first, repeated);
        assert_ne!(first, duplicate);
        assert!(first.starts_with("mic_"));
    }

    fn expect_approx(actual: i16, expected: i16, tolerance: i16) {
        assert!((actual - expected).abs() <= tolerance);
    }
}
