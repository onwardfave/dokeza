import { describe, expect, it } from "vitest";
import {
  validateAuthTokenClaims,
  validateDevAuthTokenRequest,
  validateRealtimeTokenRequest,
} from "./auth.js";

describe("auth contracts", () => {
  it("accepts workspace-scoped realtime token claims", () => {
    expect(
      validateAuthTokenClaims({
        iss: "https://auth.local.dokeza.dev",
        aud: "dokeza",
        sub: "user_1",
        purpose: "realtime_session",
        iat: 1,
        exp: 301,
        workspace_id: "ws_1",
        device_id: "dev_1",
        development_only: true,
        memberships: [{ workspace_id: "ws_1", user_id: "user_1", role: "member" }],
      }),
    ).toBe(true);
  });

  it("rejects realtime token claims without memberships", () => {
    expect(
      validateAuthTokenClaims({
        iss: "https://auth.local.dokeza.dev",
        aud: "dokeza",
        sub: "user_1",
        purpose: "realtime_session",
        iat: 1,
        exp: 301,
        workspace_id: "ws_1",
      }),
    ).toBe(false);
  });

  it("accepts realtime token requests with an optional device id", () => {
    expect(validateRealtimeTokenRequest({ workspace_id: "ws_1", device_id: "dev_1" })).toBe(true);
    expect(validateRealtimeTokenRequest({ workspace_id: "ws_1" })).toBe(true);
  });

  it("accepts an empty development auth request for defaults", () => {
    expect(validateDevAuthTokenRequest({})).toBe(true);
  });
});
