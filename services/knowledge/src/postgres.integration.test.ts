import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, createDatabase, createPool } from "@dokeza/db";
import { PgKnowledgeRepository } from "./index.js";

// Run with:
// $env:DOKEZA_PG_INTEGRATION='1'; $env:DATABASE_URL='postgres://dokeza:dokeza_local@localhost:5432/dokeza'; pnpm --filter @dokeza/knowledge test -- postgres.integration.test.ts
const runPostgresIntegration = process.env.DOKEZA_PG_INTEGRATION === "1";
const describePostgres = runPostgresIntegration ? describe : describe.skip;
const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://dokeza:dokeza_local@localhost:5432/dokeza";

const suffix = `knowledge_itest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const workspaceA = `ws_${suffix}_a`;
const workspaceB = `ws_${suffix}_b`;
const userA = `user_${suffix}_a`;
const userB = `user_${suffix}_b`;

describePostgres("PostgreSQL knowledge repository integration", () => {
  const adminPool = createPool(databaseUrl, { max: 2 });
  const appPool = createPool(databaseUrl, { max: 2, role: "dokeza_app" });
  const db = createDatabase(appPool);
  const repository = new PgKnowledgeRepository({
    db,
    defaultRetentionMode: "30_days",
    now: () => new Date("2026-07-04T00:00:00.000Z"),
    idGenerator: createSequenceIds("doc_a", "chunk_a", "doc_b", "chunk_b"),
  });

  beforeAll(async () => {
    await adminPool`
      insert into workspaces (id, name, plan)
      values (${workspaceA}, 'Knowledge Workspace A', 'individual'),
             (${workspaceB}, 'Knowledge Workspace B', 'individual')
      on conflict (id) do nothing
    `;
    await adminPool`
      insert into users (id, email, display_name)
      values (${userA}, ${`${userA}@example.com`}, 'Knowledge User A'),
             (${userB}, ${`${userB}@example.com`}, 'Knowledge User B')
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

  it("uploads, lists, details, and searches documents within one workspace", async () => {
    const uploaded = await repository.uploadDocument({
      workspaceId: workspaceA,
      actorUserId: userA,
      title: "Security FAQ",
      source: "manual_upload",
      text: "Provider credentials stay server-side.",
    });

    expect(uploaded.document).toMatchObject({
      document_id: "doc_doc_a",
      workspace_id: workspaceA,
      chunk_count: 1,
    });

    await expect(repository.listDocuments(workspaceA)).resolves.toMatchObject({
      workspace_id: workspaceA,
      documents: [{ document_id: "doc_doc_a", title: "Security FAQ" }],
    });
    await expect(repository.getDocumentDetail(workspaceA, "doc_doc_a")).resolves.toMatchObject({
      document: { document_id: "doc_doc_a" },
      chunks: [{ chunk_id: "chunk_chunk_a", text: "Provider credentials stay server-side." }],
    });
    await expect(repository.getDocumentDetail(workspaceB, "doc_doc_a")).resolves.toBeUndefined();
    await expect(
      repository.search({ workspaceId: workspaceA, query: "credentials" }),
    ).resolves.toMatchObject({
      results: [{ document_id: "doc_doc_a", chunk_id: "chunk_chunk_a" }],
    });
    await expect(
      repository.search({ workspaceId: workspaceB, query: "credentials" }),
    ).resolves.toMatchObject({
      results: [],
    });
  });

  it("fails closed when workspace retention blocks cloud persistence", async () => {
    await adminPool`
      insert into workspace_policies (workspace_id, retention_mode, created_by)
      values (${workspaceB}, 'local_only', ${userB})
    `;

    await expect(
      repository.uploadDocument({
        workspaceId: workspaceB,
        actorUserId: userB,
        title: "Blocked",
        source: "manual_upload",
        text: "This must not be persisted.",
      }),
    ).rejects.toMatchObject({ code: "knowledge_storage_blocked" });
  });
});

function createSequenceIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `extra_${index}`;
}
