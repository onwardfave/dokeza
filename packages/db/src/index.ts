/**
 * @dokeza/db — Database access layer for Dokeza.
 *
 * Provides workspace-scoped database access with RLS enforcement
 * through the `withWorkspaceTransaction` helper.
 *
 * @example
 * ```ts
 * import { createPool, createDatabase, withWorkspaceTransaction, closePool } from "@dokeza/db";
 * import { meetingSessions } from "@dokeza/db/schema";
 *
 * const pool = createPool(process.env.DATABASE_URL);
 * const db = createDatabase(pool);
 *
 * const sessions = await withWorkspaceTransaction(db, "ws_123", async (tx) => {
 *   return tx.select().from(meetingSessions);
 * });
 *
 * await closePool(pool);
 * ```
 */

export {
  createPool,
  createDatabase,
  withWorkspaceTransaction,
  closePool,
  type Database,
} from "./pool.js";
