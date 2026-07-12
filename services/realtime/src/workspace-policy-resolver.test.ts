import { describe, expect, it } from "vitest";

import {
  createDefaultRealtimeWorkspacePolicy,
  StaticWorkspacePolicyResolver,
} from "./workspace-policy-resolver.js";

describe("workspace policy resolution", () => {
  it("uses conservative screen and direct-provider defaults", () => {
    expect(createDefaultRealtimeWorkspacePolicy("7_days")).toEqual({
      screenContextAllowed: false,
      cloudSttAllowed: true,
      cloudLlmAllowed: true,
      directProviderSttAllowed: false,
      retentionMode: "7_days",
      maxLocalAudioBufferMs: 300_000,
    });
  });

  it("returns a copy of an explicit local/test policy", async () => {
    const policy = createDefaultRealtimeWorkspacePolicy("live_only");
    const resolver = new StaticWorkspacePolicyResolver(policy);

    const first = await resolver.resolve("ws_1");
    first.cloudLlmAllowed = false;

    await expect(resolver.resolve("ws_1")).resolves.toEqual(policy);
  });
});
