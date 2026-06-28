import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTableName } from "drizzle-orm";
import { meetingSessions } from "@dokeza/db";
import type {
  CreateSessionInput,
  EndSessionInput,
  UpdateSessionSeqInput,
} from "./session-store.js";
import { PgSessionStore } from "./session-store.js";

// ---------------------------------------------------------------------------
// Mock @dokeza/db — intercept withWorkspaceTransaction and database calls
// ---------------------------------------------------------------------------

// Shared state for the mock database.
const store = new Map<string, Record<string, unknown>>();
let lastWorkspaceIdSet: string | undefined;
let lastOrderByArgument: unknown;

function tableName(table: unknown): string {
  return getTableName(table as Parameters<typeof getTableName>[0]);
}

function resetStore() {
  store.clear();
  lastWorkspaceIdSet = undefined;
  lastOrderByArgument = undefined;
}

function rowsForTable(table: unknown): Record<string, unknown>[] {
  const prefix = `${tableName(table)}:`;
  return [...store.entries()].filter(([key]) => key.startsWith(prefix)).map(([, val]) => val);
}

function createRowsQuery(table: unknown) {
  const rows = rowsForTable(table);

  return {
    orderBy: vi.fn().mockImplementation((orderByArgument: unknown) => {
      lastOrderByArgument = orderByArgument;
      return Promise.resolve(
        [...rows].sort(
          (left, right) => (right.createdAt as Date).getTime() - (left.createdAt as Date).getTime(),
        ),
      );
    }),
    then: (resolve: (rows: Record<string, unknown>[]) => unknown) =>
      Promise.resolve(rows).then(resolve),
  };
}

// A minimal mock transaction that supports insert/select/update chaining.
function createMockTx() {
  const tx = {
    insert: vi.fn().mockImplementation((table: unknown) => ({
      values: vi.fn().mockImplementation((row: Record<string, unknown>) => {
        const id = row.id as string;
        const record = { ...row };
        store.set(`${tableName(table)}:${id}`, record);
        return {
          returning: vi.fn().mockResolvedValue([record]),
        };
      }),
    })),

    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation((table: unknown) => ({
        where: vi.fn().mockImplementation(() => createRowsQuery(table)),
        orderBy: vi.fn().mockImplementation(() => {
          return Promise.resolve(rowsForTable(table));
        }),
      })),
    })),

    update: vi.fn().mockImplementation((table: unknown) => ({
      set: vi.fn().mockImplementation((updates: Record<string, unknown>) => ({
        where: vi.fn().mockImplementation(() => {
          // Update the first matching record.
          const prefix = `${tableName(table)}:`;
          for (const [key, val] of store.entries()) {
            if (key.startsWith(prefix)) {
              const updated = { ...val, ...updates };
              store.set(key, updated);
              return {
                returning: vi.fn().mockResolvedValue([updated]),
              };
            }
          }
          return {
            returning: vi.fn().mockResolvedValue([]),
          };
        }),
      })),
    })),
  };
  return tx;
}

// Mock the @dokeza/db module — pass through schema tables, mock withWorkspaceTransaction.
vi.mock("@dokeza/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dokeza/db")>();
  return {
    ...actual,
    withWorkspaceTransaction: vi
      .fn()
      .mockImplementation(
        async (_db: unknown, workspaceId: string, fn: (tx: unknown) => Promise<unknown>) => {
          lastWorkspaceIdSet = workspaceId;
          const tx = createMockTx();
          return fn(tx);
        },
      ),
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PgSessionStore", () => {
  let sessionStore: PgSessionStore;
  const mockDb = {} as never; // The mock above intercepts withWorkspaceTransaction.

  beforeEach(() => {
    resetStore();
    sessionStore = new PgSessionStore(mockDb);
  });

  describe("create", () => {
    it("creates a session with active status and initial seq values", async () => {
      const input: CreateSessionInput = {
        id: "sess_1",
        workspaceId: "ws_1",
        createdBy: "user_1",
        meetingSource: "manual",
        connectionId: "conn_1",
      };

      const result = await sessionStore.create(input);

      expect(result.id).toBe("sess_1");
      expect(result.workspaceId).toBe("ws_1");
      expect(result.status).toBe("active");
      expect(result.lastClientSeq).toBe(0);
      expect(result.lastServerSeq).toBe(0);
      expect(result.connectionId).toBe("conn_1");
      expect(lastWorkspaceIdSet).toBe("ws_1");
    });

    it("sets startedAt to current time", async () => {
      const before = new Date();
      const result = await sessionStore.create({
        id: "sess_2",
        workspaceId: "ws_1",
        createdBy: "user_1",
        meetingSource: "calendar",
        connectionId: "conn_2",
      });

      expect(result.startedAt).toBeInstanceOf(Date);
      expect(result.startedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe("getById", () => {
    it("returns a session after creation", async () => {
      await sessionStore.create({
        id: "sess_3",
        workspaceId: "ws_1",
        createdBy: "user_1",
        meetingSource: "manual",
        connectionId: "conn_3",
      });

      const result = await sessionStore.getById("ws_1", "sess_3");
      expect(result).toBeDefined();
      expect(result!.id).toBe("sess_3");
      expect(lastWorkspaceIdSet).toBe("ws_1");
    });
  });

  describe("listByWorkspace", () => {
    it("lists sessions most recent first", async () => {
      const older = await sessionStore.create({
        id: "sess_old",
        workspaceId: "ws_1",
        createdBy: "user_1",
        meetingSource: "manual",
        connectionId: "conn_old",
      });
      const newer = await sessionStore.create({
        id: "sess_new",
        workspaceId: "ws_1",
        createdBy: "user_1",
        meetingSource: "manual",
        connectionId: "conn_new",
      });

      store.set(`meeting_sessions:${older.id}`, {
        ...older,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      });
      store.set(`meeting_sessions:${newer.id}`, {
        ...newer,
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
      });

      const result = await sessionStore.listByWorkspace("ws_1");

      expect(result.map((session) => session.id)).toEqual(["sess_new", "sess_old"]);
      expect(lastOrderByArgument).not.toBe(meetingSessions.createdAt);
    });
  });

  describe("updateSeqState", () => {
    it("updates sequence numbers and connection ID", async () => {
      await sessionStore.create({
        id: "sess_4",
        workspaceId: "ws_1",
        createdBy: "user_1",
        meetingSource: "manual",
        connectionId: "conn_4",
      });

      const input: UpdateSessionSeqInput = {
        sessionId: "sess_4",
        workspaceId: "ws_1",
        lastClientSeq: 42,
        lastServerSeq: 37,
        connectionId: "conn_4_new",
      };

      const result = await sessionStore.updateSeqState(input);
      expect(result).toBeDefined();
      expect(result!.lastClientSeq).toBe(42);
      expect(result!.lastServerSeq).toBe(37);
      expect(result!.connectionId).toBe("conn_4_new");
    });
  });

  describe("endSession", () => {
    it("transitions session to ended status", async () => {
      await sessionStore.create({
        id: "sess_5",
        workspaceId: "ws_1",
        createdBy: "user_1",
        meetingSource: "manual",
        connectionId: "conn_5",
      });

      const input: EndSessionInput = {
        sessionId: "sess_5",
        workspaceId: "ws_1",
      };

      const result = await sessionStore.endSession(input);
      expect(result).toBeDefined();
      expect(result!.status).toBe("ended");
      expect(result!.endedAt).toBeInstanceOf(Date);
    });
  });

  describe("workspace isolation", () => {
    it("always calls withWorkspaceTransaction with the correct workspaceId", async () => {
      await sessionStore.create({
        id: "sess_6",
        workspaceId: "ws_alpha",
        createdBy: "user_1",
        meetingSource: "manual",
        connectionId: "conn_6",
      });
      expect(lastWorkspaceIdSet).toBe("ws_alpha");

      await sessionStore.getById("ws_beta", "sess_6");
      expect(lastWorkspaceIdSet).toBe("ws_beta");
    });
  });
});
