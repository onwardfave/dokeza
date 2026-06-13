import {
  type AudioChunkMetaMessage,
  type AudioGapMessage,
  type RealtimeJsonMessage,
  validateRealtimeJsonMessage,
} from "@dokeza/contracts";
import { createTelemetryEvent, type TelemetryEvent } from "@dokeza/telemetry";

export type RealtimeFrameEvent =
  | {
      type: "json";
      message: Exclude<RealtimeJsonMessage, AudioChunkMetaMessage | AudioGapMessage>;
    }
  | {
      type: "audio.chunk_meta_accepted";
      meta: AudioChunkMetaMessage["payload"];
    }
  | {
      type: "audio.chunk";
      meta: AudioChunkMetaMessage["payload"];
      bytes: Uint8Array;
      telemetry: TelemetryEvent;
    }
  | {
      type: "audio.gap";
      gap: AudioGapMessage["payload"];
      telemetry: TelemetryEvent;
    };

export type RealtimeFrameErrorCode =
  | "invalid_message"
  | "missing_binary_payload"
  | "unexpected_binary_payload"
  | "audio_byte_length_mismatch"
  | "audio_chunk_out_of_order";

export interface RealtimeFrameError {
  type: "error";
  code: RealtimeFrameErrorCode;
  recoverable: boolean;
}

type PendingAudio = AudioChunkMetaMessage["payload"];

export class RealtimeFrameAssembler {
  private pendingAudio: PendingAudio | undefined;
  private readonly lastChunkIndexByStream = new Map<PendingAudio["stream"], number>();

  handleJsonMessage(value: unknown): RealtimeFrameEvent | RealtimeFrameError {
    if (!validateRealtimeJsonMessage(value)) {
      return { type: "error", code: "invalid_message", recoverable: true };
    }

    if (this.pendingAudio !== undefined) {
      this.pendingAudio = undefined;
      return { type: "error", code: "missing_binary_payload", recoverable: true };
    }

    if (value.type === "audio.chunk_meta") {
      const lastChunkIndex = this.lastChunkIndexByStream.get(value.payload.stream);
      if (lastChunkIndex !== undefined && value.payload.chunk_index !== lastChunkIndex + 1) {
        return { type: "error", code: "audio_chunk_out_of_order", recoverable: true };
      }

      this.pendingAudio = value.payload;
      return {
        type: "audio.chunk_meta_accepted",
        meta: value.payload,
      };
    }

    if (value.type === "audio.gap") {
      return {
        type: "audio.gap",
        gap: value.payload,
        telemetry: createTelemetryEvent("realtime.audio_gap", {
          stream: value.payload.stream,
          droppedChunks: value.payload.dropped_chunks,
          reason: value.payload.reason,
        }),
      };
    }

    return {
      type: "json",
      message: value,
    };
  }

  handleBinaryFrame(bytes: Uint8Array): RealtimeFrameEvent | RealtimeFrameError {
    if (this.pendingAudio === undefined) {
      return { type: "error", code: "unexpected_binary_payload", recoverable: true };
    }

    const meta = this.pendingAudio;
    this.pendingAudio = undefined;

    if (bytes.byteLength !== meta.byte_length) {
      return { type: "error", code: "audio_byte_length_mismatch", recoverable: true };
    }

    this.lastChunkIndexByStream.set(meta.stream, meta.chunk_index);

    return {
      type: "audio.chunk",
      meta,
      bytes,
      telemetry: createTelemetryEvent("realtime.audio_chunk_received", {
        stream: meta.stream,
        chunkIndex: meta.chunk_index,
        byteLength: bytes.byteLength,
        durationMs: meta.duration_ms,
      }),
    };
  }
}
