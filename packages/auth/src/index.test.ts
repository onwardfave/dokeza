import { describe, expect, it } from "vitest";
import { createDokezaAuthTokenService } from "./index.js";
import type { Actor } from "@dokeza/authz";

const actor: Actor = {
  userId: "user_1",
  memberships: [
    { userId: "user_1", workspaceId: "ws_1", role: "member" },
    { userId: "user_1", workspaceId: "ws_2", role: "admin" },
  ],
};

function createService(now = new Date("2026-07-02T00:00:00.000Z")) {
  return createDokezaAuthTokenService({
    issuer: "https://auth.local.dokeza.dev",
    audience: "dokeza",
    signingSecret: "test_signing_secret_at_least_32_chars",
    now: () => now,
  });
}

describe("DokezaAuthTokenService", () => {
  it("issues and validates a development API token without leaking secrets in claims", () => {
    const service = createService();
    const token = service.issueToken({
      actor,
      purpose: "api_access",
      expiresInSeconds: 3600,
      developmentOnly: true,
    });

    const result = service.validateToken(token, "api_access");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.principal.actor).toEqual(actor);
      expect(result.principal.claims.development_only).toBe(true);
      expect(JSON.stringify(result.principal.claims)).not.toContain("test_signing_secret");
    }
  });

  it("issues realtime tokens scoped to a selected workspace and device", () => {
    const service = createService();
    const token = service.issueToken({
      actor,
      purpose: "realtime_session",
      workspaceId: "ws_2",
      deviceId: "dev_1",
      expiresInSeconds: 300,
      developmentOnly: true,
    });

    const result = service.validateToken(token, "realtime_session");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.principal.workspaceId).toBe("ws_2");
      expect(result.principal.deviceId).toBe("dev_1");
      expect(result.principal.actor.memberships).toEqual([
        { userId: "user_1", workspaceId: "ws_2", role: "admin" },
      ]);
    }
  });

  it("rejects expired, wrong-purpose, malformed, and tampered tokens", () => {
    const service = createService(new Date("2026-07-02T00:00:00.000Z"));
    const token = service.issueToken({
      actor,
      purpose: "api_access",
      expiresInSeconds: 60,
      developmentOnly: true,
    });
    const expiredService = createService(new Date("2026-07-02T00:02:00.000Z"));

    expect(expiredService.validateToken(token, "api_access")).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(service.validateToken(token, "realtime_session")).toEqual({
      ok: false,
      reason: "wrong_purpose",
    });
    expect(service.validateToken("not-a-token", "api_access")).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(service.validateToken(`${token}tampered`, "api_access")).toEqual({
      ok: false,
      reason: "invalid_signature",
    });
  });

  it("refuses to issue workspace tokens for non-member workspaces", () => {
    const service = createService();

    expect(() =>
      service.issueToken({
        actor,
        purpose: "realtime_session",
        workspaceId: "ws_other",
        expiresInSeconds: 300,
      }),
    ).toThrow("workspace_access_denied:no_membership");
  });
});
