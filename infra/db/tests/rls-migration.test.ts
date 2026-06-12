import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("migrations/0001_workspace_rls_baseline.sql"),
  "utf8"
).toLowerCase();

const highRiskTables = [
  "workspace_policies",
  "meeting_sessions",
  "transcript_segments",
  "suggestions",
  "documents",
  "document_chunks",
  "integration_connections",
  "audit_logs"
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
});
