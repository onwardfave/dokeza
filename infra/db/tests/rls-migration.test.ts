import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("migrations/0001_workspace_rls_baseline.sql"),
  "utf8",
).toLowerCase();
const vectorIndexMigration = readFileSync(
  resolve("migrations/0003_document_chunk_vector_index.sql"),
  "utf8",
).toLowerCase();
const suggestionPersistenceMigration = readFileSync(
  resolve("migrations/0004_suggestion_persistence_metadata.sql"),
  "utf8",
).toLowerCase();

const highRiskTables = [
  "workspace_policies",
  "meeting_sessions",
  "transcript_segments",
  "transcript_gaps",
  "suggestions",
  "documents",
  "document_chunks",
  "integration_connections",
  "audit_logs",
];

describe("workspace RLS migration baseline", () => {
  it.each(highRiskTables)("enables RLS for %s", (tableName) => {
    expect(migration).toContain(`alter table ${tableName} enable row level security`);
    expect(migration).toContain(`create policy ${tableName}_workspace_isolation`);
  });

  it.each(highRiskTables)("requires workspace_id on %s", (tableName) => {
    const tableStart = migration.indexOf(`create table ${tableName}`);
    expect(tableStart).toBeGreaterThanOrEqual(0);
    const tableEnd = migration.indexOf(");", tableStart);
    const tableDefinition = migration.slice(tableStart, tableEnd);
    expect(tableDefinition).toContain("workspace_id text not null");
  });

  it("records dropped audio ranges without implying continuous transcript", () => {
    expect(migration).toContain("create table transcript_gaps");
    expect(migration).toContain("dropped_chunks integer not null");
    expect(migration).toContain("alter table transcript_gaps enable row level security");
  });

  it("keeps direct provider STT disabled at policy level", () => {
    expect(migration).toContain("direct_provider_stt_allowed boolean not null default false");
    expect(migration).toContain("check (direct_provider_stt_allowed = false)");
  });

  it("stores and indexes document chunk embeddings for workspace-scoped vector search", () => {
    expect(migration).toContain('create extension if not exists "vector"');
    expect(migration).toContain("embedding vector(1536)");
    expect(vectorIndexMigration).toContain("using hnsw (embedding vector_cosine_ops)");
    expect(vectorIndexMigration).toContain("where embedding is not null");
    expect(vectorIndexMigration).toContain("document_chunks_workspace_document_idx");
  });

  it("adds suggestion metadata for meeting review persistence", () => {
    expect(suggestionPersistenceMigration).toContain("alter table suggestions");
    expect(suggestionPersistenceMigration).toContain("request_id text");
    expect(suggestionPersistenceMigration).toContain("sources_json text not null default '[]'");
    expect(suggestionPersistenceMigration).toContain("server_seq integer");
    expect(suggestionPersistenceMigration).toContain("suggestions_workspace_meeting_seq_idx");
  });
});
