import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import type { SyntheticPcmChunk } from "./realtimeClient.js";

export interface NativeMicrophoneChunk {
  chunk_id: string;
  chunk_index: number;
  stream: "microphone";
  format: "pcm_s16le";
  sample_rate_hz: 16000;
  channels: 1;
  duration_ms: number;
  timestamp_ms: number;
  byte_length: number;
  bytes: number[];
}

export interface NativeMicrophoneCaptureReport {
  device_name?: string;
  input_sample_rate_hz: number;
  input_channels: number;
  output_sample_rate_hz: 16000;
  output_channels: 1;
  chunk_duration_ms: number;
  chunks: NativeMicrophoneChunk[];
}

export type NativeInvoke = <T>(command: string) => Promise<T>;

export async function captureDefaultMicrophonePcmChunks(
  invoke: NativeInvoke = tauriInvoke,
): Promise<SyntheticPcmChunk[]> {
  const report = await invoke<NativeMicrophoneCaptureReport>("capture_default_microphone_chunks");
  return report.chunks.map((chunk) => ({
    meta: {
      chunk_id: chunk.chunk_id,
      chunk_index: chunk.chunk_index,
      stream: chunk.stream,
      format: chunk.format,
      sample_rate_hz: chunk.sample_rate_hz,
      channels: chunk.channels,
      duration_ms: chunk.duration_ms,
      timestamp_ms: chunk.timestamp_ms,
      byte_length: chunk.byte_length,
    },
    bytes: Uint8Array.from(chunk.bytes),
  }));
}
