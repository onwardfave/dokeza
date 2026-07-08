# Alpha.1 Auth Telemetry Plan

## Goal

Add metadata-only authentication telemetry for the API auth boundary so production alpha can diagnose sign-in, workspace listing, and realtime token issuance without exposing bearer token values or customer content.

## Requirements and Milestone

- Alpha.1 production auth and onboarding.
- FR-020, NFR-042, NFR-047, NFR-104.
- Production alpha acceptance: token values do not appear in logs, telemetry, UI errors, diagnostics, or test snapshots.

## Affected Architecture

- `services/api`: emits auth-route telemetry events through an injectable sink.
- `packages/telemetry`: redaction treats token/secret/credential keys as restricted.

## Contracts and Data Model

- No REST API, realtime protocol, or database contract changes.
- Telemetry event contract gains API auth event names and metadata fields.

## Security and Privacy

- Events may include route, status, status category, latency, environment, development-only flag, user/workspace IDs when already authenticated, and failure category.
- Events must not include provider tokens, Dokeza API tokens, realtime tokens, secrets, transcript, prompt, document, suggestion, or audio content.

## Implementation Tasks

1. Strengthen telemetry redaction for token and secret fields.
2. Add API telemetry sink interface and default no-op sink.
3. Emit auth telemetry for dev-token issuance, provider-token exchange, profile, workspace list, and realtime-token issuance.
4. Add tests for success/failure events and redaction.
5. Update auth/progress docs.

## Tests and Verification

- `pnpm --filter @dokeza/telemetry test`
- `pnpm --filter @dokeza/api test`
- Final gate: `pnpm check`

## Documentation Updates

- `docs/architecture/authentication.md`
- `docs/development/progress.md`

## Rollback or Degraded Behavior

Telemetry emission failures should not block auth requests. The initial sink is in-process and no-op by default; production exporter wiring can be added later.

## Open Questions

- Final OTLP/exporter backend remains part of deployment observability work.
