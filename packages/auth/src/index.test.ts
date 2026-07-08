import { createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createDokezaAuthTokenService } from "./index.js";
import { OidcJwtProviderVerifier, type JwksKey } from "./index.js";
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

describe("OidcJwtProviderVerifier", () => {
  const fixedNow = new Date("2026-07-02T00:00:00.000Z");

  it("validates RS256 provider tokens through JWKS without leaking token content", async () => {
    const key = createProviderKey("kid_1");
    const token = createProviderJwt({
      privateKey: key.privateKey,
      kid: "kid_1",
      payload: {
        iss: "https://idp.example.com/",
        aud: "dokeza-api",
        sub: "provider_user_1",
        email: "user@example.com",
        name: "Provider User",
        iat: 1782950400,
        exp: 1782954000,
      },
    });
    const verifier = new OidcJwtProviderVerifier({
      issuer: "https://idp.example.com/",
      audience: "dokeza-api",
      jwksUrl: "https://idp.example.com/.well-known/jwks.json",
      now: () => fixedNow,
      jwksTransport: async () => ({ keys: [key.publicJwk] }),
    });

    const result = await verifier.verify(token);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.identity).toEqual({
        providerSubject: "provider_user_1",
        email: "user@example.com",
        displayName: "Provider User",
      });
    }
    expect(JSON.stringify(result)).not.toContain(token);
  });

  it("rejects expired, wrong-audience, wrong-issuer, and unknown-key provider tokens", async () => {
    const key = createProviderKey("kid_1");
    const verifier = new OidcJwtProviderVerifier({
      issuer: "https://idp.example.com/",
      audience: "dokeza-api",
      jwksUrl: "https://idp.example.com/.well-known/jwks.json",
      now: () => fixedNow,
      jwksTransport: async () => ({ keys: [key.publicJwk] }),
    });
    const basePayload = {
      iss: "https://idp.example.com/",
      aud: "dokeza-api",
      sub: "provider_user_1",
      iat: 1782950400,
      exp: 1782954000,
    };

    await expect(
      verifier.verify(
        createProviderJwt({
          privateKey: key.privateKey,
          kid: "kid_1",
          payload: { ...basePayload, exp: 1 },
        }),
      ),
    ).resolves.toEqual({ ok: false, reason: "expired" });

    await expect(
      verifier.verify(
        createProviderJwt({
          privateKey: key.privateKey,
          kid: "kid_1",
          payload: { ...basePayload, aud: "other" },
        }),
      ),
    ).resolves.toEqual({ ok: false, reason: "invalid_audience" });

    await expect(
      verifier.verify(
        createProviderJwt({
          privateKey: key.privateKey,
          kid: "kid_1",
          payload: { ...basePayload, iss: "https://other.example.com/" },
        }),
      ),
    ).resolves.toEqual({ ok: false, reason: "invalid_issuer" });

    await expect(
      verifier.verify(
        createProviderJwt({
          privateKey: key.privateKey,
          kid: "kid_other",
          payload: basePayload,
        }),
      ),
    ).resolves.toEqual({ ok: false, reason: "unknown_key" });
  });
});

function createProviderKey(kid: string): { privateKey: KeyObject; publicJwk: JwksKey } {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicJwk = publicKey.export({ format: "jwk" }) as JwksKey;
  publicJwk.kid = kid;
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";
  return { privateKey, publicJwk };
}

function createProviderJwt(input: {
  privateKey: KeyObject;
  kid: string;
  payload: Record<string, unknown>;
}): string {
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT", kid: input.kid }));
  const payload = base64UrlEncode(JSON.stringify(input.payload));
  const signed = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(signed).sign(input.privateKey);
  return `${signed}.${base64UrlEncode(signature)}`;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
