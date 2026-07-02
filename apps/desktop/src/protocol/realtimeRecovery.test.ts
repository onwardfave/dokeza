import { describe, expect, it } from "vitest";
import {
  calculateReconnectDelayMs,
  InMemoryAudioBuffer,
} from "./realtimeRecovery.js";

function chunk(index: number, startMs: number, durationMs = 100, bytes = 4) {
  return {
    meta: {
      chunk_id: `aud_${index}`,
      chunk_index: index,
      stream: "microphone" as const,
      format: "pcm_s16le" as const,
      sample_rate_hz: 16000 as const,
      channels: 1 as const,
      duration_ms: durationMs,
      timestamp_ms: startMs,
      byte_length: bytes,
    },
    bytes: new Uint8Array(bytes),
  };
}

describe("realtime recovery primitives", () => {
  it("calculates bounded exponential reconnect delays", () => {
    expect(calculateReconnectDelayMs(0)).toBe(1000);
    expect(calculateReconnectDelayMs(1)).toBe(2000);
    expect(calculateReconnectDelayMs(2)).toBe(4000);
    expect(calculateReconnectDelayMs(10)).toBe(30000);
  });

  it("retains queued chunks within duration and byte limits", () => {
    const buffer = new InMemoryAudioBuffer({ maxDurationMs: 250, maxBytes: 12 });

    buffer.enqueue(chunk(0, 0));
    buffer.enqueue(chunk(1, 100));

    expect(buffer.snapshot()).toEqual({
      pendingChunks: 2,
      pendingBytes: 8,
      pendingDurationMs: 200,
      pendingGaps: 0,
    });
  });

  it("drops oldest chunks and records gap metadata when limits overflow", () => {
    const buffer = new InMemoryAudioBuffer({ maxDurationMs: 200, maxBytes: 12 });

    buffer.enqueue(chunk(0, 0));
    buffer.enqueue(chunk(1, 100));
    buffer.enqueue(chunk(2, 200));

    expect(buffer.drainChunks().map((entry) => entry.meta.chunk_id)).toEqual(["aud_1", "aud_2"]);
    expect(buffer.drainGaps()).toEqual([
      {
        stream: "microphone",
        start_ms: 0,
        end_ms: 100,
        dropped_chunks: 1,
        reason: "local_buffer_full",
      },
    ]);
  });

  it("clears queued chunks after draining but keeps no stale gap records", () => {
    const buffer = new InMemoryAudioBuffer({ maxDurationMs: 200, maxBytes: 12 });
    buffer.enqueue(chunk(0, 0));

    expect(buffer.drainChunks()).toHaveLength(1);
    expect(buffer.drainChunks()).toEqual([]);
    expect(buffer.drainGaps()).toEqual([]);
  });
});
