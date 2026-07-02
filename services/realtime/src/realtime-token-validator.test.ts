import { describe, expect, it } from "vitest";
import { createDokezaAuthTokenService } from "@dokeza/auth";
import type { Actor } from "@dokeza/authz";
import { createDokezaRealtimeTokenValidator } from "./realtime-token-validator.js";

const now = new Date("2026-07-02T00:00:00.000Z");
const authOptions = {
  issuer: "https://auth.local.dokeza.dev",
  audience: "dokeza",
  signingSecret: "test_signing_secret_at_least_32_chars",
  now: () => now,
};

const actor: Actor = {
  userId: "user_1",
  memberships: [{ userId: "user_1", workspaceId: "ws_1", role: "member" }],
};

describe("DokezaRealtimeTokenValidator", () => {
  it("returns realtime auth context for a workspace-scoped realtime token", async () => {
    const tokenService = createDokezaAuthTokenService(authOptions);
    const validator = createDokezaRealtimeTokenValidator(authOptions);
    const token = tokenService.issueToken({
      actor,
      purpose: "realtime_session",
      workspaceId: "ws_1",
      deviceId: "dev_1",
      expiresInSeconds: 300,
      developmentOnly: true,
    });

    await expect(validator.validate(token)).resolves.toEqual({
      actor,
      workspaceId: "ws_1",
      deviceId: "dev_1",
    });
  });

  it("rejects API-purpose, expired, and unscoped tokens", async () => {
    const tokenService = createDokezaAuthTokenService(authOptions);
    const validator = createDokezaRealtimeTokenValidator(authOptions);
    const apiToken = tokenService.issueToken({
      actor,
      purpose: "api_access",
      expiresInSeconds: 300,
      developmentOnly: true,
    });
    const unscopedRealtimeToken = tokenService.issueToken({
      actor,
      purpose: "realtime_session",
      expiresInSeconds: 300,
      developmentOnly: true,
    });
    const expiredValidator = createDokezaRealtimeTokenValidator({
      ...authOptions,
      now: () => new Date("2026-07-02T00:10:00.000Z"),
    });

    await expect(validator.validate(apiToken)).resolves.toBeUndefined();
    await expect(validator.validate(unscopedRealtimeToken)).resolves.toBeUndefined();
    await expect(expiredValidator.validate(unscopedRealtimeToken)).resolves.toBeUndefined();
  });
});
