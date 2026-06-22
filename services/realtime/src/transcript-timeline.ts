import type { AudioGapMessage } from "@dokeza/contracts";
import { createTelemetryEvent, type TelemetryEvent } from "@dokeza/telemetry";
import type { SttTranscriptEvent } from "./stt-adapter.js";

export type TranscriptTimelineWriteStatus = "recorded" | "updated" | "ignored";

export interface TranscriptSegmentRecord {
  segmentId: string;
  workspaceId: string;
  sessionId: string;
  speaker: "user" | "remote" | "unknown";
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
  state: "final";
}

export interface TranscriptGapRecordInput {
  workspaceId: string;
  sessionId: string;
  stream: AudioGapMessage["payload"]["stream"];
  startMs: number;
  endMs: number;
  droppedChunks: number;
  reason: AudioGapMessage["payload"]["reason"];
}

export type TranscriptGapRecord = TranscriptGapRecordInput;

export interface TranscriptWriteInput {
  workspaceId: string;
  sessionId: string;
  event: SttTranscriptEvent;
}

export interface TranscriptTimelineWriteResult {
  status: TranscriptTimelineWriteStatus;
  telemetry: TelemetryEvent[];
}

export interface TranscriptTimelineSnapshot {
  workspaceId: string;
  sessionId: string;
  segments: TranscriptSegmentRecord[];
  gaps: TranscriptGapRecord[];
}

export interface TranscriptTimelineSink {
  recordTranscriptEvent(input: TranscriptWriteInput): Promise<TranscriptTimelineWriteResult>;
  recordGap(input: TranscriptGapRecordInput): Promise<TranscriptTimelineWriteResult>;
  getSnapshot(workspaceId: string, sessionId: string): TranscriptTimelineSnapshot;
}

export class InMemoryTranscriptTimelineSink implements TranscriptTimelineSink {
  private readonly segmentsById = new Map<string, TranscriptSegmentRecord>();
  private readonly gaps: TranscriptGapRecord[] = [];

  async recordTranscriptEvent(input: TranscriptWriteInput): Promise<TranscriptTimelineWriteResult> {
    if (input.event.type !== "transcript.final") {
      return {
        status: "ignored",
        telemetry: [
          createTelemetryEvent("realtime.transcript_timeline_write_ignored", {
            workspaceId: input.workspaceId,
            sessionId: input.sessionId,
            eventType: input.event.type,
            segmentId: input.event.payload.segment_id,
          }),
        ],
      };
    }

    const segmentId = input.event.payload.segment_id;
    const existing = this.segmentsById.get(segmentId);
    if (
      existing !== undefined &&
      (existing.workspaceId !== input.workspaceId || existing.sessionId !== input.sessionId)
    ) {
      throw new Error("Transcript segment scope mismatch.");
    }

    const record: TranscriptSegmentRecord = {
      segmentId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      speaker: input.event.payload.speaker,
      text: input.event.payload.text,
      startMs: input.event.payload.start_ms,
      endMs: input.event.payload.end_ms,
      confidence: input.event.payload.confidence,
      state: "final",
    };

    this.segmentsById.set(segmentId, record);
    const status = existing === undefined ? "recorded" : "updated";

    return {
      status,
      telemetry: [
        createTelemetryEvent("realtime.transcript_timeline_segment_written", {
          workspaceId: input.workspaceId,
          sessionId: input.sessionId,
          segmentId,
          status,
          speaker: record.speaker,
          startMs: record.startMs,
          endMs: record.endMs,
          confidence: record.confidence,
        }),
      ],
    };
  }

  async recordGap(input: TranscriptGapRecordInput): Promise<TranscriptTimelineWriteResult> {
    this.gaps.push({ ...input });

    return {
      status: "recorded",
      telemetry: [
        createTelemetryEvent("realtime.transcript_timeline_gap_written", {
          workspaceId: input.workspaceId,
          sessionId: input.sessionId,
          stream: input.stream,
          startMs: input.startMs,
          endMs: input.endMs,
          droppedChunks: input.droppedChunks,
          reason: input.reason,
        }),
      ],
    };
  }

  getSnapshot(workspaceId: string, sessionId: string): TranscriptTimelineSnapshot {
    return {
      workspaceId,
      sessionId,
      segments: [...this.segmentsById.values()]
        .filter((segment) => segment.workspaceId === workspaceId && segment.sessionId === sessionId)
        .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs),
      gaps: this.gaps
        .filter((gap) => gap.workspaceId === workspaceId && gap.sessionId === sessionId)
        .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs),
    };
  }
}
