# Production Alpha Gate Implementation Plan

## Goal

Move Dokeza from a local development alpha to a production-alpha workflow that a design partner can use under controlled conditions.

The production alpha gate is met when a real user can install the Windows app, sign in, select an authorized workspace, start a microphone-backed session, see live transcript updates, request a source-grounded live suggestion, stop the session, review/export/delete the meeting record, and see explicit degraded states for common failures.

This is not the full v1.0 commercial launch gate. It is the next hardening gate before broader beta work, billing, admin governance, CRM/email writeback, analytics, role packs, and full macOS product support.

## Requirements and Milestone

Primary milestones:

- Milestone 1: desktop shell, onboarding, audio capture, STT, session lifecycle, live transcript, meeting review foundation.
- Milestone 2: manual live AI suggestions, source cues, usage guardrails, latency/cost telemetry.
- Milestone 3: document upload, retrieval, embeddings, source-grounded suggestions.

Primary SRS requirements:

- FR-001 to FR-008: desktop app, overlay, hotkeys, diagnostics, update readiness.
- FR-020 to FR-025: account onboarding, workspace selection, permission explanations, capture controls.
- FR-040 to FR-047: microphone capture, device selection, chunking, device failure states.
- FR-060 to FR-067: realtime STT, partial/final transcript behavior, graceful STT failure.
- FR-100 to FR-105: session lifecycle, rolling state, persistence, deletion.
- FR-120 to FR-126: document upload, chunking, embeddings, source metadata, disable/remove foundation.
- FR-140 to FR-146: retrieval, source grounding, authorization, context minimization.
- FR-160 to FR-169: prompt routing, streaming generation, token budgets, debounce/cost control.
- FR-180 to FR-186: manual suggestions, relevance/suppression foundation, source cues.
- FR-200 to FR-208: live UI, overlay status, short suggestions, policy-safe display privacy framing.
- NFR-020 to NFR-026: reconnect, local buffering, recovery, realtime protocol behavior.
- NFR-040 to NFR-049: auth, token storage, workspace isolation, retention, data-flow discipline.
- NFR-060 to NFR-065: privacy controls, retention, deletion, export, disclosure documentation.
- NFR-080 to NFR-084: onboarding speed, concise UI, low-friction pause/stop.
- NFR-100 to NFR-104: modularity, prompt versioning, provider abstraction, telemetry.
- NFR-110 to NFR-113: usage ledger, token budgets, debounce, provider cost threshold.

Production alpha exit criteria:

- A user can complete first-run auth and workspace selection without dev-token fields.
- A user can start, pause, resume, and stop a microphone-backed session on Windows.
- The app shows live partial/final transcript updates and current capture/realtime state.
- A manual suggestion can use authorized uploaded knowledge and display source metadata.
- Completed transcript segments, gaps, and suggestions are visible in meeting review when retention permits.
- The user can export Markdown/JSON and delete a meeting record through workspace-scoped routes.
- Common failures are explicit: IdP unavailable, realtime token issuance failure, network reconnect, STT timeout, LLM timeout, retrieval fallback, microphone device failure.
- No raw transcript, prompt, document, suggestion, token, or raw audio content is written to telemetry or diagnostics by default.

## Affected Architecture

Primary surfaces:

- `apps/desktop`: onboarding, auth state, secure token storage, session controls, overlay/live session UI, knowledge upload UI, native microphone capture.
- `apps/desktop/src-tauri`: long-lived microphone stream, device failure behavior, secure local storage integration, diagnostics.
- `services/api`: hosted provider token verification, durable user/workspace membership, realtime-token issuance, knowledge and meeting review routes.
- `services/realtime`: authenticated realtime sessions, manual suggestion guardrails, source retrieval, transcript and suggestion persistence.
- `services/knowledge`: document upload/search UI backend support, retrieval authorization, ingestion failure behavior.
- `services/ai-orchestrator`: token budgets, prompt usage metadata, provider failure mapping, live suggestion limits.
- `packages/contracts`: auth, meeting, knowledge, and any new usage/telemetry contracts.
- `packages/db`: durable identity/workspace membership, usage ledger, and any audio/replay metadata migrations.
- `packages/telemetry`: metadata-only auth, provider, latency, and usage events.
- `infra` and `docs/devops`: only when staging deploy, signed release, or provider configuration moves beyond local alpha.

The production alpha should avoid realtime protocol churn unless long-lived native streaming exposes a necessary transport-level change. Current `audio.chunk_meta` plus binary audio frame pairs, `audio.gap`, `suggestion.request`, `suggestion.stream_token`, and `suggestion.complete` cover the intended gate.

## Contracts and Data Model

Expected contract work by slice:

- Hosted auth and onboarding:
  - REST auth/profile/workspace contracts may need provider-exchange or session-refresh schemas.
  - Realtime token request/response contracts should remain stable unless device binding changes.
  - Data model likely needs durable users, workspaces, memberships, and token/session metadata beyond development-only claims.

- Desktop productization:
  - Prefer no public contract changes.
  - Desktop client state model should distinguish unauthenticated, authenticated-no-workspace, live-ready, live-unavailable, and degraded states.

- Native microphone stream hardening:
  - Prefer no realtime protocol change.
  - Native command/event contract may change inside desktop only.
  - If streaming uses Tauri events, define typed event payloads and test them.

- M2 usage guardrails:
  - Data model should include a workspace/session/provider/feature usage ledger or equivalent durable events.
  - AI telemetry events must remain metadata-only.
  - Realtime errors may reuse `feature_unavailable` or add explicit rate/cost limit codes only with protocol-doc updates.

- Production alpha E2E:
  - No new contracts unless missing observability or test harness data reveals a gap.

- Knowledge upload UI:
  - Existing text document upload/list/detail/search contracts should be reused first.
  - Binary file/object storage and PDF/DOCX parsing are deferred unless needed for the first design partner.

Schema rules:

- Any contract change must update `@dokeza/contracts` tests and generated JSON Schema artifacts.
- Any database change must include migration coverage and workspace isolation tests.
- Any persisted customer-owned row must be workspace-scoped.

## Security and Privacy

Hard rules for every alpha slice:

- Hosted IdP tokens, refresh tokens, and Dokeza realtime/API tokens are restricted secrets.
- Desktop token storage must use platform-secure storage where available; diagnostics must not expose token values.
- API and realtime access must authorize workspace membership before reading or writing meetings, documents, suggestions, usage records, or policies.
- Retrieval and prompt assembly must remain server-side; the desktop must not pass arbitrary source text to the AI orchestrator.
- Provider credentials remain server-side only.
- `live_only` and `local_only` retention modes must block cloud transcript, gap, suggestion, document, chunk, and embedding persistence where applicable.
- Telemetry may include workspace/session IDs, provider route, model, token counts, latency, status, and error categories, but not customer content.
- New external data flows require `docs/security/data_flows.md` updates before implementation is considered complete.
- Any new failure behavior requires `docs/architecture/failure_modes.md` updates.

Trust-boundary notes:

- Auth0 is the selected production-alpha hosted IdP. The selected desktop redirect flow, token verification strategy, and desktop secure-storage behavior are documented in authentication and data-flow docs.
- OpenAI and Deepgram provider flows already exist in data-flow docs; guardrail work must not add content logging or direct desktop-provider calls.
- Knowledge upload remains text-only for the first UI slice unless object storage is intentionally introduced and documented.

## Implementation Tasks

### Alpha.0 - Gate and Roadmap Alignment

Goal: make this production alpha gate the durable source of near-term execution state.

Tasks:

1. Add this plan under `docs/development/plans/`.
2. Update the production vertical roadmap to reference this gate as the next hardening sequence.
3. Keep later milestones explicitly deferred: billing, admin console, CRM/email writeback, analytics, role packs, full macOS product support, and local-first processing.

Acceptance criteria:

- Future agents can recover the current bottleneck and slice order from docs without chat context.
- The next coding slice is unambiguous.

### Alpha.1 - Production Auth and Onboarding

Goal: replace development-token UX with a production-capable hosted IdP and workspace-selection path.

Status: implemented for the production-alpha gate. The API has a provider-neutral OIDC/JWKS verification boundary and `POST /v1/auth/provider/exchange` route that converts verified hosted provider tokens into short-lived Dokeza API tokens using Dokeza-owned workspace membership state. Local/test development auth remains available only when explicitly enabled. PostgreSQL provider identity mapping, first-workspace provisioning, metadata-only auth telemetry, desktop OS credential-store foundations, hosted PKCE sign-in, secure refresh/session renewal, and admin-managed membership routes exist. Auth0 is selected for production alpha, and the desktop strategy is the Auth0 Native Application Authorization Code with PKCE flow through the OS browser with an exact loopback callback on `127.0.0.1` for alpha. The live-session panel now defaults to hosted authenticated state while development-token controls are behind a developer disclosure.

Tasks:

1. Select hosted IdP and desktop redirect/SDK strategy. Done: Auth0 Native Application flow through OS browser with Authorization Code + PKCE and loopback callback for alpha.
2. Add provider token verification boundary in `services/api`. Done for provider-neutral OIDC/JWKS verification.
3. Add durable users, workspaces, memberships, and first-workspace provisioning path. Done with in-memory and PostgreSQL identity repositories plus admin membership routes.
4. Preserve development-only token issuer for local/test only and fail closed outside enabled local/test environments. Done.
5. Add desktop sign-in, sign-out, workspace selection, token refresh/retry states, and secure token storage. Secure API session token storage, hosted PKCE/loopback token exchange, and hosted refresh/session renewal are done; full productized authenticated state remains open.
6. Replace visible dev-token fields in normal product flow with authenticated state.
7. Add auth telemetry with no token values. Done for API auth boundary.
8. Update auth, data-flow, failure-mode, local environment, and roadmap docs. Done for provider exchange boundary.

Acceptance criteria:

- Desktop can sign in through the hosted flow and list only authorized workspaces.
- Desktop can obtain a short-lived workspace-scoped realtime token without a manually pasted token.
- API rejects invalid provider tokens and wrong-purpose Dokeza tokens.
- Realtime rejects missing, expired, malformed, wrong-workspace, wrong-user, and wrong-device tokens where device binding applies.
- Token values do not appear in logs, telemetry, UI errors, diagnostics, or test failure snapshots.

### Alpha.2 - Desktop Productization Pass

Goal: make the current desktop flow usable by a non-developer in the alpha cohort.

Status: partially implemented. The main desktop surface is live-session-first with meeting review beneath it, diagnostics are available through the secondary `#/qa` surface, and endpoint/workspace/token controls are behind hosted auth state plus developer configuration.

Tasks:

1. Replace the main development diagnostics-first layout with a live-session-first application surface.
2. Keep diagnostics available behind a secondary QA/developer surface.
3. Add first-run capture explanation and permission state UX for microphone and optional system audio.
4. Collapse endpoint/workspace/token controls behind environment config and authenticated workspace state.
5. Improve session controls: start, pause, resume, stop, request suggestion, copy suggestion, inspect sources.
6. Make overlay state clearer for capture, reconnecting, degraded provider, and suggestions unavailable.
7. Add empty, loading, degraded, and failed states for meeting review and knowledge surfaces.
8. Add UI tests around view models and client state transitions; use browser/desktop screenshots only when a dev server path is available.

Acceptance criteria:

- A user can reach the live session workflow without understanding local endpoints or dev tokens.
- The app shows one-action pause/stop controls.
- Meeting review, live transcript, and live suggestions avoid raw error dumps and content leakage.
- Diagnostics still expose metadata-only probes for QA.

### Alpha.3 - Native Microphone Stream Hardening

Goal: replace repeated bounded microphone capture windows with a long-lived native stream that is reliable enough for alpha meetings on Windows.

Tasks:

1. Define native stream lifecycle: enumerate, start selected/default device, emit PCM chunks, pause, resume, stop, recoverable failure.
2. Use Tauri event streaming or another tested native-to-webview bridge for continuous PCM chunk delivery.
3. Preserve mono 16 kHz `pcm_s16le` 100 ms chunk contract.
4. Handle device unavailable, permission denied, stream error, and app shutdown without crashing.
5. Emit `audio.gap` for user pause, capture failure, and local buffer overflow.
6. Add native Rust tests for chunking/resampling/lifecycle primitives and TypeScript tests for capture controller integration.
7. Run Windows manual QA with real microphone input and a meeting-app compatibility checklist.

Acceptance criteria:

- A 30-minute Windows microphone session does not rely on repeated bounded capture windows.
- Device failure degrades explicitly and does not crash the app.
- Pauses and capture failures produce gap metadata.
- Transcript partial latency remains within the documented target under normal conditions, or the measured gap is documented before proceeding.

### Alpha.4 - M2 Usage Guardrails

Goal: prevent provider spend and noisy suggestions before broader demos.

Tasks:

1. Add manual suggestion debounce and per-session request cap.
2. Add token/context budgets for transcript, retrieved sources, prompt instructions, and output.
3. Add durable usage ledger or durable metadata events for STT, LLM, embedding, and retrieval routes.
4. Map provider timeout/rate-limit failures to safe, user-visible degraded states.
5. Add metadata-only telemetry for latency, token counts, model/provider route, request counts, and status.
6. Add tests for budget enforcement, debounce, rate-limit behavior, and content redaction.
7. Update failure-mode, data-flow, testing, and roadmap docs.

Acceptance criteria:

- A session cannot spam unlimited manual live suggestions.
- Usage is attributable by workspace, session, feature, provider route, and model without storing prompt or output content in telemetry.
- Provider failure leaves the live session active and shows safe unavailable/degraded UI.
- Workspace policy that disables cloud LLM continues to block external calls.

### Alpha.5 - Production Alpha E2E Verification

Goal: prove the coherent alpha workflow end to end before adding more product surface.

Tasks:

1. Add a documented manual E2E checklist for Windows alpha.
2. Add automated service-level E2E where feasible: API auth, realtime session, fake STT transcript, manual suggestion, persistence, meeting review.
3. Add a seeded local workflow script or test harness that exercises API, realtime, knowledge, and meeting review with synthetic data.
4. Include failure cases: network reconnect, token issuance failure, STT timeout, LLM timeout, retrieval failure, microphone unavailable.
5. Capture verification evidence in docs without storing customer content.

Acceptance criteria:

- The documented alpha workflow can be run from a clean local/staging setup.
- Automated E2E covers at least one authenticated transcript-to-review path with synthetic data.
- Manual QA covers one real microphone-backed Windows session.
- Failures produce expected degraded behavior and no content leakage.

### Alpha.6 - Knowledge Upload UI

Goal: let alpha users seed knowledge without calling the REST API manually.

Tasks:

1. Add a desktop knowledge panel for text/Markdown upload, document list, document detail, and search.
2. Reuse existing authenticated workspace-scoped knowledge API routes.
3. Show source metadata and ingestion/search status without exposing document text in list views.
4. Add source selection or source cues in manual suggestions.
5. Keep binary files, object storage, PDF/DOCX/HTML parsing, reranking, and full document permission UI as follow-up unless required by the first design partner.
6. Add desktop API client tests and view-model/UI tests.

Acceptance criteria:

- A user can upload a text/Markdown document from the desktop product UI.
- A source-enabled manual suggestion can cite that document.
- Cross-workspace document reads and search remain blocked.
- `live_only` and `local_only` retention modes block cloud document/chunk/embedding persistence.

## Tests and Verification

Every alpha slice must run the narrow relevant checks plus final broad verification for its surface.

Common checks:

```text
pnpm check
pnpm generate:schemas
git diff --exit-code -- packages/contracts/generated/json-schema
git status --short
```

Auth/API checks:

```text
pnpm --filter @dokeza/auth test
pnpm --filter @dokeza/contracts test
pnpm --filter @dokeza/api test
```

Realtime checks:

```text
pnpm --filter @dokeza/realtime test
```

Knowledge/AI checks:

```text
pnpm --filter @dokeza/knowledge test
pnpm --filter @dokeza/ai-orchestrator test
```

Desktop checks:

```text
pnpm --filter @dokeza/desktop test
pnpm --filter @dokeza/desktop typecheck
pnpm --filter @dokeza/desktop build
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

Integration checks:

- PostgreSQL integration tests with `DOKEZA_PG_INTEGRATION=1`.
- Windows desktop native smoke build.
- Manual Windows microphone-session QA before alpha gate exit.
- Failure injection for reconnect, provider timeout, token issuance failure, and microphone unavailable before alpha gate exit.

Coverage expectations:

- Workspace isolation tests for every new repository path.
- Redaction assertions for every new telemetry, diagnostics, or error path.
- Contract tests for every REST or realtime message change.
- Prompt/source safety tests for every retrieval or suggestion change.
- Retention/no-storage tests for every new persistence path.

## Documentation Updates

Update these docs as slices land:

- `docs/development/plans/2026-06-25-production-vertical-roadmap.md`: current status and next bottleneck.
- `docs/architecture/authentication.md`: selected hosted IdP, desktop redirect/SDK path, secure token storage, token verification.
- `docs/architecture/realtime_protocol.md`: only if realtime messages or error codes change.
- `docs/architecture/failure_modes.md`: auth, provider, rate-limit, desktop capture, and E2E failure behavior.
- `docs/architecture/multi_tenancy.md`: durable identity/membership, usage ledger, or document permission changes.
- `docs/security/data_flows.md`: selected IdP, token exchange details, new provider flows, object storage if introduced.
- `docs/security/threat_model.md`: new threats from auth, usage ledger, secure storage, or file upload.
- `docs/testing/testing_strategy.md`: alpha E2E, failure injection, prompt/source-grounding evals.
- `docs/development/local_environment.md`: hosted auth local setup, alpha workflow, and test data.
- `docs/devops/desktop_release_operations.md`: signed alpha installer/update flow when release artifacts become active.

## Rollback or Degraded Behavior

Alpha features must fail closed for auth and fail explicit for live workflow.

- If hosted IdP sign-in is unavailable, desktop shows sign-in unavailable and does not start a new session.
- If API token exchange fails, desktop remains signed in but marks live sessions unavailable.
- If realtime reconnect fails, desktop keeps failure explicit and emits `audio.gap` for dropped buffered audio when applicable.
- If microphone capture fails, desktop pauses capture and prompts device selection rather than crashing.
- If STT fails, live session remains open and transcript state shows provider degradation.
- If LLM fails or rate limits, live session remains active and suggestions show unavailable/degraded state.
- If retrieval fails, suggestion generation falls back to transcript-only with empty sources and clear source cues.
- If meeting/suggestion persistence fails, live UI keeps delivered content visible and meeting review may show incomplete persistence status.
- If knowledge upload indexing fails, stored chunks remain searchable by keyword where retention allows, and semantic retrieval can retry later.

Rollback strategy:

- Hosted auth can retain the development-only issuer for local/test fallback, never production fallback.
- Desktop productization should keep diagnostics routes available for QA rollback.
- Native streaming can retain the bounded capture controller behind a local/dev fallback flag until long-run QA passes.
- Usage guardrails should default to stricter limits if configuration is invalid.

## Open Questions

1. Should the first signed alpha release keep loopback redirect or move to a claimed HTTPS/custom-domain redirect after installer signing and release-channel work?
2. Should production alpha target individual users only, or one shared team workspace with owner/member roles?
3. What is the first design-partner vertical for prompt/eval examples: sales, support, internal meetings, or general meetings?
4. What disclosure/consent copy should the desktop show before first capture?
5. What is the minimum acceptable Windows session duration for alpha QA: 30 minutes, 60 minutes, or longer?
6. Should system audio be required for the first alpha cohort, or is microphone-only acceptable with clear limitations?
7. Should knowledge upload UI stay desktop-only for alpha, or should a minimal web workspace be introduced earlier?
8. What provider cost threshold should block or warn during alpha if measured usage exceeds the planning assumption?
