import { createHmac, timingSafeEqual } from "node:crypto";
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

function toTokenMembership(membership: WorkspaceMembership): AuthTokenClaims["memberships"][number] {
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
