import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationsDirectory = resolve(repositoryRoot, "infra/db/migrations");
const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://dokeza:dokeza_local@localhost:5432/dokeza";

const legacyMigrationMarkers = {
  "0001_workspace_rls_baseline.sql": `
    select
      (select count(*) from pg_class
        where relnamespace = 'public'::regnamespace
          and relkind in ('r', 'p')
          and relname in (
            'workspaces', 'users', 'workspace_memberships', 'workspace_policies',
            'meeting_sessions', 'transcript_segments', 'transcript_gaps', 'suggestions',
            'documents', 'document_chunks', 'integration_connections', 'audit_logs'
          )) = 12
      and exists (select 1 from pg_extension where extname = 'vector') as applied
  `,
  "0002_session_recovery.sql": `
    select (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'meeting_sessions'
        and column_name in ('last_client_seq', 'last_server_seq', 'connection_id')) = 3 as applied
  `,
  "0003_document_chunk_vector_index.sql": `
    select (select count(*) from pg_indexes
      where schemaname = 'public'
        and indexname in (
          'document_chunks_embedding_hnsw_idx',
          'document_chunks_workspace_document_idx'
        )) = 2 as applied
  `,
  "0004_suggestion_persistence_metadata.sql": `
    select (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'suggestions'
        and column_name in ('request_id', 'sources_json', 'server_seq')) = 3 as applied
  `,
  "0005_user_provider_identities.sql": `
    select to_regclass('public.user_provider_identities') is not null as applied
  `,
  "0006_application_role_rls_hardening.sql": `
    select
      exists (select 1 from pg_roles where rolname = 'dokeza_app')
      and exists (select 1 from pg_indexes
        where schemaname = 'public'
          and indexname = 'workspace_policies_workspace_unique_idx')
      and not exists (
        select 1 from pg_class
        where relnamespace = 'public'::regnamespace
          and relname in (
            'workspace_policies', 'meeting_sessions', 'transcript_segments',
            'transcript_gaps', 'suggestions', 'documents', 'document_chunks',
            'integration_connections', 'audit_logs'
          )
          and not relforcerowsecurity
      ) as applied
  `,
  "0007_usage_ledger.sql": `
    select to_regclass('public.usage_events') is not null as applied
  `,
};

async function main() {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
  try {
    await sql`select pg_advisory_lock(hashtext('dokeza_schema_migrations'))`;
    await sql`
      create table if not exists dokeza_schema_migrations (
        filename text primary key,
        checksum_sha256 text not null,
        applied_at timestamptz not null default now()
      )
    `;

    const filenames = (await readdir(migrationsDirectory))
      .filter((filename) => /^\d{4}_[a-z0-9_]+\.sql$/.test(filename))
      .sort();
    const migrations = await Promise.all(
      filenames.map(async (filename) => {
        const source = await readFile(resolve(migrationsDirectory, filename), "utf8");
        return {
          filename,
          source,
          checksum: createHash("sha256").update(source).digest("hex"),
        };
      }),
    );

    const appliedRows = await sql`
      select filename, checksum_sha256
      from dokeza_schema_migrations
      order by filename
    `;
    const applied = new Map(
      appliedRows.map((row) => [String(row.filename), String(row.checksum_sha256)]),
    );

    if (applied.size === 0) {
      for (const migration of migrations) {
        const marker = legacyMigrationMarkers[migration.filename];
        if (marker === undefined) {
          break;
        }
        const rows = await sql.unsafe(marker);
        if (rows[0]?.applied !== true) {
          break;
        }
        await sql`
          insert into dokeza_schema_migrations (filename, checksum_sha256)
          values (${migration.filename}, ${migration.checksum})
        `;
        applied.set(migration.filename, migration.checksum);
        console.log(`Adopted existing migration ${migration.filename}`);
      }
    }

    for (const migration of migrations) {
      const existingChecksum = applied.get(migration.filename);
      if (existingChecksum !== undefined) {
        if (existingChecksum !== migration.checksum) {
          throw new Error(`Applied migration checksum changed: ${migration.filename}`);
        }
        continue;
      }

      await sql.begin(async (transaction) => {
        await transaction.unsafe(migration.source);
        await transaction`
          insert into dokeza_schema_migrations (filename, checksum_sha256)
          values (${migration.filename}, ${migration.checksum})
        `;
      });
      console.log(`Applied migration ${migration.filename}`);
    }

    await sql.unsafe(`
      do $$
      begin
        if exists (select 1 from pg_roles where rolname = 'dokeza_app') then
          revoke all on table dokeza_schema_migrations from dokeza_app;
        end if;
      end
      $$
    `);
    console.log("Database migrations are current.");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown migration failure.";
  console.error(`Database migration failed: ${message}`);
  process.exitCode = 1;
});
