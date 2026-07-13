import { describe, expect, it } from "vitest";
import { InMemoryUsageLedger } from "./usage-ledger.js";
import type { LiveSuggestionUsage } from "@dokeza/ai-orchestrator";

const usage: LiveSuggestionUsage = {
  provider: "openai",
  model: "gpt-test",
  promptVersion: "live.answer.v1",
  status: "completed",
  tokenEstimationMethod: "utf8_bytes_upper_bound",
  inputTokens: 1_000,
  outputTokens: 200,
  transcriptTokens: 600,
  sourceTokens: 200,
  userPromptTokens: 50,
  systemTokens: 100,
  sourceCount: 1,
};

describe("InMemoryUsageLedger", () => {
  it("attributes priced metadata idempotently by workspace, session, and request", async () => {
    const ledger = new InMemoryUsageLedger({
      inputMicrousdPerMillionTokens: 400_000,
      outputMicrousdPerMillionTokens: 1_600_000,
    });
    const input = {
      workspaceId: "ws_a",
      sessionId: "sess_a",
      requestId: "sreq_a",
      actorUserId: "user_a",
      usage,
    };

    await ledger.recordLiveSuggestionUsage(input);
    await ledger.recordLiveSuggestionUsage(input);

    expect(ledger.getSnapshot("ws_a", "sess_a")).toEqual([
      expect.objectContaining({
        requestId: "sreq_a",
        estimatedCostMicrousd: 720,
        costEstimateStatus: "priced",
      }),
    ]);
    await expect(ledger.getSessionEstimatedCostMicrousd("ws_a", "sess_a")).resolves.toBe(720);
    await expect(ledger.getSessionEstimatedCostMicrousd("ws_b", "sess_a")).resolves.toBe(0);
  });

  it("keeps usage unpriced when reviewed model prices are not configured", async () => {
    const ledger = new InMemoryUsageLedger();

    await ledger.recordLiveSuggestionUsage({
      workspaceId: "ws_a",
      sessionId: "sess_a",
      requestId: "sreq_a",
      actorUserId: "user_a",
      usage,
    });

    expect(ledger.getSnapshot("ws_a", "sess_a")[0]).toMatchObject({
      costEstimateStatus: "unpriced",
    });
    await expect(ledger.getSessionEstimatedCostMicrousd("ws_a", "sess_a")).resolves.toBeUndefined();
  });

  it("stores no transcript, prompt, source, or suggestion content", async () => {
    const ledger = new InMemoryUsageLedger();
    await ledger.recordLiveSuggestionUsage({
      workspaceId: "ws_a",
      sessionId: "sess_a",
      requestId: "sreq_a",
      actorUserId: "user_a",
      usage,
    });

    const serialized = JSON.stringify(ledger.getSnapshot("ws_a", "sess_a"));
    expect(serialized).not.toContain("promptText");
    expect(serialized).not.toContain("sourceText");
    expect(serialized).not.toContain("suggestionContent");
  });
});
