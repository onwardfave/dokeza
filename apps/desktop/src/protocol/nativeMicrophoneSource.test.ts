import { describe, expect, it, vi } from "vitest";
import { captureDefaultMicrophonePcmChunks } from "./nativeMicrophoneSource.js";

describe("native microphone source", () => {
  it("invokes the Tauri microphone capture command and maps chunks", async () => {
    const invoke = vi.fn().mockResolvedValue({
      device_name: "Synthetic microphone",
      input_sample_rate_hz: 48_000,
      input_channels: 2,
      output_sample_rate_hz: 16_000,
      output_channels: 1,
      chunk_duration_ms: 100,
      chunks: [
        {
          chunk_id: "mic_0",
          chunk_index: 0,
          stream: "microphone",
          format: "pcm_s16le",
          sample_rate_hz: 16_000,
          channels: 1,
          duration_ms: 100,
          timestamp_ms: 0,
          byte_length: 4,
          bytes: [1, 0, 255, 255],
        },
      ],
    });

    const chunks = await captureDefaultMicrophonePcmChunks(invoke);

    expect(invoke).toHaveBeenCalledWith("capture_default_microphone_chunks");
    expect(chunks).toEqual([
      {
        meta: {
          chunk_id: "mic_0",
          chunk_index: 0,
          stream: "microphone",
          format: "pcm_s16le",
          sample_rate_hz: 16_000,
          channels: 1,
          duration_ms: 100,
          timestamp_ms: 0,
          byte_length: 4,
        },
        bytes: Uint8Array.from([1, 0, 255, 255]),
      },
    ]);
  });
});
