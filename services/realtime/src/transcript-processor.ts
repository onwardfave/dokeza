import { createTelemetryEvent, type TelemetryEvent } from "@dokeza/telemetry";
import type { SttTranscriptEvent } from "./stt-adapter.js";

export type TranscriptSegmentState = "partial" | "final";

export interface TranscriptProcessorOptions {
  sessionId: string;
  workspaceId: string;
}

export interface TranscriptSegmentSnapshot {
  segmentId: string;
  state: TranscriptSegmentState;
  event: SttTranscriptEvent;
}

export type TranscriptSuppressionReason =
  | "duplicate_final"
  | "partial_after_final"
  | "timestamp_out_of_order"
  | "session_closed";

export type TranscriptProcessorResult =
  | {
      action: "emit";
      event: SttTranscriptEvent;
      telemetry: TelemetryEvent[];
    }
  | {
      action: "suppress";
      reason: TranscriptSuppressionReason;
      telemetry: TelemetryEvent[];
    };

export class TranscriptProcessor {
  private readonly sessionId: string;
  private readonly workspaceId: string;
  private readonly segments = new Map<string, TranscriptSegmentSnapshot>();
  private lastAcceptedStartMs = 0;
  private closed = false;

  constructor(options: TranscriptProcessorOptions) {
    this.sessionId = options.sessionId;
    this.workspaceId = options.workspaceId;
  }

  process(event: SttTranscriptEvent): TranscriptProcessorResult {
    const segmentId = event.payload.segment_id;
    const existing = this.segments.get(segmentId);

    if (this.closed) {
      return this.suppress(event, "session_closed");
    }

    if (event.type === "transcript.final" && existing?.state === "final") {
      return this.suppress(event, "duplicate_final");
    }

    if (event.type === "transcript.partial" && existing?.state === "final") {
      return this.suppress(event, "partial_after_final");
    }

    if (existing === undefined && event.payload.start_ms < this.lastAcceptedStartMs) {
      return this.suppress(event, "timestamp_out_of_order");
    }

    const state: TranscriptSegmentState = event.type === "transcript.final" ? "final" : "partial";
    this.segments.set(segmentId, {
      segmentId,
      state,
      event,
    });
    this.lastAcceptedStartMs = Math.max(this.lastAcceptedStartMs, event.payload.start_ms);

    return {
      action: "emit",
      event,
      telemetry: [this.createTelemetry("emit", event)],
    };
  }

  close(): void {
    this.closed = true;
  }

  getSegment(segmentId: string): TranscriptSegmentSnapshot | undefined {
    return this.segments.get(segmentId);
  }

  private suppress(
    event: SttTranscriptEvent,
    reason: TranscriptSuppressionReason,
  ): TranscriptProcessorResult {
    return {
      action: "suppress",
      reason,
      telemetry: [this.createTelemetry("suppress", event, reason)],
    };
  }

  private createTelemetry(
    action: "emit" | "suppress",
    event: SttTranscriptEvent,
    reason?: TranscriptSuppressionReason,
  ): TelemetryEvent {
    return createTelemetryEvent("realtime.transcript_event_processed", {
      sessionId: this.sessionId,
      workspaceId: this.workspaceId,
      action,
      reason: reason ?? "none",
      eventType: event.type,
      segmentId: event.payload.segment_id,
      speaker: event.payload.speaker,
      startMs: event.payload.start_ms,
      endMs: event.payload.end_ms,
      confidence: event.payload.confidence,
    });
  }
}
