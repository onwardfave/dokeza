import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTableName } from "drizzle-orm";
import { PgTranscriptTimelineSink } from "./pg-transcript-timeline-sink.js";
import type { TranscriptWriteInput, TranscriptGapRecordInput } from "./transcript-timeline.js";
import type { SttTranscriptEvent } from "./stt-adapter.js";

// ---------------------------------------------------------------------------
// Mock @dokeza/db
// ---------------------------------------------------------------------------

const segmentStore = new Map<string, Record<string, unknown>>();
const gapStore = new Map<string, Record<string, unknown>>();

function tableName(table: unknown): string {
  return getTableName(table as Parameters<typeof getTableName>[0]);
}

function resetStores() {
  segmentStore.clear();
  gapStore.clear();
}

function createRowsQuery(rows: Record<string, unknown>[]) {
  return {
    orderBy: vi.fn().mockResolvedValue(rows),
    then: (resolve: (rows: Record<string, unknown>[]) => unknown) =>
      Promise.resolve(rows).then(resolve),
  };
}

function projectScopeRows(rows: Record<string, unknown>[]) {
  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspaceId,
    meetingSessionId: row.meetingSessionId,
  }));
}

vi.mock("@dokeza/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dokeza/db")>();
  return {
    ...actual,
    withWorkspaceTransaction: vi
      .fn()
      .mockImplementation(
        async (_db: unknown, _workspaceId: string, fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            select: vi.fn().mockImplementation((selection?: unknown) => ({
              from: vi.fn().mockImplementation((table: unknown) => ({
                where: vi.fn().mockImplementation(() => {
                  if (tableName(table) === "transcript_segments") {
                    const rows = [...segmentStore.values()];
                    return createRowsQuery(selection ? projectScopeRows(rows) : rows);
                  }
                  if (tableName(table) === "transcript_gaps") {
                    const rows = [...gapStore.values()];
                    return createRowsQuery(selection ? projectScopeRows(rows) : rows);
                  }
                  return createRowsQuery([]);
                }),
                orderBy: vi.fn().mockImplementation(() => {
                  if (tableName(table) === "transcript_segments") {
                    return Promise.resolve([...segmentStore.values()]);
                  }
                  return Promise.resolve([...gapStore.values()]);
                }),
              })),
            })),

            insert: vi.fn().mockImplementation((table: unknown) => ({
              values: vi.fn().mockImplementation((row: Record<string, unknown>) => {
                const id = row.id as string;
                if (tableName(table) === "transcript_segments") {
                  segmentStore.set(id, { ...row });
                } else if (tableName(table) === "transcript_gaps") {
                  gapStore.set(id, { ...row });
                }
                return Promise.resolve();
              }),
            })),

            update: vi.fn().mockImplementation((table: unknown) => ({
              set: vi.fn().mockImplementation((updates: Record<string, unknown>) => ({
                where: vi.fn().mockImplementation(() => {
                  const targetStore =
                    tableName(table) === "transcript_segments" ? segmentStore : gapStore;
                  const firstKey = targetStore.keys().next().value as string | undefined;
                  if (firstKey) {
                    targetStore.set(firstKey, {
                      ...targetStore.get(firstKey),
                      ...updates,
                    });
                  }
                  return Promise.resolve();
                }),
              })),
            })),
          };
          return fn(tx);
        },
      ),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFinalEvent(segmentId: string): SttTranscriptEvent {
  return {
    type: "transcript.final",
    payload: {
      segment_id: segmentId,
      speaker: "user",
      text: "hello world",
      start_ms: 1000,
      end_ms: 2000,
      confidence: 0.95,
    },
  };
}

function makePartialEvent(segmentId: string): SttTranscriptEvent {
  return {
    type: "transcript.partial",
    payload: {
      segment_id: segmentId,
      speaker: "user",
      text: "hel",
      start_ms: 1000,
      end_ms: 1500,
      confidence: 0.6,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PgTranscriptTimelineSink", () => {
  const mockDb = {} as never;

  beforeEach(() => {
    resetStores();
  });

  describe("recordTranscriptEvent", () => {
    it("ignores partial transcript events", async () => {
      const sink = new PgTranscriptTimelineSink({
        db: mockDb,
        retentionMode: "30_days",
      });

      const input: TranscriptWriteInput = {
        workspaceId: "ws_1",
        sessionId: "sess_1",
        event: makePartialEvent("seg_partial"),
      };

      const result = await sink.recordTranscriptEvent(input);
      expect(result.status).toBe("ignored");
      expect(segmentStore.size).toBe(0);
    });

    it("persists final transcript segments", async () => {
      const sink = new PgTranscriptTimelineSink({
        db: mockDb,
        retentionMode: "30_days",
      });

      const input: TranscriptWriteInput = {
        workspaceId: "ws_1",
        sessionId: "sess_1",
        event: makeFinalEvent("seg_1"),
      };

      const result = await sink.recordTranscriptEvent(input);
      expect(result.status).toBe("recorded");
      expect(segmentStore.has("seg_1")).toBe(true);
    });

    it("updates existing segment on re-delivery", async () => {
      const sink = new PgTranscriptTimelineSink({
        db: mockDb,
        retentionMode: "30_days",
      });

      // First write.
      await sink.recordTranscriptEvent({
        workspaceId: "ws_1",
        sessionId: "sess_1",
        event: makeFinalEvent("seg_dup"),
      });

      // Second write of same segment — should update, not duplicate.
      const result = await sink.recordTranscriptEvent({
        workspaceId: "ws_1",
        sessionId: "sess_1",
        event: makeFinalEvent("seg_dup"),
      });

      expect(result.status).toBe("updated");
      // Still only one entry.
      expect(segmentStore.size).toBe(1);
    });

    it("rejects duplicate segment IDs from a different session in the same workspace", async () => {
      const sink = new PgTranscriptTimelineSink({
        db: mockDb,
        retentionMode: "30_days",
      });

      segmentStore.set("seg_scope", {
        id: "seg_scope",
        workspaceId: "ws_1",
        meetingSessionId: "sess_other",
      });

      await expect(
        sink.recordTranscriptEvent({
          workspaceId: "ws_1",
          sessionId: "sess_1",
          event: makeFinalEvent("seg_scope"),
        }),
      ).rejects.toThrow("Transcript segment scope mismatch.");
    });

    it("skips persistence when retention mode is live_only", async () => {
      const sink = new PgTranscriptTimelineSink({
        db: mockDb,
        retentionMode: "live_only",
      });

      const result = await sink.recordTranscriptEvent({
        workspaceId: "ws_1",
        sessionId: "sess_1",
        event: makeFinalEvent("seg_live"),
      });

      expect(result.status).toBe("ignored");
      expect(segmentStore.size).toBe(0);
    });

    it("skips persistence when retention mode is local_only", async () => {
      const sink = new PgTranscriptTimelineSink({
        db: mockDb,
        retentionMode: "local_only",
      });

      const result = await sink.recordTranscriptEvent({
        workspaceId: "ws_1",
        sessionId: "sess_1",
        event: makeFinalEvent("seg_local"),
      });

      expect(result.status).toBe("ignored");
      expect(segmentStore.size).toBe(0);
    });

    it("lets the resolved per-session policy override the configured default", async () => {
      const sink = new PgTranscriptTimelineSink({
        db: mockDb,
        retentionMode: "30_days",
      });

      const result = await sink.recordTranscriptEvent({
        workspaceId: "ws_1",
        sessionId: "sess_1",
        event: makeFinalEvent("seg_policy_override"),
        retentionMode: "live_only",
      });

      expect(result.status).toBe("ignored");
      expect(segmentStore.size).toBe(0);
    });

    it("includes telemetry events", async () => {
      const sink = new PgTranscriptTimelineSink({
        db: mockDb,
        retentionMode: "7_days",
      });

      const result = await sink.recordTranscriptEvent({
        workspaceId: "ws_1",
        sessionId: "sess_1",
        event: makeFinalEvent("seg_telem"),
      });

      expect(result.telemetry.length).toBeGreaterThan(0);
      expect(result.telemetry[0]!.name).toBe("realtime.transcript_timeline_segment_written");
    });
  });

  describe("recordGap", () => {
    it("persists audio gaps with 30_days retention", async () => {
      const sink = new PgTranscriptTimelineSink({
        db: mockDb,
        retentionMode: "30_days",
      });

      const input: TranscriptGapRecordInput = {
        workspaceId: "ws_1",
        sessionId: "sess_1",
        stream: "microphone",
        startMs: 5000,
        endMs: 8000,
        droppedChunks: 3,
        reason: "local_buffer_full",
      };

      const result = await sink.recordGap(input);
      expect(result.status).toBe("recorded");
      expect(gapStore.size).toBe(1);
    });

    it("updates an existing audio gap on duplicate delivery", async () => {
      const sink = new PgTranscriptTimelineSink({
        db: mockDb,
        retentionMode: "30_days",
      });

      const gap: TranscriptGapRecordInput = {
        workspaceId: "ws_1",
        sessionId: "sess_1",
        stream: "microphone",
        startMs: 5000,
        endMs: 8000,
        droppedChunks: 3,
        reason: "local_buffer_full",
      };

      await sink.recordGap(gap);
      const result = await sink.recordGap({ ...gap, endMs: 9000, droppedChunks: 4 });

      expect(result.status).toBe("updated");
      expect(gapStore.size).toBe(1);
      expect(gapStore.get("gap_sess_1_5000_microphone")?.endMs).toBe(9000);
    });

    it("rejects duplicate gap IDs from a different session in the same workspace", async () => {
      const sink = new PgTranscriptTimelineSink({
        db: mockDb,
        retentionMode: "30_days",
      });

      gapStore.set("gap_sess_1_5000_microphone", {
        id: "gap_sess_1_5000_microphone",
        workspaceId: "ws_1",
        meetingSessionId: "sess_other",
      });

      await expect(
        sink.recordGap({
          workspaceId: "ws_1",
          sessionId: "sess_1",
          stream: "microphone",
          startMs: 5000,
          endMs: 8000,
          droppedChunks: 3,
          reason: "local_buffer_full",
        }),
      ).rejects.toThrow("Transcript gap scope mismatch.");
    });

    it("skips gaps when retention mode is live_only", async () => {
      const sink = new PgTranscriptTimelineSink({
        db: mockDb,
        retentionMode: "live_only",
      });

      const result = await sink.recordGap({
        workspaceId: "ws_1",
        sessionId: "sess_1",
        stream: "microphone",
        startMs: 5000,
        endMs: 8000,
        droppedChunks: 3,
        reason: "local_buffer_full",
      });

      expect(result.status).toBe("ignored");
      expect(gapStore.size).toBe(0);
    });

    it("includes gap telemetry", async () => {
      const sink = new PgTranscriptTimelineSink({
        db: mockDb,
        retentionMode: "indefinite",
      });

      const result = await sink.recordGap({
        workspaceId: "ws_1",
        sessionId: "sess_1",
        stream: "system",
        startMs: 0,
        endMs: 1000,
        droppedChunks: 1,
        reason: "device_unavailable",
      });

      expect(result.telemetry.length).toBeGreaterThan(0);
      expect(result.telemetry[0]!.name).toBe("realtime.transcript_timeline_gap_written");
    });
  });

  describe("getSnapshot (sync)", () => {
    it("throws because PG sink requires async", () => {
      const sink = new PgTranscriptTimelineSink({
        db: mockDb,
        retentionMode: "30_days",
      });

      expect(() => sink.getSnapshot("ws_1", "sess_1")).toThrow("Use getSnapshotAsync");
    });
  });
});
