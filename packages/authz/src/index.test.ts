import { describe, expect, it } from "vitest";
import { authorizeWorkspace, requireWorkspace, type Actor } from "./index.js";

const actor: Actor = {
  userId: "user_1",
  memberships: [
    { userId: "user_1", workspaceId: "ws_a", role: "member" },
    { userId: "user_1", workspaceId: "ws_b", role: "admin" },
  ],
};

describe("workspace authorization", () => {
  it("allows access to an owning workspace membership", () => {
    expect(authorizeWorkspace(actor, "ws_a")).toEqual({
      allowed: true,
      role: "member",
    });
  });

  it("denies cross-workspace access by default", () => {
    expect(authorizeWorkspace(actor, "ws_c")).toEqual({
      allowed: false,
      reason: "no_membership",
    });
  });

  it("enforces minimum role boundaries", () => {
    expect(authorizeWorkspace(actor, "ws_a", "admin")).toEqual({
      allowed: false,
      reason: "role_not_allowed",
      role: "member",
    });
    expect(requireWorkspace(actor, "ws_b", "admin")).toBe("admin");
  });
});
