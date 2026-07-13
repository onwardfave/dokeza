import type {
  NativeMicrophoneStreamEvent,
  NativeMicrophoneStreamHandle,
  NativeMicrophoneStreamSource,
} from "./nativeMicrophoneSource.js";
import type { DroppedAudioGap } from "./realtimeRecovery.js";
import type { SyntheticPcmChunk } from "./realtimeClient.js";

export type MicrophoneCaptureState =
  | "idle"
  | "starting"
  | "capturing"
  | "paused"
  | "stopped"
  | "failed";

export interface MicrophoneCaptureSnapshot {
  state: MicrophoneCaptureState;
  deviceId?: string;
  chunksSent: number;
  nextChunkIndex: number;
  streamTimeMs: number;
  lastErrorCode?: string;
  lastGapReason?: DroppedAudioGap["reason"];
}

export interface MicrophoneCaptureClock {
  now(): number;
}

export interface ContinuousMicrophoneCaptureControllerOptions {
  deviceId?: string;
  chunkDurationMs?: number;
  clock?: MicrophoneCaptureClock;
  source: NativeMicrophoneStreamSource;
  sendAudioChunk(chunk: SyntheticPcmChunk): void;
  sendAudioGap(gap: DroppedAudioGap): void;
  onStateChange?(snapshot: MicrophoneCaptureSnapshot): void;
}

export class ContinuousMicrophoneCaptureController {
  private readonly chunkDurationMs: number;
  private readonly clock: MicrophoneCaptureClock;
  private handle: NativeMicrophoneStreamHandle | undefined;
  private generation = 0;
  private state: MicrophoneCaptureState = "idle";
  private chunksSent = 0;
  private nextChunkIndex = 0;
  private streamTimeMs = 0;
  private pausedAtMs: number | undefined;
  private lastErrorCode: string | undefined;
  private lastGapReason: DroppedAudioGap["reason"] | undefined;

  constructor(private readonly options: ContinuousMicrophoneCaptureControllerOptions) {
    this.chunkDurationMs = options.chunkDurationMs ?? 100;
    this.clock = options.clock ?? { now: () => Date.now() };
  }

  get snapshot(): MicrophoneCaptureSnapshot {
    return {
      state: this.state,
      chunksSent: this.chunksSent,
      nextChunkIndex: this.nextChunkIndex,
      streamTimeMs: this.streamTimeMs,
      ...(this.options.deviceId === undefined ? {} : { deviceId: this.options.deviceId }),
      ...(this.lastErrorCode === undefined ? {} : { lastErrorCode: this.lastErrorCode }),
      ...(this.lastGapReason === undefined ? {} : { lastGapReason: this.lastGapReason }),
    };
  }

  start(): void {
    if (this.state === "starting" || this.state === "capturing") {
      return;
    }

    const generation = ++this.generation;
    this.lastErrorCode = undefined;
    this.lastGapReason = undefined;
    this.setState("starting");
    void this.options.source
      .start(this.options.deviceId, (event) => this.handleNativeEvent(generation, event))
      .then((handle) => {
        if (generation !== this.generation || this.state === "stopped") {
          void handle.stop();
          return;
        }
        this.handle = handle;
        this.setState("capturing");
      })
      .catch((error: unknown) => {
        if (generation === this.generation && this.state !== "stopped") {
          this.fail(classifyStartError(error));
        }
      });
  }

  pause(): void {
    if (this.state !== "capturing") {
      return;
    }

    void this.handle?.pause().catch(() => this.fail("microphone_stream_failed"));
  }

  resume(): void {
    if (this.state !== "paused") {
      return;
    }

    void this.handle?.resume().catch(() => this.fail("microphone_stream_failed"));
  }

  stop(): void {
    if (this.state === "stopped") {
      return;
    }

    this.generation += 1;
    const handle = this.handle;
    this.handle = undefined;
    this.setState("stopped");
    void handle?.stop();
  }

  private handleNativeEvent(generation: number, event: NativeMicrophoneStreamEvent): void {
    if (generation !== this.generation || this.state === "stopped") {
      return;
    }

    if (event.type === "chunk") {
      if (this.state === "capturing" || this.state === "starting") {
        this.sendChunk(event.chunk.bytes, event.chunk.duration_ms);
      }
      return;
    }

    if (event.type === "gap") {
      this.emitGap(event.reason, Math.max(1, event.dropped_chunks));
      return;
    }

    if (event.type === "error") {
      this.fail(event.code);
      return;
    }

    if (event.state === "paused" && this.state === "capturing") {
      this.pausedAtMs = this.clock.now();
      this.setState("paused");
      return;
    }

    if (event.state === "capturing") {
      if (this.state === "starting") {
        return;
      }
      if (this.state === "paused" && this.pausedAtMs !== undefined) {
        const elapsedMs = Math.max(1, Math.round(this.clock.now() - this.pausedAtMs));
        this.pausedAtMs = undefined;
        this.emitGap(
          "user_paused_capture",
          Math.max(1, Math.ceil(elapsedMs / this.chunkDurationMs)),
          elapsedMs,
        );
      }
      this.setState("capturing");
    }
  }

  private sendChunk(bytesInput: number[], durationMs: number): void {
    const bytes = Uint8Array.from(bytesInput);
    const chunkIndex = this.nextChunkIndex;
    const timestampMs = this.streamTimeMs;
    this.nextChunkIndex += 1;
    this.chunksSent += 1;
    this.streamTimeMs += durationMs;
    this.options.sendAudioChunk({
      meta: {
        chunk_id: `mic_${chunkIndex}`,
        chunk_index: chunkIndex,
        stream: "microphone",
        format: "pcm_s16le",
        sample_rate_hz: 16_000,
        channels: 1,
        duration_ms: durationMs,
        timestamp_ms: timestampMs,
        byte_length: bytes.byteLength,
      },
      bytes,
    });
    this.emitChange();
  }

  private emitGap(
    reason: DroppedAudioGap["reason"],
    droppedChunks: number,
    durationMs = droppedChunks * this.chunkDurationMs,
  ): void {
    const startMs = this.streamTimeMs;
    this.streamTimeMs += durationMs;
    this.lastGapReason = reason;
    this.options.sendAudioGap({
      stream: "microphone",
      start_ms: startMs,
      end_ms: this.streamTimeMs,
      dropped_chunks: droppedChunks,
      reason,
    });
    this.emitChange();
  }

  private fail(code: string): void {
    if (this.state === "failed" || this.state === "stopped") {
      return;
    }
    this.lastErrorCode = code;
    this.emitGap("device_unavailable", 1);
    this.setState("failed");
    const handle = this.handle;
    this.handle = undefined;
    void handle?.stop();
  }

  private setState(state: MicrophoneCaptureState): void {
    this.state = state;
    this.emitChange();
  }

  private emitChange(): void {
    this.options.onStateChange?.(this.snapshot);
  }
}

function classifyStartError(error: unknown): string {
  return String(error).includes("microphone_permission_denied")
    ? "microphone_permission_denied"
    : "microphone_stream_failed";
}
