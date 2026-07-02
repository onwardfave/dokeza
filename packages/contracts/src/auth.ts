import { Type, type Static, type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

const WorkspaceRole = Type.Union([
  Type.Literal("owner"),
  Type.Literal("admin"),
  Type.Literal("member"),
]);

const AuthTokenPurpose = Type.Union([
  Type.Literal("api_access"),
  Type.Literal("realtime_session"),
]);

export const AuthWorkspaceMembershipSchema = Type.Object({
  workspace_id: Type.String({ minLength: 1 }),
  user_id: Type.String({ minLength: 1 }),
  role: WorkspaceRole,
});

export const AuthTokenClaimsSchema = Type.Object({
  iss: Type.String({ minLength: 1 }),
  aud: Type.String({ minLength: 1 }),
  sub: Type.String({ minLength: 1 }),
  purpose: AuthTokenPurpose,
  iat: Type.Number({ minimum: 0 }),
  exp: Type.Number({ minimum: 0 }),
  workspace_id: Type.Optional(Type.String({ minLength: 1 })),
  device_id: Type.Optional(Type.String({ minLength: 1 })),
  development_only: Type.Optional(Type.Boolean()),
  memberships: Type.Array(AuthWorkspaceMembershipSchema),
});

export const UserProfileResponseSchema = Type.Object({
  user: Type.Object({
    user_id: Type.String({ minLength: 1 }),
    display_name: Type.String({ minLength: 1 }),
    development_only: Type.Boolean(),
  }),
});

export const WorkspaceListResponseSchema = Type.Object({
  workspaces: Type.Array(
    Type.Object({
      workspace_id: Type.String({ minLength: 1 }),
      name: Type.String({ minLength: 1 }),
      role: WorkspaceRole,
    }),
  ),
});

export const RealtimeTokenRequestSchema = Type.Object({
  workspace_id: Type.String({ minLength: 1 }),
  device_id: Type.Optional(Type.String({ minLength: 1 })),
});

export const RealtimeTokenResponseSchema = Type.Object({
  token: Type.String({ minLength: 1 }),
  token_type: Type.Literal("Bearer"),
  expires_at: Type.String({ minLength: 1 }),
  workspace_id: Type.String({ minLength: 1 }),
  development_only: Type.Boolean(),
});

export const DevAuthTokenRequestSchema = Type.Object({
  user_id: Type.Optional(Type.String({ minLength: 1 })),
  workspace_id: Type.Optional(Type.String({ minLength: 1 })),
  role: Type.Optional(WorkspaceRole),
  display_name: Type.Optional(Type.String({ minLength: 1 })),
});

export const DevAuthTokenResponseSchema = Type.Object({
  token: Type.String({ minLength: 1 }),
  token_type: Type.Literal("Bearer"),
  expires_at: Type.String({ minLength: 1 }),
  user_id: Type.String({ minLength: 1 }),
  development_only: Type.Literal(true),
});

export const AuthErrorResponseSchema = Type.Object({
  error: Type.Union([
    Type.Literal("auth_required"),
    Type.Literal("auth_invalid"),
    Type.Literal("workspace_access_denied"),
    Type.Literal("method_not_allowed"),
    Type.Literal("invalid_request"),
    Type.Literal("dev_auth_unavailable"),
  ]),
});

export type AuthWorkspaceMembership = Static<typeof AuthWorkspaceMembershipSchema>;
export type AuthTokenClaims = Static<typeof AuthTokenClaimsSchema>;
export type UserProfileResponse = Static<typeof UserProfileResponseSchema>;
export type WorkspaceListResponse = Static<typeof WorkspaceListResponseSchema>;
export type RealtimeTokenRequest = Static<typeof RealtimeTokenRequestSchema>;
export type RealtimeTokenResponse = Static<typeof RealtimeTokenResponseSchema>;
export type DevAuthTokenRequest = Static<typeof DevAuthTokenRequestSchema>;
export type DevAuthTokenResponse = Static<typeof DevAuthTokenResponseSchema>;
export type AuthErrorResponse = Static<typeof AuthErrorResponseSchema>;

export const authJsonSchemas = {
  "auth-token-claims": AuthTokenClaimsSchema,
  "user-profile-response": UserProfileResponseSchema,
  "workspace-list-response": WorkspaceListResponseSchema,
  "realtime-token-request": RealtimeTokenRequestSchema,
  "realtime-token-response": RealtimeTokenResponseSchema,
  "dev-auth-token-request": DevAuthTokenRequestSchema,
  "dev-auth-token-response": DevAuthTokenResponseSchema,
  "auth-error-response": AuthErrorResponseSchema,
} satisfies Record<string, TSchema>;

export function validateAuthTokenClaims(value: unknown): value is AuthTokenClaims {
  return Value.Check(AuthTokenClaimsSchema, value);
}

export function validateRealtimeTokenRequest(value: unknown): value is RealtimeTokenRequest {
  return Value.Check(RealtimeTokenRequestSchema, value);
}

export function validateDevAuthTokenRequest(value: unknown): value is DevAuthTokenRequest {
  return Value.Check(DevAuthTokenRequestSchema, value);
}
