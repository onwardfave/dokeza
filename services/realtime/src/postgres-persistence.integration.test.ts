import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closePool,
  createDatabase,
  createPool,
  transcriptGaps,
  transcriptSegments,
  withWorkspaceTransaction,
} from "@dokeza/db";
import { eq } from "drizzle-orm";
import { PgSessionStore } from "./session-store.js";
import { PgTranscriptTimelineSink } from "./pg-transcript-timeline-sink.js";
import type { SttTranscriptEvent } from "./stt-adapter.js";

// Run with:
// $env:DOKEZA_PG_INTEGRATION='1'; $env:DATABASE_URL='postgres://dokeza:dokeza_local@localhost:5432/dokeza'; pnpm --filter @dokeza/realtime test -- postgres-persistence.integration.test.ts
const runPostgresIntegration = process.env.DOKEZA_PG_INTEGRATION === "1";
const describePostgres = runPostgresIntegration ? describe : describe.skip;
const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://dokeza:dokeza_local@localhost:5432/dokeza";

const suffix = `itest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const workspaceA = `ws_${suffix}_a`;
const workspaceB = `ws_${suffix}_b`;
const userA = `user_${suffix}_a`;
const userB = `user_${suffix}_b`;

function finalEvent(segmentId: string, text = "hello world"): SttTranscriptEvent {
  return {
    type: "transcript.final",
    payload: {
      segment_id: segmentId,
      speaker: "user",
      text,
      start_ms: 100,
      end_ms: 250,
      confidence: 0.95,
    },
  };
}

describePostgres("PostgreSQL realtime persistence integration", () => {
  const pool = createPool(databaseUrl, { max: 2 });
  const db = createDatabase(pool);
  const sessionStore = new PgSessionStore(db);

  beforeAll(async () => {
    await pool`
      insert into workspaces (id, name, plan)
      values (${workspaceA}, 'Integration Workspace A', 'individual'),
             (${workspaceB}, 'Integration Workspace B', 'individual')
      on conflict (id) do nothing
    `;
    await pool`
      insert into users (id, email, display_name)
      values (${userA}, ${`${userA}@example.com`}, 'Integration User A'),
             (${userB}, ${`${userB}@example.com`}, 'Integration User B')
      on conflict (id) do nothing
    `;
    await pool`
      insert into workspace_memberships (workspace_id, user_id, role)
      values (${workspaceA}, ${userA}, 'owner'),
             (${workspaceB}, ${userB}, 'owner')
      on conflict (workspace_id, user_id) do nothing
    `;
  });

  afterAll(async () => {
    await pool`delete from workspaces where id in (${workspaceA}, ${workspaceB})`;
    await closePool(pool);
  });

  it("persists and scopes meeting session lifecycle state", async () => {
    const sessionA = `sess_${suffix}_a`;
    const sessionB = `sess_${suffix}_b`;

    await sessionStore.create({
      id: sessionA,
      workspaceId: workspaceA,
      createdBy: userA,
      meetingSource: "manual",
      connectionId: "conn_a",
    });
    await sessionStore.create({
      id: sessionB,
      workspaceId: workspaceB,
      createdBy: userB,
      meetingSource: "manual",
      connectionId: "conn_b",
    });

    await expect(sessionStore.getById(workspaceA, sessionB)).resolves.toBeUndefined();

    const updated = await sessionStore.updateSeqState({
      sessionId: sessionA,
      workspaceId: workspaceA,
      lastClientSeq: 42,
      lastServerSeq: 37,
      connectionId: "conn_a_reconnected",
    });
    expect(updated?.lastClientSeq).toBe(42);
    expect(updated?.lastServerSeq).toBe(37);
    expect(updated?.connectionId).toBe("conn_a_reconnected");

    const ended = await sessionStore.endSession({ sessionId: sessionA, workspaceId: workspaceA });
    expect(ended?.status).toBe("ended");

    const workspaceASessions = await sessionStore.listByWorkspace(workspaceA);
    expect(workspaceASessions.map((session) => session.id)).toContain(sessionA);
    expect(workspaceASessions.map((session) => session.id)).not.toContain(sessionB);

    const rlsRows = await pool<{ relrowsecurity: boolean }[]>`
      select relrowsecurity from pg_class where relname = 'meeting_sessions'
    `;
    expect(rlsRows[0]?.relrowsecurity).toBe(true);
  });

  it("persists transcript segments and gaps with idempotent writes", async () => {
    const sessionId = `sess_${suffix}_timeline`;
    const segmentId = `seg_${suffix}`;

    await sessionStore.create({
      id: sessionId,
      workspaceId: workspaceA,
      createdBy: userA,
      meetingSource: "manual",
      connectionId: "conn_timeline",
    });

    const sink = new PgTranscriptTimelineSink({ db, retentionMode: "30_days" });
    await expect(
      sink.recordTranscriptEvent({
        workspaceId: workspaceA,
        sessionId,
        event: finalEvent(segmentId, "first transcript"),
      }),
    ).resolves.toMatchObject({ status: "recorded" });
    await expect(
      sink.recordTranscriptEvent({
        workspaceId: workspaceA,
        sessionId,
        event: finalEvent(segmentId, "updated transcript"),
      }),
    ).resolves.toMatchObject({ status: "updated" });

    await expect(
      sink.recordGap({
        workspaceId: workspaceA,
        sessionId,
        stream: "microphone",
        startMs: 1000,
        endMs: 1200,
        droppedChunks: 2,
        reason: "local_buffer_full",
      }),
    ).resolves.toMatchObject({ status: "recorded" });
    await expect(
      sink.recordGap({
        workspaceId: workspaceA,
        sessionId,
        stream: "microphone",
        startMs: 1000,
        endMs: 1400,
        droppedChunks: 3,
        reason: "local_buffer_full",
      }),
    ).resolves.toMatchObject({ status: "updated" });

    const snapshot = await sink.getSnapshotAsync(workspaceA, sessionId);
    expect(snapshot.segments).toHaveLength(1);
    expect(snapshot.segments[0]?.text).toBe("updated transcript");
    expect(snapshot.gaps).toHaveLength(1);
    expect(snapshot.gaps[0]?.endMs).toBe(1400);
    expect(snapshot.gaps[0]?.droppedChunks).toBe(3);
  });

  it("does not persist transcript timeline records in no-storage modes", async () => {
    const sessionId = `sess_${suffix}_live_only`;
    const segmentId = `seg_${suffix}_live_only`;

    await sessionStore.create({
      id: sessionId,
      workspaceId: workspaceA,
      createdBy: userA,
      meetingSource: "manual",
      connectionId: "conn_live_only",
    });

    const sink = new PgTranscriptTimelineSink({ db, retentionMode: "live_only" });
    await expect(
      sink.recordTranscriptEvent({
        workspaceId: workspaceA,
        sessionId,
        event: finalEvent(segmentId),
      }),
    ).resolves.toMatchObject({ status: "ignored" });
    await expect(
      sink.recordGap({
        workspaceId: workspaceA,
        sessionId,
        stream: "microphone",
        startMs: 2000,
        endMs: 2200,
        droppedChunks: 1,
        reason: "local_buffer_full",
      }),
    ).resolves.toMatchObject({ status: "ignored" });

    const rows = await withWorkspaceTransaction(db, workspaceA, async (tx) => {
      const segments = await tx
        .select()
        .from(transcriptSegments)
        .where(eq(transcriptSegments.meetingSessionId, sessionId));
      const gaps = await tx
        .select()
        .from(transcriptGaps)
        .where(eq(transcriptGaps.meetingSessionId, sessionId));
      return { segments, gaps };
    });

    expect(rows.segments).toHaveLength(0);
    expect(rows.gaps).toHaveLength(0);
  });

  it("rejects duplicate segment IDs scoped to another session", async () => {
    const firstSession = `sess_${suffix}_scope_a`;
    const secondSession = `sess_${suffix}_scope_b`;
    const segmentId = `seg_${suffix}_scope`;

    await sessionStore.create({
      id: firstSession,
      workspaceId: workspaceA,
      createdBy: userA,
      meetingSource: "manual",
      connectionId: "conn_scope_a",
    });
    await sessionStore.create({
      id: secondSession,
      workspaceId: workspaceA,
      createdBy: userA,
      meetingSource: "manual",
      connectionId: "conn_scope_b",
    });

    const sink = new PgTranscriptTimelineSink({ db, retentionMode: "30_days" });
    await sink.recordTranscriptEvent({
      workspaceId: workspaceA,
      sessionId: firstSession,
      event: finalEvent(segmentId),
    });

    await expect(
      sink.recordTranscriptEvent({
        workspaceId: workspaceA,
        sessionId: secondSession,
        event: finalEvent(segmentId),
      }),
    ).rejects.toThrow("Transcript segment scope mismatch.");
  });
});
