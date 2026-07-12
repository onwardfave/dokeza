# Production Readiness Remediation Plan

## Goal

Move Dokeza from a deterministic local foundation to a trustworthy controlled Windows alpha by closing the stop-ship gaps found in the 2026-07-12 production audit. Work proceeds in small, verified, independently committed slices. Feature expansion remains secondary to policy enforcement, tenant isolation, real workflow evidence, and deployability.

## Requirements and Milestone

Primary gate: Production Alpha, with corrective work added ahead of Alpha.3 through Alpha.7.

Primary requirements:

- FR-020 to FR-025: hosted authentication, workspace selection, permissions, and capture disclosure.
- FR-040 to FR-067: reliable authorized microphone/STT behavior.
- FR-100 to FR-105: workspace policy, persistence, retention, deletion, and recovery.
- FR-120 to FR-146: authorized retrieval and source grounding.
- FR-160 to FR-169: provider policy and usage controls.
- NFR-020 to NFR-026: recovery and failure behavior.
- NFR-040 to NFR-049: TLS, authorization, token storage, workspace isolation, and threat controls.
- NFR-060 to NFR-065: retention, deletion, export, and disclosure.
- NFR-103 to NFR-113: automated verification, telemetry, usage attribution, and budgets.

## Affected Architecture

- `packages/config`, dependency lockfile, and GitHub Actions release gates.
- `services/realtime` authentication, workspace-policy resolution, provider submission, and retention-aware persistence.
- `services/api` mutation authorization, request hardening, and health/readiness behavior.
- `packages/db` and `infra/db` PostgreSQL roles, RLS enforcement, migrations, and adversarial tests.
- `apps/desktop` hosted-auth browser launch, hosted endpoint policy, native microphone lifecycle, and updater/release configuration.
- `infra/terraform`, service packaging, telemetry export, and staging deployment.
- Security, architecture, testing, progress, and operational documentation.

## Contracts and Data Model

- Keep the public realtime message schema stable where possible.
- Add an internal workspace-policy resolver used before `auth.accepted`, provider submission, and persistence.
- Use existing `workspace_policies` fields as the authoritative cloud STT, cloud LLM, screen-context, retention, and local-buffer policy source.
- Add database roles and grants through forward migrations; production application connections must not use a table-owner role.
- Any new audit or usage records require migrations, workspace scope, RLS, and generated contract changes where exposed publicly.

## Security and Privacy

- Fail closed when workspace policy cannot be resolved in a production-like PostgreSQL environment.
- Do not submit audio, transcript, prompts, queries, or document chunks to external providers when the corresponding policy is disabled.
- Enforce retention before transcript, gap, suggestion, document, chunk, or embedding persistence.
- Test RLS under a restricted application role; migration-string tests are not sufficient.
- Keep provider credentials and signing material outside the repository.
- Add request-size and rate boundaries before accepting untrusted uploads or repeated API mutations.

## Implementation Tasks

### Slice 0 - Truth and Gate Repair

1. Upgrade vulnerable dependencies and restore `pnpm security:audit`.
2. Repair PostgreSQL CI package resolution and run all PostgreSQL repository suites, including identity and knowledge.
3. Make CI build workspace packages before integration tests and retain strict security gates.
4. Align progress/roadmap status with demonstrated behavior.

### Slice 1 - Realtime Workspace Policy Enforcement

1. Add a workspace-policy resolver abstraction with in-memory/test and PostgreSQL implementations.
2. Resolve policy before `auth.accepted`; deny session setup safely when required policy state is unavailable.
3. Enforce `cloud_stt_allowed` before opening/sending to cloud STT.
4. Enforce `cloud_llm_allowed` for every external LLM provider, including OpenAI-compatible chat endpoints.
5. Enforce resolved retention mode in transcript, gap, and suggestion persistence.
6. Add provider-policy, no-storage, failure, and redaction tests.

### Slice 2 - Tenant and Mutation Hardening

1. Add restricted PostgreSQL application role support and force or otherwise prove RLS for tenant tables.
2. Run adversarial cross-workspace tests under the restricted role.
3. Add last-owner and owner-role mutation invariants.
4. Restrict meeting deletion to owner/admin or the meeting creator, subject to policy.
5. Add document permission evaluation before detail, search, retrieval, and citation.
6. Add audit records for sensitive membership, meeting deletion, document, and policy actions.

### Slice 3 - API and Hosted Desktop Boundary

1. Add bounded JSON request bodies, explicit CORS/origin policy, API rate limits, and readiness checks.
2. Replace `window.open` hosted sign-in with a supported Tauri system-browser integration.
3. Generate environment-specific CSP/connect policy for Auth0, HTTPS API, and WSS realtime endpoints.
4. Add installed-build hosted-auth tests where automatable and preserve human QA steps in the manual TODO ledger.

### Slice 4 - Native Capture Hardening

1. Implement a long-lived native microphone stream and typed native-to-webview event bridge.
2. Replace enumeration-index device identity with a stable-enough platform representation and recovery strategy.
3. Surface stream errors and permission/device failures; never discard callbacks silently.
4. Use a production-quality resampler or a measured, documented alternative.
5. Add pause/resume/stop/shutdown behavior, bounded buffering, and `audio.gap` guarantees.
6. Run automated lifecycle tests and leave 30/60-minute physical-device QA in the manual TODO ledger.

### Slice 5 - Hosted Foundation and Observability

1. Add backend container artifacts and configurable bind addresses.
2. Select and implement the minimal Terraform staging environment.
3. Add secrets-manager, TLS ingress, managed PostgreSQL/pgvector, migrations, and rollback path.
4. Wire metadata-only OpenTelemetry export and readiness/alert signals.
5. Configure a hosted desktop build without embedding credentials.

### Slice 6 - Usage, E2E, and Release Gate

1. Add transcript/source/instruction/output token budgets.
2. Add durable workspace/session/provider/feature usage ledger and spend thresholds.
3. Add authenticated API-to-realtime-to-review E2E tests.
4. Add failure injection for network, process restart, database, STT, LLM, retrieval, and microphone faults.
5. Add signed Windows installer/updater workflow and install/update/rollback QA.
6. Run the full design-partner workflow against staging.

## Tests and Verification

- Targeted TDD tests for each behavior before implementation.
- `pnpm security:audit` after dependency changes.
- PostgreSQL integration suites with migrations and the restricted application role.
- `pnpm check` before every completed implementation checkpoint.
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` for native changes.
- `pnpm --filter @dokeza/desktop build` for desktop behavior/config changes.
- Schema generation and drift checks for contract changes.
- Manual gates are recorded in `docs/development/manual-todos.md`; placeholders must fail closed and state the exact missing input.

## Documentation Updates

- Keep `docs/development/progress.md` and the production-alpha gate conservative.
- Update realtime protocol and failure modes for policy-unavailable behavior.
- Update multi-tenancy and data flows for restricted DB roles and provider policy enforcement.
- Update CI/CD and infrastructure docs when packaging and staging land.
- Archive or label historical audits/reviews that no longer describe current state.

## Rollback or Degraded Behavior

- Policy lookup failure blocks new cloud-backed realtime sessions in production-like PostgreSQL mode; local deterministic tests may use an explicit injected policy.
- Disabled cloud STT keeps capture local and reports transcription unavailable without provider submission.
- Disabled cloud LLM keeps the session/transcript active and returns a recoverable suggestion-unavailable state.
- No-storage policies keep live delivery but skip all governed cloud persistence.
- Invalid deployment or provider configuration fails at startup without logging secret values.
- Dependency or CI failures stop the checkpoint; they are not bypassed with documentation-only completion.

## Open Questions

Human, credential, vendor, and commercial decisions are tracked in `docs/development/manual-todos.md` so implementation can proceed with fail-closed placeholders.
