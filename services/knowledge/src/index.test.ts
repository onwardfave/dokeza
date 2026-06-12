import { describe, expect, it } from "vitest";
import { createRetrievalRequest } from "./index.js";

describe("knowledge service boundary", () => {
  const actor = {
    userId: "user_1",
    memberships: [
      { userId: "user_1", workspaceId: "ws_a", role: "member" as const }
    ]
  };

  it("creates workspace-scoped retrieval requests", () => {
    expect(createRetrievalRequest(actor, "ws_a", "pricing", 3, ["doc_1"])).toEqual({
      workspaceId: "ws_a",
      actorUserId: "user_1",
      query: "pricing",
      topK: 3,
      allowedDocumentIds: ["doc_1"]
    });
  });

  it("blocks cross-workspace retrieval", () => {
    expect(() => createRetrievalRequest(actor, "ws_b", "pricing")).toThrow(
      "workspace_access_denied:no_membership"
    );
  });
});
