/**
 * PostgreSQL implementation of the TranscriptTimelineSink.
 *
 * Persists final transcript segments and audio gaps to the database with:
 * - Workspace-scoped RLS enforcement via withWorkspaceTransaction
 * - Idempotent deterministic IDs for duplicate segment and gap delivery
 * - Retention-aware gating: `live_only` and `local_only` modes write nothing
 *
 * @see docs/architecture/multi_tenancy.md
 * @see docs/architecture/failure_modes.md
 */

import { eq, and } from "drizzle-orm";
import {
  withWorkspaceTransaction,
  transcriptSegments,
  transcriptGaps,
  type Database,
} from "@dokeza/db";
import { createTelemetryEvent, type TelemetryEvent } from "@dokeza/telemetry";

import type {
  TranscriptTimelineSink,
  TranscriptWriteInput,
  TranscriptTimelineWriteResult,
  TranscriptGapRecordInput,
  TranscriptTimelineSnapshot,
  TranscriptSegmentRecord,
  TranscriptGapRecord,
} from "./transcript-timeline.js";

import {
  evaluateTranscriptTimelinePersistence,
  type TranscriptRetentionMode,
} from "./transcript-retention-policy.js";

export interface PgTranscriptTimelineSinkOptions {
  db: Database;
  retentionMode: TranscriptRetentionMode | string;
}

export class PgTranscriptTimelineSink implements TranscriptTimelineSink {
  private readonly db: Database;
  private readonly retentionMode: TranscriptRetentionMode | string;

  constructor(options: PgTranscriptTimelineSinkOptions) {
    this.db = options.db;
    this.retentionMode = options.retentionMode;
  }

  async recordTranscriptEvent(input: TranscriptWriteInput): Promise<TranscriptTimelineWriteResult> {
    // Only persist final events.
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

    // Check retention policy before writing.
    const decision = evaluateTranscriptTimelinePersistence({
      retentionMode: input.retentionMode ?? this.retentionMode,
      timelineRecordKind: "segment",
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
    });

    if (decision.action === "skip") {
      return {
        status: "ignored",
        telemetry: [decision.telemetry],
      };
    }

    const { payload } = input.event;
    const segmentId = payload.segment_id;

    return withWorkspaceTransaction(this.db, input.workspaceId, async (tx) => {
      // Idempotent write: check if the segment already exists.
      const existing = await tx
        .select({
          id: transcriptSegments.id,
          workspaceId: transcriptSegments.workspaceId,
          meetingSessionId: transcriptSegments.meetingSessionId,
        })
        .from(transcriptSegments)
        .where(
          and(
            eq(transcriptSegments.id, segmentId),
            eq(transcriptSegments.workspaceId, input.workspaceId),
          ),
        );

      const telemetry: TelemetryEvent[] = [];

      if (existing.length > 0) {
        const existingSegment = existing[0];
        if (
          existingSegment?.workspaceId !== input.workspaceId ||
          existingSegment.meetingSessionId !== input.sessionId
        ) {
          throw new Error("Transcript segment scope mismatch.");
        }

        // Update existing segment (re-delivery or correction).
        await tx
          .update(transcriptSegments)
          .set({
            text: payload.text,
            startMs: payload.start_ms,
            endMs: payload.end_ms,
            confidence: String(payload.confidence),
            speaker: payload.speaker,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(transcriptSegments.id, segmentId),
              eq(transcriptSegments.workspaceId, input.workspaceId),
              eq(transcriptSegments.meetingSessionId, input.sessionId),
            ),
          );

        telemetry.push(
          createTelemetryEvent("realtime.transcript_timeline_segment_written", {
            workspaceId: input.workspaceId,
            sessionId: input.sessionId,
            segmentId,
            status: "updated",
            speaker: payload.speaker,
            startMs: payload.start_ms,
            endMs: payload.end_ms,
            confidence: payload.confidence,
          }),
        );

        return { status: "updated" as const, telemetry };
      }

      // Insert new segment.
      await tx.insert(transcriptSegments).values({
        id: segmentId,
        workspaceId: input.workspaceId,
        meetingSessionId: input.sessionId,
        speaker: payload.speaker,
        text: payload.text,
        startMs: payload.start_ms,
        endMs: payload.end_ms,
        confidence: String(payload.confidence),
      });

      telemetry.push(
        createTelemetryEvent("realtime.transcript_timeline_segment_written", {
          workspaceId: input.workspaceId,
          sessionId: input.sessionId,
          segmentId,
          status: "recorded",
          speaker: payload.speaker,
          startMs: payload.start_ms,
          endMs: payload.end_ms,
          confidence: payload.confidence,
        }),
      );

      return { status: "recorded" as const, telemetry };
    });
  }

  async recordGap(input: TranscriptGapRecordInput): Promise<TranscriptTimelineWriteResult> {
    // Check retention policy before writing.
    const decision = evaluateTranscriptTimelinePersistence({
      retentionMode: input.retentionMode ?? this.retentionMode,
      timelineRecordKind: "gap",
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
    });

    if (decision.action === "skip") {
      return {
        status: "ignored",
        telemetry: [decision.telemetry],
      };
    }

    return withWorkspaceTransaction(this.db, input.workspaceId, async (tx) => {
      const gapId = `gap_${input.sessionId}_${input.startMs}_${input.stream}`;

      const existing = await tx
        .select({
          id: transcriptGaps.id,
          workspaceId: transcriptGaps.workspaceId,
          meetingSessionId: transcriptGaps.meetingSessionId,
        })
        .from(transcriptGaps)
        .where(
          and(eq(transcriptGaps.id, gapId), eq(transcriptGaps.workspaceId, input.workspaceId)),
        );

      if (existing.length > 0) {
        const existingGap = existing[0];
        if (
          existingGap?.workspaceId !== input.workspaceId ||
          existingGap.meetingSessionId !== input.sessionId
        ) {
          throw new Error("Transcript gap scope mismatch.");
        }

        await tx
          .update(transcriptGaps)
          .set({
            endMs: input.endMs,
            droppedChunks: input.droppedChunks,
            reason: input.reason,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(transcriptGaps.id, gapId),
              eq(transcriptGaps.workspaceId, input.workspaceId),
              eq(transcriptGaps.meetingSessionId, input.sessionId),
            ),
          );

        return {
          status: "updated" as const,
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

      await tx.insert(transcriptGaps).values({
        id: gapId,
        workspaceId: input.workspaceId,
        meetingSessionId: input.sessionId,
        stream: input.stream,
        startMs: input.startMs,
        endMs: input.endMs,
        droppedChunks: input.droppedChunks,
        reason: input.reason,
      });

      return {
        status: "recorded" as const,
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
    });
  }

  getSnapshot(_workspaceId: string, _sessionId: string): TranscriptTimelineSnapshot {
    // PG sink does not support synchronous snapshots.
    // Use getSnapshotAsync instead.
    throw new Error("PgTranscriptTimelineSink.getSnapshot is not supported. Use getSnapshotAsync.");
  }

  async getSnapshotAsync(
    workspaceId: string,
    sessionId: string,
  ): Promise<TranscriptTimelineSnapshot> {
    return withWorkspaceTransaction(this.db, workspaceId, async (tx) => {
      const segmentRows = await tx
        .select()
        .from(transcriptSegments)
        .where(
          and(
            eq(transcriptSegments.workspaceId, workspaceId),
            eq(transcriptSegments.meetingSessionId, sessionId),
          ),
        )
        .orderBy(transcriptSegments.startMs);

      const gapRows = await tx
        .select()
        .from(transcriptGaps)
        .where(
          and(
            eq(transcriptGaps.workspaceId, workspaceId),
            eq(transcriptGaps.meetingSessionId, sessionId),
          ),
        )
        .orderBy(transcriptGaps.startMs);

      const segments: TranscriptSegmentRecord[] = segmentRows.map((row) => ({
        segmentId: row.id,
        workspaceId: row.workspaceId,
        sessionId: row.meetingSessionId,
        speaker: row.speaker as "user" | "remote" | "unknown",
        text: row.text,
        startMs: row.startMs,
        endMs: row.endMs,
        confidence: row.confidence ? Number(row.confidence) : 0,
        state: "final" as const,
      }));

      const gaps: TranscriptGapRecord[] = gapRows.map((row) => ({
        workspaceId: row.workspaceId,
        sessionId: row.meetingSessionId,
        stream: row.stream as TranscriptGapRecord["stream"],
        startMs: row.startMs,
        endMs: row.endMs,
        droppedChunks: row.droppedChunks,
        reason: row.reason as TranscriptGapRecord["reason"],
      }));

      return { workspaceId, sessionId, segments, gaps };
    });
  }
}
