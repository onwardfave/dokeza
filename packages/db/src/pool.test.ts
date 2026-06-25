import { describe, expect, it } from "vitest";
import { withWorkspaceTransaction, type Database } from "./pool.js";

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
