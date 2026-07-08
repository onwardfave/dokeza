import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closePool,
  createDatabase,
  createPool,
  transcriptSegments,
  withWorkspaceTransaction,
} from "@dokeza/db";
import { eq } from "drizzle-orm";
import { PgMeetingReviewRepository } from "./meeting-review-repository.js";

// Run with:
// $env:DOKEZA_PG_INTEGRATION='1'; $env:DATABASE_URL='postgres://dokeza:dokeza_local@localhost:5432/dokeza'; pnpm --filter @dokeza/api test -- meeting-review-postgres.integration.test.ts
const runPostgresIntegration = process.env.DOKEZA_PG_INTEGRATION === "1";
const describePostgres = runPostgresIntegration ? describe : describe.skip;
const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://dokeza:dokeza_local@localhost:5432/dokeza";

const suffix = `api_itest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const workspaceA = `ws_${suffix}_a`;
const workspaceB = `ws_${suffix}_b`;
const userA = `user_${suffix}_a`;
const userB = `user_${suffix}_b`;

describePostgres("PostgreSQL meeting review repository integration", () => {
  const pool = createPool(databaseUrl, { max: 2 });
  const db = createDatabase(pool);
  const repository = new PgMeetingReviewRepository({ db, defaultRetentionMode: "7_days" });

  beforeAll(async () => {
    await pool`
      insert into workspaces (id, name, plan)
      values (${workspaceA}, 'API Review Workspace A', 'individual'),
             (${workspaceB}, 'API Review Workspace B', 'individual')
      on conflict (id) do nothing
    `;
    await pool`
      insert into users (id, email, display_name)
      values (${userA}, ${`${userA}@example.com`}, 'API Review User A'),
             (${userB}, ${`${userB}@example.com`}, 'API Review User B')
      on conflict (id) do nothing
    `;
    await pool`
      insert into workspace_memberships (workspace_id, user_id, role)
      values (${workspaceA}, ${userA}, 'owner'),
             (${workspaceB}, ${userB}, 'owner')
      on conflict (workspace_id, user_id) do nothing
    `;
    await pool`
      insert into workspace_policies (workspace_id, retention_mode, created_by)
      values (${workspaceA}, '7_days', ${userA})
    `;
    await pool`
      insert into meeting_sessions (
        id, workspace_id, created_by, meeting_source, status, started_at, ended_at
      )
      values
        (${`sess_${suffix}_old`}, ${workspaceA}, ${userA}, 'manual', 'ended', '2026-06-19T00:00:00.000Z', '2026-06-20T00:00:00.000Z'),
        (${`sess_${suffix}_recent`}, ${workspaceA}, ${userA}, 'manual', 'ended', '2026-07-02T00:00:00.000Z', '2026-07-02T00:10:00.000Z'),
        (${`sess_${suffix}_other`}, ${workspaceB}, ${userB}, 'manual', 'ended', '2026-07-02T00:00:00.000Z', '2026-07-02T00:10:00.000Z')
    `;
    await pool`
      insert into transcript_segments (
        id, workspace_id, meeting_session_id, speaker, text, start_ms, end_ms, confidence, created_by
      )
      values
        (${`seg_${suffix}_old`}, ${workspaceA}, ${`sess_${suffix}_old`}, 'user', 'old pricing transcript', 0, 1000, 0.900, ${userA}),
        (${`seg_${suffix}_recent`}, ${workspaceA}, ${`sess_${suffix}_recent`}, 'remote', 'recent deployment transcript', 0, 1200, 0.930, ${userA}),
        (${`seg_${suffix}_other`}, ${workspaceB}, ${`sess_${suffix}_other`}, 'remote', 'workspace b pricing transcript', 0, 1200, 0.930, ${userB})
    `;
    await pool`
      insert into transcript_gaps (
        id, workspace_id, meeting_session_id, stream, start_ms, end_ms, dropped_chunks, reason, created_by
      )
      values
        (${`gap_${suffix}_recent`}, ${workspaceA}, ${`sess_${suffix}_recent`}, 'microphone', 1300, 1500, 2, 'user_paused_capture', ${userA})
    `;
    await pool`
      insert into suggestions (
        id, workspace_id, meeting_session_id, request_id, kind, content, sources_json, confidence,
        prompt_version, model, server_seq, created_by
      )
      values
        (
          ${`sug_${suffix}_recent`},
          ${workspaceA},
          ${`sess_${suffix}_recent`},
          'sreq_recent',
          'answer_question',
          'Offer the deployment checklist.',
          '[{"document_id":"doc_deploy","title":"Deployment Guide","chunk_id":"chunk_deploy"}]',
          'high',
          'live.answer.v1',
          'deterministic-live-v1',
          8,
          ${userA}
        ),
        (
          ${`sug_${suffix}_other`},
          ${workspaceB},
          ${`sess_${suffix}_other`},
          'sreq_other',
          'answer_question',
          'Workspace B suggestion.',
          '[]',
          'medium',
          'live.answer.v1',
          'deterministic-live-v1',
          8,
          ${userB}
        )
    `;
  });

  afterAll(async () => {
    await pool`delete from workspaces where id in (${workspaceA}, ${workspaceB})`;
    await closePool(pool);
  });

  it("lists, searches, exports, and deletes workspace-scoped meetings", async () => {
    const search = await repository.listMeetings(workspaceA, { transcriptQuery: "deployment" });
    expect(search.meetings.map((meeting) => meeting.meeting_id)).toEqual([`sess_${suffix}_recent`]);
    expect(JSON.stringify(search)).not.toContain("deployment transcript");

    await expect(
      repository.getMeetingDetail(workspaceA, `sess_${suffix}_other`),
    ).resolves.toBeUndefined();

    const detail = await repository.getMeetingDetail(workspaceA, `sess_${suffix}_recent`);
    expect(detail?.transcript.segments[0]?.text).toBe("recent deployment transcript");
    expect(detail?.transcript.gaps).toHaveLength(1);
    expect(detail?.suggestions).toMatchObject([
      {
        suggestion_id: `sug_${suffix}_recent`,
        request_id: "sreq_recent",
        content: "Offer the deployment checklist.",
        sources: [
          {
            document_id: "doc_deploy",
            title: "Deployment Guide",
            chunk_id: "chunk_deploy",
          },
        ],
        server_seq: 8,
      },
    ]);

    const exported = await repository.exportMeeting(
      workspaceA,
      `sess_${suffix}_recent`,
      "markdown",
    );
    expect(exported?.content).toContain("recent deployment transcript");
    expect(exported?.content).toContain("Offer the deployment checklist.");

    await expect(repository.deleteMeeting(workspaceA, `sess_${suffix}_recent`)).resolves.toEqual({
      meeting_id: `sess_${suffix}_recent`,
      workspace_id: workspaceA,
      deleted: true,
    });
    await expect(
      repository.getMeetingDetail(workspaceA, `sess_${suffix}_recent`),
    ).resolves.toBeUndefined();

    const remainingSegments = await withWorkspaceTransaction(db, workspaceA, async (tx) =>
      tx
        .select()
        .from(transcriptSegments)
        .where(eq(transcriptSegments.meetingSessionId, `sess_${suffix}_recent`)),
    );
    expect(remainingSegments).toHaveLength(0);
  });

  it("cleans up expired meetings using workspace retention mode", async () => {
    await expect(
      repository.cleanupExpiredMeetings({
        workspaceId: workspaceA,
        now: new Date("2026-07-03T00:00:00.000Z"),
      }),
    ).resolves.toEqual({
      workspace_id: workspaceA,
      retention_mode: "7_days",
      deleted_count: 1,
    });

    await expect(
      repository.getMeetingDetail(workspaceA, `sess_${suffix}_old`),
    ).resolves.toBeUndefined();
    await expect(
      repository.getMeetingDetail(workspaceB, `sess_${suffix}_other`),
    ).resolves.toBeDefined();
  });
});
