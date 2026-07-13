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
const userProviderIdentitiesMigration = readFileSync(
  resolve("migrations/0005_user_provider_identities.sql"),
  "utf8",
).toLowerCase();
const applicationRoleMigration = readFileSync(
  resolve("migrations/0006_application_role_rls_hardening.sql"),
  "utf8",
).toLowerCase();
const usageLedgerMigration = readFileSync(
  resolve("migrations/0007_usage_ledger.sql"),
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

  it.each(highRiskTables)("forces RLS for normal and owner connections on %s", (tableName) => {
    expect(applicationRoleMigration).toContain(`alter table ${tableName} force row level security`);
  });

  it("defines a restricted application role and grants only data-plane privileges", () => {
    expect(applicationRoleMigration).toContain("create role dokeza_app nologin nosuperuser");
    expect(applicationRoleMigration).toContain("grant select, insert, update, delete on table");
    expect(applicationRoleMigration).not.toContain("grant all");
    expect(applicationRoleMigration).not.toContain("bypassrls");
  });

  it("allows at most one policy row per workspace", () => {
    expect(applicationRoleMigration).toContain(
      "create unique index workspace_policies_workspace_unique_idx",
    );
    expect(applicationRoleMigration).toContain("on workspace_policies (workspace_id)");
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

  it("adds provider identity mapping without customer content columns", () => {
    expect(userProviderIdentitiesMigration).toContain("create table user_provider_identities");
    expect(userProviderIdentitiesMigration).toContain("provider_issuer text not null");
    expect(userProviderIdentitiesMigration).toContain("provider_subject text not null");
    expect(userProviderIdentitiesMigration).toContain("user_id text not null references users(id)");
    expect(userProviderIdentitiesMigration).not.toContain("token");
    expect(userProviderIdentitiesMigration).not.toContain("transcript");
    expect(userProviderIdentitiesMigration).not.toContain("document");
  });

  it("adds a metadata-only workspace-scoped usage ledger", () => {
    expect(usageLedgerMigration).toContain("create table usage_events");
    expect(usageLedgerMigration).toContain("workspace_id text not null");
    expect(usageLedgerMigration).toContain("input_tokens integer not null");
    expect(usageLedgerMigration).toContain("output_tokens integer not null");
    expect(usageLedgerMigration).toContain("estimated_cost_microusd integer");
    expect(usageLedgerMigration).toContain("alter table usage_events enable row level security");
    expect(usageLedgerMigration).toContain("alter table usage_events force row level security");
    expect(usageLedgerMigration).toContain("current_setting('app.current_workspace_id', true)");
    expect(usageLedgerMigration).toContain(
      "grant select, insert, update, delete on table usage_events",
    );
    expect(usageLedgerMigration).not.toContain("transcript_text");
    expect(usageLedgerMigration).not.toContain("prompt_text");
    expect(usageLedgerMigration).not.toContain("suggestion_content");
  });
});
