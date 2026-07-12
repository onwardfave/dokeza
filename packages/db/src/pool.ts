/**
 * Database connection pool and workspace-scoped transaction helper.
 *
 * Uses `SET LOCAL app.current_workspace_id` inside transactions so that
 * PostgreSQL RLS policies enforce workspace isolation automatically.
 * `SET LOCAL` resets when the transaction ends, preventing cross-request leakage.
 *
 * @see docs/architecture/multi_tenancy.md
 */

import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";

import * as schema from "./schema.js";

export type Database = PostgresJsDatabase<typeof schema>;

/**
 * Create a postgres.js connection pool configured for Dokeza.
 *
 * @param connectionString - PostgreSQL connection string.
 * @param options - Optional pool configuration overrides.
 */
export function createPool(
  connectionString: string,
  options?: { max?: number; role?: string },
): postgres.Sql {
  return postgres(connectionString, {
    max: options?.max ?? 10,
    idle_timeout: 30,
    connect_timeout: 10,
    ...(options?.role === undefined ? {} : { connection: { role: options.role } }),
  });
}

/**
 * Create a Drizzle database instance from a postgres.js pool.
 */
export function createDatabase(pool: postgres.Sql): Database {
  return drizzle(pool, { schema });
}

/**
 * Execute a function inside a workspace-scoped database transaction.
 *
 * Sets `app.current_workspace_id` via `SET LOCAL` at the start of the
 * transaction. This value is visible to RLS policies and automatically
 * resets when the transaction completes (commit or rollback).
 *
 * @param db - Drizzle database instance.
 * @param workspaceId - The workspace to scope the transaction to.
 * @param fn - The work to perform inside the transaction.
 * @returns The result of `fn`.
 *
 * @example
 * ```ts
 * const sessions = await withWorkspaceTransaction(db, "ws_123", async (tx) => {
 *   return tx.select().from(meetingSessions);
 * });
 * ```
 */
export async function withWorkspaceTransaction<T>(
  db: Database,
  workspaceId: string,
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  if (!workspaceId || workspaceId.trim().length === 0) {
    throw new Error("withWorkspaceTransaction requires a non-empty workspaceId");
  }

  return db.transaction(async (tx) => {
    // SET LOCAL scopes the setting to this transaction only.
    // It automatically resets when the transaction ends.
    await tx.execute(sql`SELECT set_config('app.current_workspace_id', ${workspaceId}, true)`);
    return fn(tx as unknown as Database);
  });
}

/**
 * Close the connection pool gracefully.
 */
export async function closePool(pool: postgres.Sql): Promise<void> {
  await pool.end();
}
