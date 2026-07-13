import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closePool,
  createDatabase,
  createPool,
  meetingSessions,
  transcriptGaps,
  transcriptSegments,
  usageEvents,
  withWorkspaceTransaction,
  workspacePolicies,
} from "@dokeza/db";
import { eq } from "drizzle-orm";
import { PgSessionStore } from "./session-store.js";
import { PgTranscriptTimelineSink } from "./pg-transcript-timeline-sink.js";
import type { SttTranscriptEvent } from "./stt-adapter.js";
import {
  createDefaultRealtimeWorkspacePolicy,
  PgWorkspacePolicyResolver,
} from "./workspace-policy-resolver.js";
import { PgUsageLedger } from "./usage-ledger.js";

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
  const adminPool = createPool(databaseUrl, { max: 2 });
  const appPool = createPool(databaseUrl, { max: 2, role: "dokeza_app" });
  const db = createDatabase(appPool);
  const sessionStore = new PgSessionStore(db);

  beforeAll(async () => {
    await adminPool`
      insert into workspaces (id, name, plan)
      values (${workspaceA}, 'Integration Workspace A', 'individual'),
             (${workspaceB}, 'Integration Workspace B', 'individual')
      on conflict (id) do nothing
    `;
    await adminPool`
      insert into users (id, email, display_name)
      values (${userA}, ${`${userA}@example.com`}, 'Integration User A'),
             (${userB}, ${`${userB}@example.com`}, 'Integration User B')
      on conflict (id) do nothing
    `;
    await adminPool`
      insert into workspace_memberships (workspace_id, user_id, role)
      values (${workspaceA}, ${userA}, 'owner'),
             (${workspaceB}, ${userB}, 'owner')
      on conflict (workspace_id, user_id) do nothing
    `;
  });

  afterAll(async () => {
    await adminPool`delete from workspaces where id in (${workspaceA}, ${workspaceB})`;
    await closePool(appPool);
    await closePool(adminPool);
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

    const unscopedRows = await appPool<{ id: string }[]>`
      select id from meeting_sessions
      where id in (${sessionA}, ${sessionB})
    `;
    expect(unscopedRows).toEqual([]);

    const workspaceARows = await withWorkspaceTransaction(db, workspaceA, async (tx) =>
      tx.select({ id: meetingSessions.id }).from(meetingSessions),
    );
    expect(workspaceARows.map(({ id }) => id)).toContain(sessionA);
    expect(workspaceARows.map(({ id }) => id)).not.toContain(sessionB);

    await expect(
      appPool`
        insert into meeting_sessions (id, workspace_id, created_by, meeting_source, status)
        values (${`sess_${suffix}_unscoped`}, ${workspaceA}, ${userA}, 'manual', 'created')
      `,
    ).rejects.toThrow();

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

    const rlsRows = await adminPool<{ relrowsecurity: boolean }[]>`
      select relrowsecurity from pg_class where relname = 'meeting_sessions'
    `;
    expect(rlsRows[0]?.relrowsecurity).toBe(true);
  });

  it("resolves workspace policy inside the owning workspace scope", async () => {
    await withWorkspaceTransaction(db, workspaceA, async (tx) => {
      await tx.insert(workspacePolicies).values({
        workspaceId: workspaceA,
        retentionMode: "live_only",
        cloudSttAllowed: false,
        cloudLlmAllowed: false,
        screenContextAllowed: false,
        directProviderSttAllowed: false,
        createdBy: userA,
      });
    });
    const defaultPolicy = createDefaultRealtimeWorkspacePolicy("7_days");
    const resolver = new PgWorkspacePolicyResolver(db, defaultPolicy);

    await expect(resolver.resolve(workspaceA)).resolves.toEqual({
      screenContextAllowed: false,
      cloudSttAllowed: false,
      cloudLlmAllowed: false,
      directProviderSttAllowed: false,
      retentionMode: "live_only",
      maxLocalAudioBufferMs: 300_000,
    });
    await expect(resolver.resolve(workspaceB)).resolves.toEqual(defaultPolicy);
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

  it("records idempotent metadata-only usage under restricted-role tenant isolation", async () => {
    const sessionId = `sess_${suffix}_usage`;
    await sessionStore.create({
      id: sessionId,
      workspaceId: workspaceA,
      createdBy: userA,
      meetingSource: "manual",
      connectionId: "conn_usage",
    });
    const ledger = new PgUsageLedger({
      db,
      pricing: {
        inputMicrousdPerMillionTokens: 400_000,
        outputMicrousdPerMillionTokens: 1_600_000,
      },
    });
    const input = {
      workspaceId: workspaceA,
      sessionId,
      requestId: `sreq_${suffix}_usage`,
      actorUserId: userA,
      usage: {
        provider: "openai" as const,
        model: "gpt-test",
        promptVersion: "live.answer.v1",
        status: "completed" as const,
        tokenEstimationMethod: "utf8_bytes_upper_bound" as const,
        inputTokens: 1_000,
        outputTokens: 200,
        transcriptTokens: 600,
        sourceTokens: 200,
        userPromptTokens: 50,
        systemTokens: 100,
        sourceCount: 1,
      },
    };

    await ledger.recordLiveSuggestionUsage(input);
    await ledger.recordLiveSuggestionUsage(input);

    await expect(ledger.getSessionEstimatedCostMicrousd(workspaceA, sessionId)).resolves.toBe(720);
    await expect(ledger.getSessionEstimatedCostMicrousd(workspaceB, sessionId)).resolves.toBe(0);
    const unscopedRows = await appPool<{ request_id: string }[]>`
      select request_id from usage_events where meeting_session_id = ${sessionId}
    `;
    expect(unscopedRows).toEqual([]);
    const workspaceRows = await withWorkspaceTransaction(db, workspaceA, async (tx) =>
      tx.select().from(usageEvents).where(eq(usageEvents.meetingSessionId, sessionId)),
    );
    expect(workspaceRows).toHaveLength(1);
    expect(workspaceRows[0]).toMatchObject({
      requestId: input.requestId,
      estimatedCostMicrousd: 720,
      costEstimateStatus: "priced",
    });
    expect(JSON.stringify(workspaceRows[0])).not.toContain("promptText");

    await expect(
      appPool`
        insert into usage_events (
          workspace_id, meeting_session_id, request_id, feature, provider, model,
          prompt_version, status, token_estimation_method, input_tokens, output_tokens,
          transcript_tokens, source_tokens, user_prompt_tokens, system_tokens, source_count,
          cost_estimate_status
        ) values (
          ${workspaceA}, ${sessionId}, 'unscoped', 'live_suggestion', 'openai', 'gpt-test',
          'live.answer.v1', 'completed', 'utf8_bytes_upper_bound', 1, 1, 0, 0, 0, 1, 0,
          'unpriced'
        )
      `,
    ).rejects.toThrow();
  });
});
