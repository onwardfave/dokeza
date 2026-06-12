import { describe, expect, it } from "vitest";
import { createHealthResponse, createWorkspaceRequestContext } from "./index.js";

describe("api service boundary", () => {
  it("creates a health response from typed config", () => {
    expect(createHealthResponse({ DOKEZA_ENV: "test" })).toEqual({
      service: "api",
      status: "ok",
      environment: "test"
    });
  });

  it("requires workspace membership for request context", () => {
    expect(() => createWorkspaceRequestContext({
      userId: "user_1",
      memberships: []
    }, "ws_a")).toThrow("workspace_access_denied:no_membership");
  });
});
