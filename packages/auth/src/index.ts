import { createHmac, timingSafeEqual, webcrypto } from "node:crypto";
import { authorizeWorkspace, type Actor, type WorkspaceMembership } from "@dokeza/authz";
import { validateAuthTokenClaims, type AuthTokenClaims } from "@dokeza/contracts";

export type AuthTokenPurpose = AuthTokenClaims["purpose"];

export type AuthTokenValidationReason =
  | "malformed"
  | "invalid_signature"
  | "invalid_claims"
  | "invalid_issuer"
  | "invalid_audience"
  | "expired"
  | "wrong_purpose";

export interface DokezaAuthTokenServiceOptions {
  issuer: string;
  audience: string;
  signingSecret: string;
  now?: () => Date;
}

export interface IssueAuthTokenInput {
  actor: Actor;
  purpose: AuthTokenPurpose;
  expiresInSeconds: number;
  workspaceId?: string;
  deviceId?: string;
  developmentOnly?: boolean;
}

export interface AuthPrincipal {
  actor: Actor;
  claims: AuthTokenClaims;
  workspaceId?: string;
  deviceId?: string;
}

export type AuthTokenValidationResult =
  | { ok: true; principal: AuthPrincipal }
  | { ok: false; reason: AuthTokenValidationReason };

export type ProviderTokenValidationReason =
  | "malformed"
  | "invalid_signature"
  | "invalid_claims"
  | "invalid_issuer"
  | "invalid_audience"
  | "expired"
  | "unknown_key"
  | "jwks_unavailable";

export interface ProviderIdentity {
  providerSubject: string;
  email?: string;
  displayName?: string;
}

export type ProviderTokenValidationResult =
  | { ok: true; identity: ProviderIdentity }
  | { ok: false; reason: ProviderTokenValidationReason };

export interface JwksKey extends JsonWebKey {
  kid?: string;
  alg?: string;
  use?: string;
}

export interface JwksDocument {
  keys: JwksKey[];
}

export type JwksTransport = (url: string) => Promise<JwksDocument>;

export interface OidcJwtProviderVerifierOptions {
  issuer: string;
  audience: string;
  jwksUrl: string;
  now?: () => Date;
  jwksTransport?: JwksTransport;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlDecode(input: string): Buffer | undefined {
  try {
    const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
    return Buffer.from(normalized, "base64");
  } catch {
    return undefined;
  }
}

function sign(input: string, secret: string): string {
  return base64UrlEncode(createHmac("sha256", secret).update(input).digest());
}

function signaturesMatch(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

function parseJsonPart(part: string): unknown {
  const decoded = base64UrlDecode(part);
  if (decoded === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(decoded.toString("utf-8")) as unknown;
  } catch {
    return undefined;
  }
}

function parseJwtParts(token: string):
  | {
      headerPart: string;
      payloadPart: string;
      signaturePart: string;
      signedContent: string;
      header: unknown;
      claims: unknown;
    }
  | undefined {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return undefined;
  }

  const [headerPart, payloadPart, signaturePart] = parts;
  if (
    headerPart === undefined ||
    payloadPart === undefined ||
    signaturePart === undefined ||
    headerPart.length === 0 ||
    payloadPart.length === 0 ||
    signaturePart.length === 0
  ) {
    return undefined;
  }

  return {
    headerPart,
    payloadPart,
    signaturePart,
    signedContent: `${headerPart}.${payloadPart}`,
    header: parseJsonPart(headerPart),
    claims: parseJsonPart(payloadPart),
  };
}

function toTokenMembership(
  membership: WorkspaceMembership,
): AuthTokenClaims["memberships"][number] {
  return {
    workspace_id: membership.workspaceId,
    user_id: membership.userId,
    role: membership.role,
  };
}

function toActor(claims: AuthTokenClaims): Actor {
  return {
    userId: claims.sub,
    memberships: claims.memberships.map((membership) => ({
      workspaceId: membership.workspace_id,
      userId: membership.user_id,
      role: membership.role,
    })),
  };
}

export class DokezaAuthTokenService {
  private readonly issuer: string;
  private readonly audience: string;
  private readonly signingSecret: string;
  private readonly now: () => Date;

  constructor(options: DokezaAuthTokenServiceOptions) {
    this.issuer = options.issuer;
    this.audience = options.audience;
    this.signingSecret = options.signingSecret;
    this.now = options.now ?? (() => new Date());
  }

  issueToken(input: IssueAuthTokenInput): string {
    if (input.expiresInSeconds <= 0) {
      throw new Error("expiresInSeconds must be positive.");
    }

    const selectedMemberships =
      input.workspaceId === undefined
        ? input.actor.memberships
        : input.actor.memberships.filter(
            (membership) =>
              membership.userId === input.actor.userId &&
              membership.workspaceId === input.workspaceId,
          );

    if (input.workspaceId !== undefined) {
      const authorization = authorizeWorkspace(input.actor, input.workspaceId);
      if (!authorization.allowed) {
        throw new Error(`workspace_access_denied:${authorization.reason}`);
      }
    }

    const issuedAt = Math.floor(this.now().getTime() / 1000);
    const claims: AuthTokenClaims = {
      iss: this.issuer,
      aud: this.audience,
      sub: input.actor.userId,
      purpose: input.purpose,
      iat: issuedAt,
      exp: issuedAt + input.expiresInSeconds,
      memberships: selectedMemberships.map(toTokenMembership),
    };

    if (input.workspaceId !== undefined) {
      claims.workspace_id = input.workspaceId;
    }
    if (input.deviceId !== undefined) {
      claims.device_id = input.deviceId;
    }
    if (input.developmentOnly !== undefined) {
      claims.development_only = input.developmentOnly;
    }

    const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "DokezaAuthToken" }));
    const payload = base64UrlEncode(JSON.stringify(claims));
    const signature = sign(`${header}.${payload}`, this.signingSecret);
    return `${header}.${payload}.${signature}`;
  }

  validateToken(token: string, expectedPurpose?: AuthTokenPurpose): AuthTokenValidationResult {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return { ok: false, reason: "malformed" };
    }

    const [header, payload, signature] = parts;
    if (header === undefined || payload === undefined || signature === undefined) {
      return { ok: false, reason: "malformed" };
    }

    const expectedSignature = sign(`${header}.${payload}`, this.signingSecret);
    if (!signaturesMatch(expectedSignature, signature)) {
      return { ok: false, reason: "invalid_signature" };
    }

    const claims = parseJsonPart(payload);
    if (!validateAuthTokenClaims(claims)) {
      return { ok: false, reason: "invalid_claims" };
    }

    if (claims.iss !== this.issuer) {
      return { ok: false, reason: "invalid_issuer" };
    }
    if (claims.aud !== this.audience) {
      return { ok: false, reason: "invalid_audience" };
    }
    if (expectedPurpose !== undefined && claims.purpose !== expectedPurpose) {
      return { ok: false, reason: "wrong_purpose" };
    }

    const nowSeconds = Math.floor(this.now().getTime() / 1000);
    if (claims.exp <= nowSeconds) {
      return { ok: false, reason: "expired" };
    }

    return {
      ok: true,
      principal: {
        actor: toActor(claims),
        claims,
        ...(claims.workspace_id === undefined ? {} : { workspaceId: claims.workspace_id }),
        ...(claims.device_id === undefined ? {} : { deviceId: claims.device_id }),
      },
    };
  }
}

export function createDokezaAuthTokenService(
  options: DokezaAuthTokenServiceOptions,
): DokezaAuthTokenService {
  return new DokezaAuthTokenService(options);
}

export class OidcJwtProviderVerifier {
  private readonly issuer: string;
  private readonly audience: string;
  private readonly jwksUrl: string;
  private readonly now: () => Date;
  private readonly jwksTransport: JwksTransport;

  constructor(options: OidcJwtProviderVerifierOptions) {
    this.issuer = options.issuer;
    this.audience = options.audience;
    this.jwksUrl = options.jwksUrl;
    this.now = options.now ?? (() => new Date());
    this.jwksTransport = options.jwksTransport ?? defaultJwksTransport;
  }

  async verify(token: string): Promise<ProviderTokenValidationResult> {
    const parsed = parseJwtParts(token);
    if (parsed === undefined || !isProviderJwtHeader(parsed.header)) {
      return { ok: false, reason: "malformed" };
    }
    if (!isProviderJwtClaims(parsed.claims)) {
      return { ok: false, reason: "invalid_claims" };
    }
    if (parsed.claims.iss !== this.issuer) {
      return { ok: false, reason: "invalid_issuer" };
    }
    if (!audienceMatches(parsed.claims.aud, this.audience)) {
      return { ok: false, reason: "invalid_audience" };
    }
    if (parsed.claims.exp <= Math.floor(this.now().getTime() / 1000)) {
      return { ok: false, reason: "expired" };
    }

    let jwks: JwksDocument;
    try {
      jwks = await this.jwksTransport(this.jwksUrl);
    } catch {
      return { ok: false, reason: "jwks_unavailable" };
    }

    const header = parsed.header;
    const jwk = jwks.keys.find((key) => key.kid === header.kid);
    if (jwk === undefined) {
      return { ok: false, reason: "unknown_key" };
    }

    const signature = base64UrlDecode(parsed.signaturePart);
    if (signature === undefined) {
      return { ok: false, reason: "malformed" };
    }

    const verified = await verifyRs256Signature({
      jwk,
      signedContent: parsed.signedContent,
      signature,
    });
    if (!verified) {
      return { ok: false, reason: "invalid_signature" };
    }

    return {
      ok: true,
      identity: {
        providerSubject: parsed.claims.sub,
        ...(typeof parsed.claims.email === "string" && parsed.claims.email.length > 0
          ? { email: parsed.claims.email }
          : {}),
        ...(typeof parsed.claims.name === "string" && parsed.claims.name.length > 0
          ? { displayName: parsed.claims.name }
          : {}),
      },
    };
  }
}

async function defaultJwksTransport(url: string): Promise<JwksDocument> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("jwks_unavailable");
  }
  const payload = (await response.json()) as unknown;
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("keys" in payload) ||
    !Array.isArray(payload.keys)
  ) {
    throw new Error("invalid_jwks");
  }
  return { keys: payload.keys as JwksKey[] };
}

function isProviderJwtHeader(value: unknown): value is { alg: "RS256"; kid: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "alg" in value &&
    value.alg === "RS256" &&
    "kid" in value &&
    typeof value.kid === "string" &&
    value.kid.length > 0
  );
}

function isProviderJwtClaims(value: unknown): value is {
  iss: string;
  aud: string | string[];
  sub: string;
  exp: number;
  iat?: number;
  email?: unknown;
  name?: unknown;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "iss" in value &&
    typeof value.iss === "string" &&
    "aud" in value &&
    (typeof value.aud === "string" ||
      (Array.isArray(value.aud) && value.aud.every((entry) => typeof entry === "string"))) &&
    "sub" in value &&
    typeof value.sub === "string" &&
    value.sub.length > 0 &&
    "exp" in value &&
    typeof value.exp === "number"
  );
}

function audienceMatches(actual: string | string[], expected: string): boolean {
  return Array.isArray(actual) ? actual.includes(expected) : actual === expected;
}

async function verifyRs256Signature(input: {
  jwk: JsonWebKey;
  signedContent: string;
  signature: Buffer;
}): Promise<boolean> {
  try {
    const publicKey = await webcrypto.subtle.importKey(
      "jwk",
      input.jwk,
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256",
      },
      false,
      ["verify"],
    );
    return await webcrypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      input.signature,
      Buffer.from(input.signedContent),
    );
  } catch {
    return false;
  }
}
