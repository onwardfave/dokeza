# Dokeza Authentication Architecture

## 1. Purpose

This document defines the initial authentication architecture for Dokeza across desktop, REST API, realtime WebSocket sessions, and workspace-scoped backend services. It is intentionally provider-neutral at the application boundary so Dokeza can use a hosted identity provider early and still support enterprise SSO later.

## 2. Baseline Direction

Use a hosted identity provider for the first production-capable implementation. Dokeza should not hand-roll password storage, MFA, session refresh, or SSO protocols in the early product.

The internal Dokeza boundary is:

- The desktop client receives user authentication through the provider's supported desktop/browser flow.
- The API service exchanges or validates provider credentials and issues short-lived Dokeza session tokens where needed.
- The realtime service validates Dokeza session tokens before accepting `auth.hello`.
- Workspace membership and role checks remain Dokeza-owned and are enforced by backend authorization code and PostgreSQL RLS.

Provider choices can include Clerk, Auth0, Supabase Auth, or an equivalent hosted IdP. The final choice must satisfy the requirements in this document before implementation.

## 3. Identity Model

| Concept | Owner | Notes |
| --- | --- | --- |
| User identity | Hosted IdP | Email, MFA, login sessions, optional social login. |
| Workspace | Dokeza | Tenant boundary for meetings, documents, policies, and billing. |
| Membership | Dokeza | Maps provider user IDs to workspace IDs and roles. |
| Realtime session token | Dokeza | Short-lived token scoped to user, workspace, device, and session-start intent. |
| Refresh token | Hosted IdP | Stored only through provider-supported secure desktop/browser mechanisms. |

## 4. Token Requirements

API and realtime authentication must validate:

- Issuer and audience.
- Expiration and not-before timestamps.
- Subject/provider user ID.
- Dokeza workspace ID or a server-side workspace selection check.
- Device ID where available.
- Token purpose, such as `api_access` or `realtime_session`.

Realtime session tokens should be short-lived, single-purpose, and scoped to the selected workspace. They must not contain transcript, prompt, document, suggestion, or raw audio content.

## 5. Desktop Flow

1. User starts sign-in from the desktop app.
2. Desktop opens the hosted IdP flow using the OS browser or approved embedded flow.
3. Desktop receives the provider completion signal using a secure redirect or provider SDK mechanism.
4. Desktop calls the API service to list authorized workspaces and select one.
5. Desktop requests a short-lived realtime session token for the selected workspace.
6. Desktop sends that token in `auth.hello` over WSS.

Tokens stored on device must use platform secure storage where available. Logs, diagnostics, and telemetry must never include token values.

## 6. Service Responsibilities

| Service | Responsibility |
| --- | --- |
| API service | Provider token verification, workspace listing, workspace selection, realtime token issuance, user profile endpoints. |
| Realtime service | Realtime token validation, workspace/user/session binding, recoverable auth failures, no provider refresh logic. |
| Database package | Workspace-scoped transactions with RLS using the selected workspace ID. |
| Authz package | Membership and role checks shared by API, realtime, and future services. |

## 7. Failure and Degraded Behavior

- If the hosted IdP is unreachable during sign-in, desktop shows sign-in unavailable and does not start a session.
- If the API cannot issue a realtime token, desktop keeps the user signed in but marks live sessions unavailable.
- If a realtime token expires before session start, desktop requests a new token.
- If a token expires during an active realtime connection, the session may continue until the server policy requires renewal; reconnect must obtain a fresh token before `resume.request`.
- If workspace membership cannot be verified, access fails closed.

## 8. Security and Privacy

- Authentication verifies identity; Dokeza authorization still enforces workspace isolation.
- Provider access tokens, refresh tokens, and Dokeza realtime tokens are restricted secrets.
- Telemetry may include provider name, auth route, status code category, latency, and failure category only.
- No raw transcript, prompt, document, suggestion, or audio content is sent to the IdP.
- Enterprise SSO/SAML should be implemented through the hosted IdP or a dedicated enterprise auth boundary, not by bypassing Dokeza workspace authorization.

## 9. Testing and Verification

Required tests before production auth is considered complete:

- API rejects invalid issuer, audience, expired token, and wrong-purpose token.
- API lists only workspaces where the user is a member.
- Realtime rejects missing, expired, malformed, and cross-workspace tokens.
- Realtime resume rejects tokens for a different user, workspace, or device where device binding is enabled.
- Logs and telemetry redact token values.
- Local development auth remains explicitly marked as development-only.

## 10. Open Decisions

- Hosted IdP vendor.
- Desktop redirect or SDK mechanism.
- Whether M1A uses a development token issuer before hosted provider integration.
- Device-binding strength for first beta.
- Enterprise SSO timing and required providers.
