import { describe, expect, it } from "vitest";
import { routeModelRequest } from "./index.js";

describe("ai orchestrator boundary", () => {
  it("keeps the first slice behind a no-external-call provider boundary", () => {
    expect(
      routeModelRequest({
        workspaceId: "ws_a",
        task: "live_suggestion",
        promptVersion: "live.answer.v0",
        provider: "openai",
      }),
    ).toMatchObject({
      provider: "openai",
      externalCallEnabled: false,
    });
  });
});
