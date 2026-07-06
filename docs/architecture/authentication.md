# Dokeza Authentication Architecture

## 1. Purpose

This document defines the initial authentication architecture for Dokeza across desktop, REST API, realtime WebSocket sessions, and workspace-scoped backend services. It is intentionally provider-neutral at the application boundary so Dokeza can use a hosted identity provider early and still support enterprise SSO later.

## 2. Baseline Direction

Use a hosted identity provider for the first production-capable implementation. Dokeza should not hand-roll password storage, MFA, session refresh, or SSO protocols in the early product.

For M1A local development, Dokeza includes a development-only HMAC token issuer so the desktop, API, and realtime service can exercise the final internal token boundary before hosted identity provider selection. This issuer is not a production identity provider and must remain disabled outside local/test environments.

The internal Dokeza boundary is:

- The desktop client receives user authentication through the provider's supported desktop/browser flow.
- The API service validates hosted-provider ID/access tokens at `/v1/auth/provider/exchange` and issues short-lived Dokeza API tokens where needed.
- The realtime service validates Dokeza session tokens before accepting `auth.hello`.
- Workspace membership and role checks remain Dokeza-owned and are enforced by backend authorization code and PostgreSQL RLS.

Provider choices can include Clerk, Auth0, Supabase Auth, or an equivalent hosted IdP. The first implementation uses a provider-neutral OIDC/JWKS verification boundary so the vendor can be selected without changing desktop, REST, or realtime contracts. The final vendor choice must satisfy the requirements in this document before production alpha.

## 3. Identity Model

| Concept | Owner | Notes |
| --- | --- | --- |
| User identity | Hosted IdP | Email, MFA, login sessions, optional social login. |
| Workspace | Dokeza | Tenant boundary for meetings, documents, policies, and billing. |
| Membership | Dokeza | Maps provider user IDs to workspace IDs and roles. |
| Realtime session token | Dokeza | Short-lived token scoped to user, workspace, device, and session-start intent. |
| Development API token | Dokeza local/test only | Synthetic token for local M1A testing; unavailable outside local/test config. |
| Refresh token | Hosted IdP | Stored only through provider-supported secure desktop/browser mechanisms. |

Hosted provider tokens are not accepted directly by realtime or resource APIs. They are accepted only by the API exchange endpoint, verified against configured issuer, audience, expiration, RS256 signature, and JWKS key ID, then mapped to a Dokeza-owned user/workspace membership record before a Dokeza API token is issued.

## 4. Token Requirements

API and realtime authentication must validate:

- Issuer and audience.
- Expiration and not-before timestamps.
- Subject/provider user ID.
- Dokeza workspace ID or a server-side workspace selection check.
- Device ID where available.
- Token purpose, such as `api_access` or `realtime_session`.

Realtime session tokens should be short-lived, single-purpose, and scoped to the selected workspace. They must not contain transcript, prompt, document, suggestion, or raw audio content.

Development tokens are signed with `DOKEZA_AUTH_SIGNING_SECRET`; local/test environments have an explicit `dev_only` default, while production-like environments require a configured secret and reject `DOKEZA_DEV_AUTH_ENABLED=true`.

## 5. Desktop Flow

1. User starts sign-in from the desktop app.
2. Desktop opens the hosted IdP flow using the OS browser or approved embedded flow.
3. Desktop receives the provider completion signal using a secure redirect or provider SDK mechanism.
4. Desktop sends the provider token to `POST /v1/auth/provider/exchange`.
5. API verifies the provider token and returns a Dokeza API token plus authorized workspaces from Dokeza-owned membership state.
6. Desktop selects a workspace and requests a short-lived realtime session token for that workspace.
7. Desktop sends that realtime token in `auth.hello` over WSS.

Tokens stored on device must use platform secure storage where available. Logs, diagnostics, and telemetry must never include token values.

## 6. Service Responsibilities

| Service | Responsibility |
| --- | --- |
| API service | Provider token verification, provider-to-Dokeza token exchange, workspace listing, workspace selection, realtime token issuance, user profile endpoints. |
| Realtime service | Realtime token validation, workspace/user/session binding, recoverable auth failures, no provider refresh logic. |
| Database package | Workspace-scoped transactions with RLS using the selected workspace ID. |
| Authz package | Membership and role checks shared by API, realtime, and future services. |
| Auth package | Dokeza token signing/validation for internal API/realtime token boundaries, plus provider-neutral OIDC/JWKS token verification for the API exchange boundary. |

## 7. Failure and Degraded Behavior

- If the hosted IdP is unreachable during sign-in, desktop shows sign-in unavailable and does not start a session.
- If the API cannot issue a realtime token, desktop keeps the user signed in but marks live sessions unavailable.
- If provider-token exchange fails, desktop shows sign-in unavailable or retryable auth failure and does not fall back to development tokens.
- If a realtime token expires before session start, desktop requests a new token.
- If a token expires during an active realtime connection, the session may continue until the server policy requires renewal; reconnect must obtain a fresh token before `resume.request`.
- If workspace membership cannot be verified, access fails closed.
- If a development API token is presented outside local/test-enabled config, API access fails closed.

## 8. Security and Privacy

- Authentication verifies identity; Dokeza authorization still enforces workspace isolation.
- Provider access tokens, refresh tokens, and Dokeza realtime tokens are restricted secrets.
- Telemetry may include provider name, auth route, status code category, latency, and failure category only.
- No raw transcript, prompt, document, suggestion, or audio content is sent to the IdP.
- Enterprise SSO/SAML should be implemented through the hosted IdP or a dedicated enterprise auth boundary, not by bypassing Dokeza workspace authorization.

## 9. Testing and Verification

Required tests before production auth is considered complete:

- API rejects provider tokens with invalid issuer, audience, expiration, signature, unknown key ID, or unavailable JWKS.
- API rejects invalid issuer, audience, expired token, and wrong-purpose token.
- API lists only workspaces where the user is a member.
- Realtime rejects missing, expired, malformed, and cross-workspace tokens.
- Realtime resume rejects tokens for a different user, workspace, or device where device binding is enabled.
- Logs and telemetry redact token values.
- Local development auth remains explicitly marked as development-only.

## 10. Open Decisions

- Hosted IdP vendor.
- Desktop redirect or SDK mechanism.
- Durable PostgreSQL identity repository for provider subject, users, workspaces, and memberships. The first provider exchange slice includes an in-memory repository for local/test and injectable service tests.
- Device-binding strength for first beta.
- Enterprise SSO timing and required providers.
