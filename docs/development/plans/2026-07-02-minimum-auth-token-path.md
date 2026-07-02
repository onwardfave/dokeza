# Minimum Auth Token Path Implementation Plan

## Goal

Implement the M1A minimum auth path so local desktop/API/realtime flows can use workspace-scoped tokens instead of hardcoded realtime credentials. This slice uses a development-only issuer and validator behind Dokeza's internal auth boundary; hosted identity provider selection remains a later integration decision.

## Requirements and Milestone

- Milestone: M1A.Auth - Minimum Auth and Workspace Token Path.
- Requirements: FR-020 to FR-025, FR-100 to FR-105, NFR-040 to NFR-049.
- Roadmap acceptance:
  - Desktop/API can obtain a workspace-scoped realtime token without hardcoded credentials.
  - Realtime rejects expired, malformed, wrong-purpose, and cross-workspace tokens.
  - API exposes only workspaces where the authenticated user is a member.
  - Auth telemetry and errors exclude token values and customer content.

## Affected Architecture

- `@dokeza/contracts`: auth REST schemas and Dokeza auth token claims.
- `services/api`: development-only profile, workspace list, and realtime token issuance endpoints.
- `services/realtime`: token validator support for selected workspace and token purpose.
- `@dokeza/config`: auth issuer/audience/secret/TTL configuration.
- Docs: roadmap, auth architecture, local development.

## Contracts and Data Model

New REST contract schemas:

- `GET /v1/me`
- `GET /v1/workspaces`
- `POST /v1/realtime/token`

New internal token claims schema:

- issuer, audience, subject user ID, purpose, expiry, issued-at, workspace ID for realtime tokens, optional device ID, memberships for API/dev tokens.

No database migration is included in this slice. Development workspaces are synthetic in process memory.

## Security and Privacy

- Development tokens must be clearly marked as development-only.
- Production must fail closed without an explicitly configured hosted auth path or secure signing secret.
- Token parsing errors must not echo token values.
- Realtime tokens must be short-lived and single-purpose.
- Workspace access must be checked before issuing realtime tokens and again before accepting realtime auth.

## Implementation Tasks

1. Add auth contract schemas and generated JSON Schema artifacts.
2. Add HMAC-signed Dokeza auth token helper with deterministic tests.
3. Add auth config parsing for issuer, audience, TTL, and signing secret.
4. Add API auth middleware/helpers and endpoints for profile, workspaces, and realtime token issuance.
5. Update realtime `TokenValidator` to return selected workspace context and enforce realtime token purpose.
6. Add tests for invalid/expired/wrong-purpose/cross-workspace token behavior.
7. Update docs and roadmap status.

## Tests and Verification

- `pnpm --filter @dokeza/contracts test`
- `pnpm --filter @dokeza/config test`
- `pnpm --filter @dokeza/api test`
- `pnpm --filter @dokeza/realtime test`
- `pnpm generate:schemas` with reviewed diff.
- `pnpm check`

## Documentation Updates

- Production vertical roadmap: mark M1A.Auth as partially implemented with development-only issuer.
- Authentication architecture: document development issuer behavior and production fail-closed constraint.
- Local environment docs: document local auth headers and token endpoint.

## Rollback or Degraded Behavior

- If API token issuance fails, desktop remains signed in but cannot start realtime sessions.
- If realtime token validation fails, realtime returns `auth_failed` and closes the connection.
- If the configured signing secret is missing in production, config parsing fails.

## Open Questions

- Hosted IdP vendor and desktop redirect mechanism.
- Whether development auth is sufficient for the first internal E2E proof or hosted auth must be integrated before M1A.5.
