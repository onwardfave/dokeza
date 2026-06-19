import type { AudioChunkMetaMessage, RealtimeJsonMessage } from "@dokeza/contracts";
import { createTelemetryEvent, type TelemetryEvent } from "@dokeza/telemetry";

type TranscriptMessage = Extract<
  RealtimeJsonMessage,
  { type: "transcript.partial" | "transcript.final" }
>;

export type SttTranscriptEvent = Pick<TranscriptMessage, "type" | "payload">;

export interface SttChunkInput {
  sessionId: string;
  workspaceId: string;
  meta: AudioChunkMetaMessage["payload"];
  bytes: Uint8Array;
}

export interface SttAdapterError {
  code: "stt_provider_timeout";
  message: string;
  recoverable: boolean;
  retry_after_ms?: number;
}

export type SttAdapterResult =
  | {
      events: SttTranscriptEvent[];
      telemetry: TelemetryEvent[];
    }
  | {
      error: SttAdapterError;
      telemetry: TelemetryEvent[];
    };

export interface SttAdapter {
  transcribeChunk(input: SttChunkInput): Promise<SttAdapterResult>;
}

export interface DeterministicSttAdapterOptions {
  transcriptText?: string;
}

export class DeterministicSttAdapter implements SttAdapter {
  private readonly transcriptText: string;

  constructor(options: DeterministicSttAdapterOptions = {}) {
    this.transcriptText = options.transcriptText ?? "synthetic transcript";
  }

  async transcribeChunk(input: SttChunkInput): Promise<SttAdapterResult> {
    const speaker = input.meta.stream === "microphone" ? "user" : "remote";
    const startMs = input.meta.timestamp_ms;
    const endMs = input.meta.timestamp_ms + input.meta.duration_ms;
    const segmentId = `seg_${input.meta.chunk_id}`;

    const events: SttTranscriptEvent[] = [
      {
        type: "transcript.partial",
        payload: {
          segment_id: `${segmentId}_partial`,
          speaker,
          text: this.transcriptText,
          start_ms: startMs,
          end_ms: endMs,
          confidence: 0.7,
        },
      },
      {
        type: "transcript.final",
        payload: {
          segment_id: segmentId,
          speaker,
          text: this.transcriptText,
          start_ms: startMs,
          end_ms: endMs,
          confidence: 0.9,
        },
      },
    ];

    return {
      events,
      telemetry: [
        createTelemetryEvent("realtime.stt_chunk_transcribed", {
          sessionId: input.sessionId,
          workspaceId: input.workspaceId,
          provider: "deterministic",
          stream: input.meta.stream,
          chunkIndex: input.meta.chunk_index,
          byteLength: input.bytes.byteLength,
          durationMs: input.meta.duration_ms,
          eventCount: events.length,
        }),
      ],
    };
  }
}
