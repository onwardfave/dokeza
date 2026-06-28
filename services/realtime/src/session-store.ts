/**
 * SessionStore interface and PostgreSQL implementation.
 *
 * Provides workspace-scoped CRUD for meeting sessions. All PG operations
 * run inside `withWorkspaceTransaction` to enforce RLS isolation.
 *
 * @see docs/architecture/multi_tenancy.md
 */

import { and, desc, eq } from "drizzle-orm";
import { withWorkspaceTransaction, meetingSessions, type Database } from "@dokeza/db";

// ---------------------------------------------------------------------------
// Session types
// ---------------------------------------------------------------------------

export type MeetingSessionStatus = "active" | "paused" | "ended";

export interface CreateSessionInput {
  id: string;
  workspaceId: string;
  createdBy: string;
  meetingSource: string;
  connectionId: string;
}

export interface MeetingSessionRecord {
  id: string;
  workspaceId: string;
  createdBy: string;
  meetingSource: string;
  status: MeetingSessionStatus;
  startedAt: Date | null;
  endedAt: Date | null;
  lastClientSeq: number | null;
  lastServerSeq: number | null;
  connectionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateSessionSeqInput {
  sessionId: string;
  workspaceId: string;
  lastClientSeq: number;
  lastServerSeq: number;
  connectionId: string;
}

export interface EndSessionInput {
  sessionId: string;
  workspaceId: string;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface SessionStore {
  /** Create a new meeting session. Returns the persisted record. */
  create(input: CreateSessionInput): Promise<MeetingSessionRecord>;

  /** Get a session by ID within a workspace. Returns undefined if not found. */
  getById(workspaceId: string, sessionId: string): Promise<MeetingSessionRecord | undefined>;

  /** List sessions for a workspace, most recent first. */
  listByWorkspace(workspaceId: string): Promise<MeetingSessionRecord[]>;

  /** Update session recovery state (sequence numbers + connection). */
  updateSeqState(input: UpdateSessionSeqInput): Promise<MeetingSessionRecord | undefined>;

  /** Transition a session to "ended" status. */
  endSession(input: EndSessionInput): Promise<MeetingSessionRecord | undefined>;
}

// ---------------------------------------------------------------------------
// PostgreSQL implementation
// ---------------------------------------------------------------------------

function toRecord(row: typeof meetingSessions.$inferSelect): MeetingSessionRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    createdBy: row.createdBy,
    meetingSource: row.meetingSource,
    status: row.status as MeetingSessionStatus,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    lastClientSeq: row.lastClientSeq,
    lastServerSeq: row.lastServerSeq,
    connectionId: row.connectionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PgSessionStore implements SessionStore {
  constructor(private readonly db: Database) {}

  async create(input: CreateSessionInput): Promise<MeetingSessionRecord> {
    return withWorkspaceTransaction(this.db, input.workspaceId, async (tx) => {
      const now = new Date();
      const rows = await tx
        .insert(meetingSessions)
        .values({
          id: input.id,
          workspaceId: input.workspaceId,
          createdBy: input.createdBy,
          meetingSource: input.meetingSource,
          status: "active",
          startedAt: now,
          connectionId: input.connectionId,
          lastClientSeq: 0,
          lastServerSeq: 0,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const row = rows[0];
      if (!row) {
        throw new Error("Failed to insert meeting session");
      }
      return toRecord(row);
    });
  }

  async getById(workspaceId: string, sessionId: string): Promise<MeetingSessionRecord | undefined> {
    return withWorkspaceTransaction(this.db, workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(meetingSessions)
        .where(
          and(eq(meetingSessions.id, sessionId), eq(meetingSessions.workspaceId, workspaceId)),
        );

      const row = rows[0];
      return row ? toRecord(row) : undefined;
    });
  }

  async listByWorkspace(workspaceId: string): Promise<MeetingSessionRecord[]> {
    return withWorkspaceTransaction(this.db, workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(meetingSessions)
        .where(eq(meetingSessions.workspaceId, workspaceId))
        .orderBy(desc(meetingSessions.createdAt));

      return rows.map(toRecord);
    });
  }

  async updateSeqState(input: UpdateSessionSeqInput): Promise<MeetingSessionRecord | undefined> {
    return withWorkspaceTransaction(this.db, input.workspaceId, async (tx) => {
      const rows = await tx
        .update(meetingSessions)
        .set({
          lastClientSeq: input.lastClientSeq,
          lastServerSeq: input.lastServerSeq,
          connectionId: input.connectionId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(meetingSessions.id, input.sessionId),
            eq(meetingSessions.workspaceId, input.workspaceId),
          ),
        )
        .returning();

      const row = rows[0];
      return row ? toRecord(row) : undefined;
    });
  }

  async endSession(input: EndSessionInput): Promise<MeetingSessionRecord | undefined> {
    return withWorkspaceTransaction(this.db, input.workspaceId, async (tx) => {
      const rows = await tx
        .update(meetingSessions)
        .set({
          status: "ended",
          endedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(meetingSessions.id, input.sessionId),
            eq(meetingSessions.workspaceId, input.workspaceId),
          ),
        )
        .returning();

      const row = rows[0];
      return row ? toRecord(row) : undefined;
    });
  }
}
