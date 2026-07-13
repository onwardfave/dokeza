import { describe, expect, it, vi } from "vitest";
import {
  ContinuousMicrophoneCaptureController,
  type MicrophoneCaptureClock,
} from "./microphoneCaptureController.js";
import type {
  NativeMicrophoneStreamEvent,
  NativeMicrophoneStreamHandle,
  NativeMicrophoneStreamSource,
} from "./nativeMicrophoneSource.js";
import type { DroppedAudioGap } from "./realtimeRecovery.js";
import type { SyntheticPcmChunk } from "./realtimeClient.js";

class ManualClock implements MicrophoneCaptureClock {
  value = 1_000;

  now(): number {
    return this.value;
  }
}

class FakeNativeStream implements NativeMicrophoneStreamSource, NativeMicrophoneStreamHandle {
  readonly pause = vi.fn(async () => undefined);
  readonly resume = vi.fn(async () => undefined);
  readonly stop = vi.fn(async () => undefined);
  private onEvent: ((event: NativeMicrophoneStreamEvent) => void) | undefined;

  async start(
    _deviceId: string | undefined,
    onEvent: (event: NativeMicrophoneStreamEvent) => void,
  ): Promise<NativeMicrophoneStreamHandle> {
    this.onEvent = onEvent;
    return this;
  }

  emit(event: NativeMicrophoneStreamEvent): void {
    this.onEvent?.(event);
  }
}

function nativeChunk(): NativeMicrophoneStreamEvent {
  return {
    type: "chunk",
    chunk: {
      stream: "microphone",
      format: "pcm_s16le",
      sample_rate_hz: 16_000,
      channels: 1,
      duration_ms: 100,
      byte_length: 3_200,
      bytes: Array.from({ length: 3_200 }, () => 0),
    },
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("ContinuousMicrophoneCaptureController", () => {
  it("streams native events with monotonic protocol metadata", async () => {
    const source = new FakeNativeStream();
    const sentChunks: SyntheticPcmChunk[] = [];
    const controller = new ContinuousMicrophoneCaptureController({
      deviceId: "mic_deadbeef_0",
      source,
      sendAudioChunk: (chunk) => sentChunks.push(chunk),
      sendAudioGap: vi.fn(),
    });

    controller.start();
    await flushPromises();
    source.emit(nativeChunk());
    source.emit(nativeChunk());

    expect(sentChunks.map((chunk) => chunk.meta.chunk_id)).toEqual(["mic_0", "mic_1"]);
    expect(sentChunks.map((chunk) => chunk.meta.timestamp_ms)).toEqual([0, 100]);
    expect(controller.snapshot).toMatchObject({
      state: "capturing",
      deviceId: "mic_deadbeef_0",
      chunksSent: 2,
      nextChunkIndex: 2,
      streamTimeMs: 200,
    });
  });

  it("measures a pause gap and advances the later chunk timeline", async () => {
    const source = new FakeNativeStream();
    const clock = new ManualClock();
    const sentChunks: SyntheticPcmChunk[] = [];
    const sentGaps: DroppedAudioGap[] = [];
    const controller = new ContinuousMicrophoneCaptureController({
      source,
      clock,
      sendAudioChunk: (chunk) => sentChunks.push(chunk),
      sendAudioGap: (gap) => sentGaps.push(gap),
    });

    controller.start();
    await flushPromises();
    source.emit(nativeChunk());
    controller.pause();
    source.emit({ type: "state", state: "paused" });
    clock.value += 550;
    controller.resume();
    source.emit({ type: "state", state: "capturing" });
    source.emit(nativeChunk());

    expect(sentGaps).toEqual([
      {
        stream: "microphone",
        start_ms: 100,
        end_ms: 650,
        dropped_chunks: 6,
        reason: "user_paused_capture",
      },
    ]);
    expect(sentChunks[1]?.meta.timestamp_ms).toBe(650);
    expect(source.pause).toHaveBeenCalledOnce();
    expect(source.resume).toHaveBeenCalledOnce();
  });

  it("maps native overflow to an explicit timeline gap", async () => {
    const source = new FakeNativeStream();
    const sentGaps: DroppedAudioGap[] = [];
    const controller = new ContinuousMicrophoneCaptureController({
      source,
      sendAudioChunk: vi.fn(),
      sendAudioGap: (gap) => sentGaps.push(gap),
    });

    controller.start();
    await flushPromises();
    source.emit({ type: "gap", reason: "local_buffer_full", dropped_chunks: 3 });

    expect(sentGaps[0]).toEqual({
      stream: "microphone",
      start_ms: 0,
      end_ms: 300,
      dropped_chunks: 3,
      reason: "local_buffer_full",
    });
    expect(controller.snapshot.streamTimeMs).toBe(300);
  });

  it("fails safely when the native device stream errors", async () => {
    const source = new FakeNativeStream();
    const sentGaps: DroppedAudioGap[] = [];
    const controller = new ContinuousMicrophoneCaptureController({
      source,
      sendAudioChunk: vi.fn(),
      sendAudioGap: (gap) => sentGaps.push(gap),
    });

    controller.start();
    await flushPromises();
    source.emit({ type: "error", code: "microphone_stream_failed", recoverable: true });

    expect(controller.snapshot).toMatchObject({
      state: "failed",
      lastErrorCode: "microphone_stream_failed",
      lastGapReason: "device_unavailable",
    });
    expect(sentGaps[0]?.reason).toBe("device_unavailable");
  });

  it("stops a native handle that resolves after the controller was stopped", async () => {
    let resolveStart: ((handle: NativeMicrophoneStreamHandle) => void) | undefined;
    const handle: NativeMicrophoneStreamHandle = {
      pause: vi.fn(async () => undefined),
      resume: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
    };
    const source: NativeMicrophoneStreamSource = {
      start: () =>
        new Promise((resolve) => {
          resolveStart = resolve;
        }),
    };
    const controller = new ContinuousMicrophoneCaptureController({
      source,
      sendAudioChunk: vi.fn(),
      sendAudioGap: vi.fn(),
    });

    controller.start();
    controller.stop();
    resolveStart?.(handle);
    await flushPromises();

    expect(handle.stop).toHaveBeenCalledOnce();
    expect(controller.snapshot.state).toBe("stopped");
  });
});
