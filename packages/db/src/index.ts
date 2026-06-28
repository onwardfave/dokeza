/**
 * @dokeza/db — Database access layer for Dokeza.
 *
 * Provides workspace-scoped database access with RLS enforcement
 * through the `withWorkspaceTransaction` helper.
 *
 * @example
 * ```ts
 * import {
 *   createPool, createDatabase, withWorkspaceTransaction, closePool,
 *   meetingSessions, transcriptSegments,
 * } from "@dokeza/db";
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

// Re-export schema tables for convenient single-path imports.
export {
  workspaces,
  users,
  workspaceMemberships,
  workspacePolicies,
  meetingSessions,
  transcriptSegments,
  transcriptGaps,
  suggestions,
  documents,
  documentChunks,
  integrationConnections,
  auditLogs,
} from "./schema.js";
