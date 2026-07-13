use audioadapter_buffers::direct::InterleavedSlice;
use rubato::{Fft, FixedSync, Resampler};

const TARGET_SAMPLE_RATE_HZ: u32 = 16_000;
const PROCESS_WINDOW_MS: usize = 10;

pub struct StreamingPcmResampler {
    inner: ResamplerKind,
}

enum ResamplerKind {
    Passthrough,
    Fft {
        resampler: Box<Fft<f64>>,
        pending: Vec<f64>,
    },
}

impl StreamingPcmResampler {
    pub fn new(input_rate_hz: u32) -> Result<Self, String> {
        if input_rate_hz == 0 {
            return Err("microphone_invalid_sample_rate".to_string());
        }

        if input_rate_hz == TARGET_SAMPLE_RATE_HZ {
            return Ok(Self {
                inner: ResamplerKind::Passthrough,
            });
        }

        let requested_chunk_frames =
            usize::try_from(input_rate_hz).unwrap_or(1) * PROCESS_WINDOW_MS / 1_000;
        let resampler = Fft::<f64>::new(
            usize::try_from(input_rate_hz).unwrap_or(1),
            TARGET_SAMPLE_RATE_HZ as usize,
            requested_chunk_frames.max(1),
            1,
            FixedSync::Input,
        )
        .map_err(|_| "microphone_resampler_initialization_failed".to_string())?;

        Ok(Self {
            inner: ResamplerKind::Fft {
                resampler: Box::new(resampler),
                pending: Vec::new(),
            },
        })
    }

    pub fn push(&mut self, samples: &[i16]) -> Result<Vec<i16>, String> {
        match &mut self.inner {
            ResamplerKind::Passthrough => Ok(samples.to_vec()),
            ResamplerKind::Fft { resampler, pending } => {
                pending.extend(samples.iter().map(|sample| f64::from(*sample) / 32_768.0));
                let mut output_samples = Vec::new();

                loop {
                    let input_frames = resampler.input_frames_next();
                    if pending.len() < input_frames {
                        break;
                    }

                    let output_capacity = resampler.output_frames_max();
                    let input = InterleavedSlice::new(pending.as_slice(), 1, pending.len())
                        .map_err(|_| "microphone_resampler_input_failed".to_string())?;
                    let mut output_buffer = vec![0.0_f64; output_capacity];
                    let mut output =
                        InterleavedSlice::new_mut(output_buffer.as_mut_slice(), 1, output_capacity)
                            .map_err(|_| "microphone_resampler_output_failed".to_string())?;
                    let (consumed, produced) = resampler
                        .process_into_buffer(&input, &mut output, None)
                        .map_err(|_| "microphone_resampler_processing_failed".to_string())?;

                    pending.drain(..consumed);
                    output_samples.extend(
                        output_buffer
                            .into_iter()
                            .take(produced)
                            .map(normalized_f64_to_i16),
                    );
                }

                Ok(output_samples)
            }
        }
    }

    pub fn reset(&mut self) -> usize {
        match &mut self.inner {
            ResamplerKind::Passthrough => 0,
            ResamplerKind::Fft { resampler, pending } => {
                let discarded_input_frames = pending.len();
                pending.clear();
                resampler.reset();
                discarded_input_frames
            }
        }
    }
}

fn normalized_f64_to_i16(sample: f64) -> i16 {
    (sample.clamp(-1.0, 1.0) * f64::from(i16::MAX)).round() as i16
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fft_resampler_produces_the_target_rate_across_irregular_batches() {
        let mut resampler = StreamingPcmResampler::new(48_000).unwrap();
        let input = vec![1_000_i16; 48_000];
        let mut output = Vec::new();

        for batch in input.chunks(317) {
            output.extend(resampler.push(batch).unwrap());
        }

        assert_eq!(output.len(), 16_000);
    }

    #[test]
    fn reset_discards_partial_input_between_capture_periods() {
        let mut resampler = StreamingPcmResampler::new(48_000).unwrap();
        assert!(resampler.push(&vec![1_i16; 479]).unwrap().is_empty());

        assert_eq!(resampler.reset(), 479);

        assert!(resampler.push(&[1_i16; 1]).unwrap().is_empty());
    }

    #[test]
    fn target_rate_audio_is_not_resampled() {
        let mut resampler = StreamingPcmResampler::new(16_000).unwrap();
        let input = vec![-4_i16, 5, 6];

        assert_eq!(resampler.push(&input).unwrap(), input);
    }
}
