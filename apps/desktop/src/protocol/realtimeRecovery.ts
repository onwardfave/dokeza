import type { AudioGapMessage } from "@dokeza/contracts";
import type { SyntheticPcmChunk } from "./realtimeClient.js";

export interface ReconnectBackoffOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export interface AudioBufferLimits {
  maxDurationMs: number;
  maxBytes: number;
}

export interface AudioBufferSnapshot {
  pendingChunks: number;
  pendingBytes: number;
  pendingDurationMs: number;
  pendingGaps: number;
}

export type BufferedAudioChunk = SyntheticPcmChunk;
export type DroppedAudioGap = AudioGapMessage["payload"];

export function calculateReconnectDelayMs(
  attempt: number,
  options: ReconnectBackoffOptions = {},
): number {
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 30000;
  return Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt));
}

export class InMemoryAudioBuffer {
  private readonly chunks: BufferedAudioChunk[] = [];
  private readonly gaps: DroppedAudioGap[] = [];

  constructor(private limits: AudioBufferLimits) {}

  setLimits(limits: AudioBufferLimits): void {
    this.limits = limits;
    this.trimToLimits();
  }

  enqueue(chunk: BufferedAudioChunk): void {
    this.chunks.push(chunk);
    this.trimToLimits();
  }

  drainChunks(): BufferedAudioChunk[] {
    return this.chunks.splice(0, this.chunks.length);
  }

  drainGaps(): DroppedAudioGap[] {
    return this.gaps.splice(0, this.gaps.length);
  }

  snapshot(): AudioBufferSnapshot {
    return {
      pendingChunks: this.chunks.length,
      pendingBytes: this.pendingBytes,
      pendingDurationMs: this.pendingDurationMs,
      pendingGaps: this.gaps.length,
    };
  }

  private trimToLimits(): void {
    while (
      this.chunks.length > 0 &&
      (this.pendingBytes > this.limits.maxBytes ||
        this.pendingDurationMs > this.limits.maxDurationMs)
    ) {
      const dropped = this.chunks.shift();
      if (dropped !== undefined) {
        this.gaps.push({
          stream: dropped.meta.stream,
          start_ms: dropped.meta.timestamp_ms,
          end_ms: dropped.meta.timestamp_ms + dropped.meta.duration_ms,
          dropped_chunks: 1,
          reason: "local_buffer_full",
        });
      }
    }
  }

  private get pendingBytes(): number {
    return this.chunks.reduce((total, chunk) => total + chunk.bytes.byteLength, 0);
  }

  private get pendingDurationMs(): number {
    return this.chunks.reduce((total, chunk) => total + chunk.meta.duration_ms, 0);
  }
}
