import { describe, expect, it, vi } from "vitest";
import {
  ContinuousMicrophoneCaptureController,
  type MicrophoneCaptureScheduler,
} from "./microphoneCaptureController.js";
import type { DroppedAudioGap } from "./realtimeRecovery.js";
import type { SyntheticPcmChunk } from "./realtimeClient.js";

class ManualScheduler implements MicrophoneCaptureScheduler {
  readonly delays: number[] = [];
  private readonly callbacks = new Map<number, () => void>();
  private nextTimerId = 1;

  setTimeout(callback: () => void, delayMs: number): number {
    const timerId = this.nextTimerId;
    this.nextTimerId += 1;
    this.delays.push(delayMs);
    this.callbacks.set(timerId, callback);
    return timerId;
  }

  clearTimeout(timerId: number): void {
    this.callbacks.delete(timerId);
  }

  runNext(): void {
    const [timerId, callback] = this.callbacks.entries().next().value ?? [];
    if (timerId === undefined || callback === undefined) {
      return;
    }
    this.callbacks.delete(timerId);
    callback();
  }
}

function chunk(chunkIndex: number, timestampMs: number, durationMs = 100): SyntheticPcmChunk {
  return {
    meta: {
      chunk_id: `native_${chunkIndex}`,
      chunk_index: chunkIndex,
      stream: "microphone",
      format: "pcm_s16le",
      sample_rate_hz: 16_000,
      channels: 1,
      duration_ms: durationMs,
      timestamp_ms: timestampMs,
      byte_length: 4,
    },
    bytes: Uint8Array.from([1, 0, 2, 0]),
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("ContinuousMicrophoneCaptureController", () => {
  it("streams repeated capture windows with monotonic chunk metadata", async () => {
    const scheduler = new ManualScheduler();
    const capture = vi
      .fn()
      .mockResolvedValueOnce([chunk(0, 0), chunk(1, 100)])
      .mockResolvedValueOnce([chunk(0, 0)]);
    const sentChunks: SyntheticPcmChunk[] = [];

    const controller = new ContinuousMicrophoneCaptureController({
      deviceId: "input_1",
      scheduler,
      capture,
      sendAudioChunk: (pcmChunk) => sentChunks.push(pcmChunk),
      sendAudioGap: vi.fn(),
    });

    controller.start();
    await flushPromises();
    scheduler.runNext();
    await flushPromises();

    expect(capture).toHaveBeenCalledWith({ deviceId: "input_1" });
    expect(sentChunks.map((sent) => sent.meta.chunk_id)).toEqual(["mic_0", "mic_1", "mic_2"]);
    expect(sentChunks.map((sent) => sent.meta.chunk_index)).toEqual([0, 1, 2]);
    expect(sentChunks.map((sent) => sent.meta.timestamp_ms)).toEqual([0, 100, 200]);
    expect(controller.snapshot).toMatchObject({
      state: "capturing",
      deviceId: "input_1",
      chunksSent: 3,
      nextChunkIndex: 3,
      streamTimeMs: 300,
    });
  });

  it("emits a user pause gap and resumes later capture", async () => {
    const scheduler = new ManualScheduler();
    const capture = vi.fn().mockResolvedValue([chunk(0, 0)]);
    const sentGaps: DroppedAudioGap[] = [];

    const controller = new ContinuousMicrophoneCaptureController({
      captureWindowMs: 500,
      scheduler,
      capture,
      sendAudioChunk: vi.fn(),
      sendAudioGap: (gap) => sentGaps.push(gap),
    });

    controller.start();
    await flushPromises();
    controller.pause();
    controller.resume();
    scheduler.runNext();
    await flushPromises();

    expect(sentGaps).toEqual([
      {
        stream: "microphone",
        start_ms: 100,
        end_ms: 600,
        dropped_chunks: 5,
        reason: "user_paused_capture",
      },
    ]);
    expect(controller.snapshot.state).toBe("capturing");
    expect(controller.snapshot.chunksSent).toBe(2);
  });

  it("marks device capture failures and emits a device unavailable gap", async () => {
    const capture = vi.fn().mockRejectedValue(new Error("device lost"));
    const sentGaps: DroppedAudioGap[] = [];

    const controller = new ContinuousMicrophoneCaptureController({
      captureWindowMs: 400,
      capture,
      sendAudioChunk: vi.fn(),
      sendAudioGap: (gap) => sentGaps.push(gap),
    });

    controller.start();
    await flushPromises();

    expect(controller.snapshot).toMatchObject({
      state: "failed",
      lastErrorCode: "microphone_capture_failed",
      lastGapReason: "device_unavailable",
    });
    expect(sentGaps).toEqual([
      {
        stream: "microphone",
        start_ms: 0,
        end_ms: 400,
        dropped_chunks: 4,
        reason: "device_unavailable",
      },
    ]);
  });
});
