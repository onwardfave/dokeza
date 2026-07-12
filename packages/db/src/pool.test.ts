import { describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { createPool, withWorkspaceTransaction, type Database } from "./pool.js";

vi.mock("postgres", () => ({
  default: vi.fn(() => ({ end: vi.fn() })),
}));

describe("createPool", () => {
  it("selects the restricted application role at connection startup", () => {
    createPool("postgres://example.invalid/dokeza", { max: 4, role: "dokeza_app" });

    expect(postgres).toHaveBeenCalledWith("postgres://example.invalid/dokeza", {
      max: 4,
      idle_timeout: 30,
      connect_timeout: 10,
      connection: { role: "dokeza_app" },
    });
  });
});

describe("withWorkspaceTransaction", () => {
  it("sets the workspace RLS setting before running user work", async () => {
    const calls: string[] = [];
    const tx = {
      async execute(query: unknown) {
        calls.push(`execute:${String(query)}`);
      },
    };
    const db = {
      async transaction<T>(callback: (transaction: typeof tx) => Promise<T>): Promise<T> {
        calls.push("transaction:start");
        const result = await callback(tx);
        calls.push("transaction:end");
        return result;
      },
    } as unknown as Database;

    const result = await withWorkspaceTransaction(db, "ws_test", async (scopedTx) => {
      calls.push(Object.is(scopedTx, tx) ? "work:scoped-tx" : "work:unexpected-tx");
      return "ok";
    });

    expect(result).toBe("ok");
    expect(calls).toEqual([
      "transaction:start",
      "execute:[object Object]",
      "work:scoped-tx",
      "transaction:end",
    ]);
  });

  it.each(["", "   "])("rejects empty workspace IDs %#", async (workspaceId) => {
    await expect(
      withWorkspaceTransaction({} as Database, workspaceId, async () => "unreachable"),
    ).rejects.toThrow("withWorkspaceTransaction requires a non-empty workspaceId");
  });
});
