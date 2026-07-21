import { describe, expect, it } from "vitest";
import {
  beginAuth0DesktopSignIn,
  completeAuth0DesktopSignIn,
  openHostedAuthBrowser,
  refreshAuth0DesktopSignIn,
  type Auth0DesktopConfig,
  type HostedAuthCrypto,
  type HostedAuthFetch,
  type HostedAuthRandom,
} from "./hostedAuthFlow.js";

const config: Auth0DesktopConfig = {
  domain: "https://dokeza-alpha.us.auth0.com",
  clientId: "desktop_client_id",
  audience: "dokeza-api",
  redirectUri: "http://127.0.0.1:57619/auth/callback",
};

const deterministicRandom: HostedAuthRandom = {
  bytes(length) {
    return Uint8Array.from({ length }, (_, index) => (index + length) % 256);
  },
};

const deterministicCrypto: HostedAuthCrypto = {
  async sha256(input) {
    return Uint8Array.from(
      { length: 32 },
      (_, index) => (input.charCodeAt(index % input.length) + index) % 256,
    );
  },
};

describe("hostedAuthFlow", () => {
  it("builds an Auth0 authorization URL with PKCE, state, and nonce", async () => {
    const pending = await beginAuth0DesktopSignIn({
      config,
      random: deterministicRandom,
      crypto: deterministicCrypto,
    });
    const authorizeUrl = new URL(pending.authorizeUrl);

    expect(authorizeUrl.origin).toBe("https://dokeza-alpha.us.auth0.com");
    expect(authorizeUrl.pathname).toBe("/authorize");
    expect(authorizeUrl.searchParams.get("response_type")).toBe("code");
    expect(authorizeUrl.searchParams.get("client_id")).toBe("desktop_client_id");
    expect(authorizeUrl.searchParams.get("audience")).toBe("dokeza-api");
    expect(authorizeUrl.searchParams.get("redirect_uri")).toBe(
      "http://127.0.0.1:57619/auth/callback",
    );
    expect(authorizeUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorizeUrl.searchParams.get("scope")).toBe("openid profile email offline_access");
    expect(authorizeUrl.searchParams.get("state")).toBe(pending.state);
    expect(authorizeUrl.searchParams.get("nonce")).toBe(pending.nonce);
    expect(pending.codeVerifier).not.toEqual(authorizeUrl.searchParams.get("code_challenge"));
  });

  it("rejects a cleartext hosted identity domain", async () => {
    await expect(
      beginAuth0DesktopSignIn({
        config: { ...config, domain: "http://auth.example.test" },
        random: deterministicRandom,
        crypto: deterministicCrypto,
      }),
    ).rejects.toThrow("hosted_auth_invalid_config");
  });

  it("opens the hosted authorize URL through an injected browser boundary", async () => {
    const pending = await beginAuth0DesktopSignIn({
      config,
      random: deterministicRandom,
      crypto: deterministicCrypto,
    });
    const opened: string[] = [];

    await openHostedAuthBrowser(pending, (authorizeUrl) => {
      opened.push(authorizeUrl);
    });

    expect(opened).toEqual([pending.authorizeUrl]);
  });

  it("validates callback state and exchanges the code without a client secret", async () => {
    const pending = await beginAuth0DesktopSignIn({
      config,
      random: deterministicRandom,
      crypto: deterministicCrypto,
    });
    const calls: Array<{ input: string; body?: string; contentType?: string }> = [];
    const fetcher: HostedAuthFetch = async (input, init) => {
      calls.push({
        input,
        ...(init?.body === undefined ? {} : { body: init.body }),
        ...(init?.headers?.["content-type"] === undefined
          ? {}
          : { contentType: init.headers["content-type"] }),
      });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            id_token: "provider_id_token",
            access_token: "provider_access_token",
            refresh_token: "provider_refresh_token",
            expires_in: 3600,
          };
        },
      };
    };

    await expect(
      completeAuth0DesktopSignIn({
        config,
        pending,
        callbackUrl: `${config.redirectUri}?code=provider_code&state=${pending.state}`,
        fetcher,
      }),
    ).resolves.toEqual({
      providerToken: "provider_access_token",
      refreshToken: "provider_refresh_token",
      expiresIn: 3600,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe("https://dokeza-alpha.us.auth0.com/oauth/token");
    expect(calls[0]?.contentType).toBe("application/x-www-form-urlencoded");
    const body = new URLSearchParams(calls[0]?.body);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("client_id")).toBe("desktop_client_id");
    expect(body.get("code")).toBe("provider_code");
    expect(body.get("code_verifier")).toBe(pending.codeVerifier);
    expect(body.get("redirect_uri")).toBe(config.redirectUri);
    expect(body.has("client_secret")).toBe(false);
  });

  it("throws sanitized errors for rejected, mismatched, and failed callbacks", async () => {
    const pending = await beginAuth0DesktopSignIn({
      config,
      random: deterministicRandom,
      crypto: deterministicCrypto,
    });

    await expect(
      completeAuth0DesktopSignIn({
        config,
        pending,
        callbackUrl: `${config.redirectUri}?code=provider_secret_code&state=wrong`,
        fetcher: async () => {
          throw new Error("must_not_call_fetch");
        },
      }),
    ).rejects.toThrow("hosted_auth_state_mismatch");

    await expect(
      completeAuth0DesktopSignIn({
        config,
        pending,
        callbackUrl: `${config.redirectUri}?error=access_denied&error_description=provider_secret&state=${pending.state}`,
      }),
    ).rejects.toThrow("hosted_auth_callback_rejected");

    await expect(
      completeAuth0DesktopSignIn({
        config,
        pending,
        callbackUrl: `${config.redirectUri}?code=provider_secret_code&state=${pending.state}`,
        fetcher: async () => ({
          ok: false,
          status: 403,
          async json() {
            return { error: "invalid_grant", code: "provider_secret_code" };
          },
        }),
      }),
    ).rejects.toThrow("hosted_auth_token_exchange_failed:403");
  });

  it("renews provider tokens with a refresh token without a client secret", async () => {
    const calls: Array<{ input: string; body?: string }> = [];
    const fetcher: HostedAuthFetch = async (input, init) => {
      calls.push({ input, ...(init?.body === undefined ? {} : { body: init.body }) });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            access_token: "provider_access_token",
            refresh_token: "rotated_refresh_token",
          };
        },
      };
    };

    await expect(
      refreshAuth0DesktopSignIn({
        config,
        refreshToken: "provider_refresh_token",
        fetcher,
      }),
    ).resolves.toEqual({
      providerToken: "provider_access_token",
      refreshToken: "rotated_refresh_token",
    });

    const body = new URLSearchParams(calls[0]?.body);
    expect(calls[0]?.input).toBe("https://dokeza-alpha.us.auth0.com/oauth/token");
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("client_id")).toBe("desktop_client_id");
    expect(body.get("refresh_token")).toBe("provider_refresh_token");
    expect(body.has("client_secret")).toBe(false);
  });
});
