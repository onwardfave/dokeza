import type { DroppedAudioGap } from "./realtimeRecovery.js";
import type { SyntheticPcmChunk } from "./realtimeClient.js";

export type MicrophoneCaptureState = "idle" | "capturing" | "paused" | "stopped" | "failed";

export interface MicrophoneCaptureSnapshot {
  state: MicrophoneCaptureState;
  deviceId?: string;
  chunksSent: number;
  nextChunkIndex: number;
  streamTimeMs: number;
  lastErrorCode?: string;
  lastGapReason?: DroppedAudioGap["reason"];
}

export interface MicrophoneCaptureScheduler {
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(timerId: number): void;
}

export interface CaptureMicrophoneBatchInput {
  deviceId?: string;
}

export interface ContinuousMicrophoneCaptureControllerOptions {
  deviceId?: string;
  captureWindowMs?: number;
  chunkDurationMs?: number;
  scheduler?: MicrophoneCaptureScheduler;
  capture(input: CaptureMicrophoneBatchInput): Promise<SyntheticPcmChunk[]>;
  sendAudioChunk(chunk: SyntheticPcmChunk): void;
  sendAudioGap(gap: DroppedAudioGap): void;
  onStateChange?(snapshot: MicrophoneCaptureSnapshot): void;
}

export class ContinuousMicrophoneCaptureController {
  private readonly captureWindowMs: number;
  private readonly chunkDurationMs: number;
  private readonly scheduler: MicrophoneCaptureScheduler;
  private timerId: number | undefined;
  private captureRunId = 0;
  private state: MicrophoneCaptureState = "idle";
  private chunksSent = 0;
  private nextChunkIndex = 0;
  private streamTimeMs = 0;
  private lastErrorCode: string | undefined;
  private lastGapReason: DroppedAudioGap["reason"] | undefined;

  constructor(private readonly options: ContinuousMicrophoneCaptureControllerOptions) {
    this.captureWindowMs = options.captureWindowMs ?? 1000;
    this.chunkDurationMs = options.chunkDurationMs ?? 100;
    this.scheduler = options.scheduler ?? new BrowserMicrophoneCaptureScheduler();
  }

  get snapshot(): MicrophoneCaptureSnapshot {
    const snapshot: MicrophoneCaptureSnapshot = {
      state: this.state,
      chunksSent: this.chunksSent,
      nextChunkIndex: this.nextChunkIndex,
      streamTimeMs: this.streamTimeMs,
    };
    if (this.options.deviceId !== undefined) {
      snapshot.deviceId = this.options.deviceId;
    }
    if (this.lastErrorCode !== undefined) {
      snapshot.lastErrorCode = this.lastErrorCode;
    }
    if (this.lastGapReason !== undefined) {
      snapshot.lastGapReason = this.lastGapReason;
    }
    return snapshot;
  }

  start(): void {
    if (this.state === "capturing") {
      return;
    }

    this.lastErrorCode = undefined;
    this.lastGapReason = undefined;
    this.setState("capturing");
    this.captureNextWindow();
  }

  pause(): void {
    if (this.state !== "capturing") {
      return;
    }

    this.clearTimer();
    this.captureRunId += 1;
    this.emitGap("user_paused_capture");
    this.setState("paused");
  }

  resume(): void {
    if (this.state !== "paused") {
      return;
    }

    this.lastErrorCode = undefined;
    this.setState("capturing");
    this.scheduleNextWindow(0);
  }

  stop(): void {
    if (this.state === "stopped") {
      return;
    }

    this.clearTimer();
    this.captureRunId += 1;
    this.setState("stopped");
  }

  private captureNextWindow(): void {
    const runId = this.captureRunId;
    void this.options
      .capture({
        deviceId: this.options.deviceId,
      })
      .then((chunks) => {
        if (this.state !== "capturing" || runId !== this.captureRunId) {
          return;
        }

        for (const chunk of chunks) {
          this.options.sendAudioChunk(this.reindexChunk(chunk));
        }
        this.scheduleNextWindow(0);
        this.emitChange();
      })
      .catch(() => {
        if (runId !== this.captureRunId) {
          return;
        }

        this.clearTimer();
        this.lastErrorCode = "microphone_capture_failed";
        this.emitGap("device_unavailable");
        this.setState("failed");
      });
  }

  private scheduleNextWindow(delayMs: number): void {
    this.clearTimer();
    this.timerId = this.scheduler.setTimeout(() => {
      this.timerId = undefined;
      this.captureNextWindow();
    }, delayMs);
  }

  private clearTimer(): void {
    if (this.timerId !== undefined) {
      this.scheduler.clearTimeout(this.timerId);
      this.timerId = undefined;
    }
  }

  private reindexChunk(chunk: SyntheticPcmChunk): SyntheticPcmChunk {
    const chunkIndex = this.nextChunkIndex;
    const timestampMs = this.streamTimeMs;
    const durationMs = chunk.meta.duration_ms;

    this.nextChunkIndex += 1;
    this.chunksSent += 1;
    this.streamTimeMs += durationMs;

    return {
      meta: {
        ...chunk.meta,
        chunk_id: `mic_${chunkIndex}`,
        chunk_index: chunkIndex,
        timestamp_ms: timestampMs,
        byte_length: chunk.bytes.byteLength,
      },
      bytes: chunk.bytes,
    };
  }

  private emitGap(reason: DroppedAudioGap["reason"]): void {
    const startMs = this.streamTimeMs;
    const endMs = startMs + this.captureWindowMs;
    const droppedChunks = Math.max(1, Math.ceil((endMs - startMs) / this.chunkDurationMs));
    this.lastGapReason = reason;
    this.options.sendAudioGap({
      stream: "microphone",
      start_ms: startMs,
      end_ms: endMs,
      dropped_chunks: droppedChunks,
      reason,
    });
  }

  private setState(state: MicrophoneCaptureState): void {
    this.state = state;
    this.emitChange();
  }

  private emitChange(): void {
    this.options.onStateChange?.(this.snapshot);
  }
}

class BrowserMicrophoneCaptureScheduler implements MicrophoneCaptureScheduler {
  setTimeout(callback: () => void, delayMs: number): number {
    return globalThis.setTimeout(callback, delayMs) as unknown as number;
  }

  clearTimeout(timerId: number): void {
    globalThis.clearTimeout(timerId);
  }
}
