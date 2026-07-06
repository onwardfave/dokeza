export interface HostedAuthRandom {
  bytes(length: number): Uint8Array;
}

export interface HostedAuthCrypto {
  sha256(input: string): Promise<Uint8Array>;
}

export interface HostedAuthFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type HostedAuthFetch = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<HostedAuthFetchResponse>;

export interface Auth0DesktopConfig {
  domain: string;
  clientId: string;
  audience: string;
  redirectUri: string;
  scopes?: string[];
}

export interface PendingHostedAuth {
  authorizeUrl: string;
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
}

export interface HostedAuthTokenResult {
  providerToken: string;
  expiresIn?: number;
  refreshToken?: string;
}

export interface BeginHostedAuthInput {
  config: Auth0DesktopConfig;
  random?: HostedAuthRandom;
  crypto?: HostedAuthCrypto;
}

export interface CompleteHostedAuthInput {
  callbackUrl: string;
  pending: PendingHostedAuth;
  config: Auth0DesktopConfig;
  fetcher?: HostedAuthFetch;
}

export type HostedAuthBrowserOpen = (authorizeUrl: string) => void | Promise<void>;

const defaultScopes = ["openid", "profile", "email", "offline_access"];

export async function beginAuth0DesktopSignIn(
  input: BeginHostedAuthInput,
): Promise<PendingHostedAuth> {
  const config = normalizeConfig(input.config);
  const random = input.random ?? browserRandom();
  const crypto = input.crypto ?? browserCrypto();
  const codeVerifier = randomToken(random, 64);
  const state = randomToken(random, 32);
  const nonce = randomToken(random, 32);
  const challenge = base64UrlEncode(await crypto.sha256(codeVerifier));
  const url = new URL("/authorize", config.domain);

  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("audience", config.audience);
  url.searchParams.set("scope", (config.scopes ?? defaultScopes).join(" "));
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);

  return {
    authorizeUrl: url.toString(),
    state,
    nonce,
    codeVerifier,
    redirectUri: config.redirectUri,
  };
}

export async function openHostedAuthBrowser(
  pending: PendingHostedAuth,
  open: HostedAuthBrowserOpen = defaultBrowserOpen,
): Promise<void> {
  await open(pending.authorizeUrl);
}

export async function completeAuth0DesktopSignIn(
  input: CompleteHostedAuthInput,
): Promise<HostedAuthTokenResult> {
  const config = normalizeConfig(input.config);
  const callback = new URL(input.callbackUrl);
  const expectedRedirect = new URL(input.pending.redirectUri);

  if (
    callback.origin !== expectedRedirect.origin ||
    callback.pathname !== expectedRedirect.pathname
  ) {
    throw new Error("hosted_auth_callback_mismatch");
  }

  const error = callback.searchParams.get("error");
  if (error !== null) {
    throw new Error("hosted_auth_callback_rejected");
  }

  if (callback.searchParams.get("state") !== input.pending.state) {
    throw new Error("hosted_auth_state_mismatch");
  }

  const code = callback.searchParams.get("code");
  if (code === null || code.trim().length === 0) {
    throw new Error("hosted_auth_missing_code");
  }

  const fetcher = input.fetcher ?? fetch;
  const tokenUrl = new URL("/oauth/token", config.domain);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    code,
    code_verifier: input.pending.codeVerifier,
    redirect_uri: config.redirectUri,
  });
  const response = await fetcher(tokenUrl.toString(), {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`hosted_auth_token_exchange_failed:${response.status}`);
  }

  const payload = await response.json();
  if (!isRecord(payload)) {
    throw new Error("hosted_auth_invalid_token_response");
  }

  const providerToken = readToken(payload.id_token) ?? readToken(payload.access_token);
  if (providerToken === undefined) {
    throw new Error("hosted_auth_invalid_token_response");
  }

  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : undefined;
  const refreshToken = readToken(payload.refresh_token);
  return {
    providerToken,
    ...(expiresIn === undefined ? {} : { expiresIn }),
    ...(refreshToken === undefined ? {} : { refreshToken }),
  };
}

function normalizeConfig(config: Auth0DesktopConfig): Auth0DesktopConfig {
  const domain = config.domain.trim();
  const clientId = config.clientId.trim();
  const audience = config.audience.trim();
  const redirectUri = config.redirectUri.trim();

  if (
    domain.length === 0 ||
    clientId.length === 0 ||
    audience.length === 0 ||
    redirectUri.length === 0
  ) {
    throw new Error("hosted_auth_invalid_config");
  }

  return {
    ...config,
    domain: domain.endsWith("/") ? domain : `${domain}/`,
    clientId,
    audience,
    redirectUri,
  };
}

function browserRandom(): HostedAuthRandom {
  return {
    bytes(length: number) {
      const bytes = new Uint8Array(length);
      globalThis.crypto.getRandomValues(bytes);
      return bytes;
    },
  };
}

function browserCrypto(): HostedAuthCrypto {
  return {
    async sha256(input: string): Promise<Uint8Array> {
      const encoded = new TextEncoder().encode(input);
      const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
      return new Uint8Array(digest);
    },
  };
}

function defaultBrowserOpen(authorizeUrl: string): void {
  const opened = globalThis.open(authorizeUrl, "_blank", "noopener,noreferrer");
  if (opened === null) {
    throw new Error("hosted_auth_browser_open_failed");
  }
}

function randomToken(random: HostedAuthRandom, length: number): string {
  return base64UrlEncode(random.bytes(length));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readToken(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
