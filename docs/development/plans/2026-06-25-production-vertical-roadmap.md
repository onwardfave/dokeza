# Dokeza Production Vertical Roadmap

## Goal

Build Dokeza into a production-ready application by proving one complete vertical first: desktop capture to realtime STT to live transcript to durable meeting record, with retention and reconnect behavior.

This roadmap is the implementation basis for future feature slices. Each slice must stay independently verifiable and should not widen into later milestones until the current vertical gate is working end to end.

## Requirements and Milestone

- Milestone 1: desktop shell, onboarding, audio capture, STT, session lifecycle, live transcript.
- Milestone 2: LLM orchestration and live suggestions.
- Milestone 3: knowledge ingestion, retrieval, and source grounding.
- Milestone 4: pre-call and post-call workflows.
- Milestone 5+: enterprise identity expansion, governance, billing, infrastructure, and advanced integrations.

Primary M1A requirements:

- FR-001 to FR-008: desktop shell and diagnostics.
- FR-020 to FR-025: account onboarding, workspace selection, permissions, and visible capture state.
- FR-040 to FR-047: audio capture, device handling, chunking, local buffering.
- FR-060 to FR-067: realtime STT and graceful STT failure behavior.
- FR-100 to FR-105: session lifecycle, rolling state, retention, deletion foundation.
- FR-200 to FR-208: live UI and overlay behavior.
- NFR-020 to NFR-024: recovery and reliability.
- NFR-040 to NFR-049: security, authz, isolation, data-flow discipline.
- NFR-060 to NFR-065: retention, export, privacy controls.

## Current State

Implemented foundation:

- Realtime TypeBox contracts and generated JSON Schema.
- Realtime WebSocket server with auth lifecycle, audio frame pairing, STT callback handling, transcript processing, explicit unsupported-feature errors, and session close reason mapping.
- STT adapter interface and Deepgram adapter.
- Transcript timeline sink interface, in-memory implementation, and retention policy gate.
- Workspace authz helper.
- Telemetry redaction package.
- Database RLS baseline migration for workspace-owned tables.
- Workspace-scoped database package with Drizzle schema and RLS transaction helper.
- PostgreSQL session store and transcript timeline sink interfaces/implementations with component tests, typed config factory wiring, realtime session lifecycle persistence hooks, and opt-in local PostgreSQL integration coverage.
- Desktop Tauri capability probes for audio, cache, crash diagnostics, realtime, shortcuts, and update policy.
- Desktop webview synthetic realtime client with protocol sequencing, deterministic PCM chunk generation, transcript/error/status handling, reconnect backoff, in-memory audio buffering, `audio.gap` emission for dropped buffered audio, resume request construction, and a visible live-session panel.
- Bounded native default-microphone capture can produce protocol-compatible mono 16 kHz PCM chunks and feed them into the desktop realtime client.
- Auth architecture baseline exists for hosted identity, Dokeza-owned workspace membership, and short-lived realtime session tokens.
- Local development PostgreSQL and pgvector stack.

Key gaps:

- No continuous desktop audio capture pipeline with device selection, pause/resume, and device-failure handling.
- No implemented hosted auth, development token issuer, or workspace provisioning flow.
- PostgreSQL-backed session and timeline persistence still needs automated CI execution against PostgreSQL.
- Reconnect/resume is implemented for in-process realtime recovery with original session reattachment, final-transcript replay by server sequence, and safe invalid-resume failure behavior; durable replay after realtime process restart still needs persisted server-sequence metadata.
- No live transcript product UI.
- No suggestion engine, prompt assembly, or LLM provider path.
- No knowledge ingestion or retrieval pipeline.
- No post-call processing, admin policy management, billing, production deployment, or cross-service E2E tests.

## Affected Architecture

M1A exercises every core boundary:

- Desktop native capture and UI.
- Desktop realtime protocol client.
- Realtime backend service.
- PostgreSQL data model and RLS.
- STT provider adapter.
- API service for workspace selection, auth token exchange, and session retrieval.
- Telemetry and diagnostics.

## Contracts and Data Model

M1A should avoid avoidable protocol churn. Existing realtime messages cover the target vertical:

- `auth.hello`
- `auth.accepted`
- `session.start`
- `audio.chunk_meta`
- binary audio frame
- `audio.gap`
- `transcript.partial`
- `transcript.final`
- `resume.request`
- `session.status`
- `error`
- `session.closed`

The data model must support:

- Durable meeting sessions.
- Workspace-scoped transcript segments and gaps.
- Session recovery state: last client/server sequence and current or prior connection ID.
- Retention-aware persistence decisions.

Reconnect/resume requires more than session columns. It must define replay semantics for missed server messages, starting with transcript timeline replay and server sequence tracking.

## Security and Privacy

- Keep workspace isolation explicit in every data access path.
- Use RLS-scoped transactions for PostgreSQL access.
- Do not log transcript text, prompt text, document text, suggestion content, or raw audio by default.
- `live_only` and `local_only` must block cloud transcript persistence.
- Provider credentials remain server-side only.
- Dev auth for M1A must be clearly marked as development-only if hosted identity implementation is staged after local vertical testing.
- Short-lived realtime tokens must be scoped to user, workspace, device where available, and session-start intent.

## Implementation Tasks

### M1A.0 - Local Database and Access Foundation

Goal: make PostgreSQL access safe enough to become the persistence foundation.

Tasks:

1. Finish `@dokeza/db` package with Drizzle schema matching SQL migrations.
2. Add or update tests that compare critical schema assumptions against migrations where practical.
3. Verify `withWorkspaceTransaction` sets `app.current_workspace_id` with `SET LOCAL`.
4. Keep the local Docker PostgreSQL and pgvector stack documented and scriptable.
5. Commit only after `pnpm check` passes.

Acceptance criteria:

- `@dokeza/db` typechecks.
- RLS helper rejects empty workspace IDs.
- Drizzle schema uses correct boolean and array column types for migration parity.
- Local DB stack can support later integration tests.

### M1A.1 - PostgreSQL Session and Transcript Persistence

Goal: replace in-memory-only meeting timeline persistence with workspace-scoped PostgreSQL implementations.

Status: partially implemented. `PgSessionStore` and `PgTranscriptTimelineSink` exist with component tests, typed config can construct PostgreSQL-backed realtime persistence, the realtime server can persist session start/end lifecycle through `SessionStore`, and opt-in local PostgreSQL integration tests cover the store/sink path; automated CI execution against PostgreSQL remains.

Tasks:

1. Add `SessionStore` interface and PostgreSQL implementation.
2. Add `PgTranscriptTimelineSink`.
3. Store final transcript segments and audio gaps with idempotency rules.
4. Preserve `live_only` and `local_only` no-storage behavior before any PG write.
5. Add integration tests against local PostgreSQL where possible, with RLS enabled.

Acceptance criteria:

- Final transcript segments persist to `transcript_segments`.
- Audio gaps persist to `transcript_gaps`.
- Cross-workspace reads/writes are blocked.
- Duplicate final segments do not create duplicates.
- Retention no-storage modes write nothing.

### M1A.2 - Reconnect and Resume

Goal: reconnect preserves one session identity and replays the durable transcript timeline safely.

Status: partially implemented. The realtime service supports authenticated resume of active or disconnected in-process sessions, preserves the original session ID, updates session recovery state, and replays bounded final-transcript messages by server sequence without duplicating transcript records. Durable replay after realtime process restart remains follow-up work because timeline records do not yet persist server sequence metadata.

Tasks:

1. Implement `resume.request` handler. Done for in-process active/disconnected sessions.
2. Persist session sequence state needed for resume. Done through `SessionStore.updateSeqState` on resume.
3. Define replay window and transcript replay behavior. Done for bounded in-process final-transcript replay using `last_server_seq`.
4. Emit `audio.gap` records for unrecoverable client-side buffer loss. Server-side gap persistence exists; client emission remains M1A.3/M1A.4.
5. Add reliability/property tests for reconnect. Component coverage exists; broader fault-injection and process-restart tests remain.

Acceptance criteria:

- Reconnect keeps the original session ID.
- Missed final transcripts can be replayed or recovered from durable timeline state.
- Repeated resume attempts do not duplicate transcript records.
- Invalid or cross-workspace resume attempts fail safely.

### M1A.3 - Desktop Realtime Client With Synthetic Audio

Goal: wire the desktop to the realtime server before adding native audio complexity.

Status: implemented for synthetic webview transport. The desktop TypeScript client can authenticate, send `session.start`, stream deterministic synthetic PCM chunks with `audio.chunk_meta` plus binary frames, receive transcript/error/status/close messages, schedule exponential reconnect, preserve buffered audio within policy limits, emit `audio.gap` metadata for dropped buffered audio, build resume requests from stored sequence state, flush buffered audio after resume, and expose connection state through a live-session panel.

Tasks:

1. Expand the desktop realtime client to run full auth/session/audio/transcript lifecycle. Done for synthetic webview transport.
2. Add synthetic PCM audio source for deterministic UI and protocol testing. Done.
3. Handle server `error`, `session.status`, `transcript.partial`, `transcript.final`, and `session.closed`. Done.
4. Add reconnect state machine with exponential backoff. Done for in-memory desktop client buffering and resume.

Acceptance criteria:

- Desktop can start a synthetic session and receive transcript messages.
- Recoverable errors do not crash the client.
- Connection state is visible in the UI.

### M1A.4 - Desktop Audio Capture, Windows First

Goal: capture real microphone audio and stream it through the proven realtime client.

Status: partially implemented. The native Tauri layer can capture a bounded default-microphone sample, downmix/resample it to mono 16 kHz `pcm_s16le`, chunk it into protocol-compatible 100 ms frames, and the webview can stream those chunks through the realtime client. Remaining work is continuous microphone streaming, explicit device selection, pause/resume capture state, and device-failure handling.

Tasks:

1. Implement Windows microphone capture first. Partially done for bounded default-device capture.
2. Add device selection and capture state machine.
3. Add chunking to protocol-compatible PCM frames. Done for bounded default-device capture.
4. Add dropped-audio buffering and `audio.gap` emission.
5. Defer Windows loopback and macOS system audio until after mic capture proves the vertical.

Acceptance criteria:

- Speech from the default microphone reaches the realtime service.
- Transcript appears within the latency target under normal conditions.
- Audio device disconnect degrades without crashing.

### M1A.Auth - Minimum Auth and Workspace Token Path

Goal: unblock authenticated realtime sessions and meeting retrieval without hardcoded tokens.

Tasks:

1. Select hosted identity provider or implement an explicitly development-only token issuer for local M1A testing.
2. Define auth-related REST schemas in `@dokeza/contracts` for profile, workspace list, workspace selection, and realtime token issuance.
3. Add API endpoints for authenticated user profile, workspace listing, and short-lived realtime token issuance.
4. Update realtime auth validation to accept only Dokeza-issued realtime tokens for non-test sessions.
5. Store desktop auth tokens using platform secure storage where available.
6. Add failure behavior for IdP outage, token issuance failure, expired token, and cross-workspace token use.

Acceptance criteria:

- Desktop can obtain a workspace-scoped realtime token without hardcoded credentials.
- Realtime rejects expired, malformed, wrong-purpose, and cross-workspace tokens.
- API exposes only workspaces where the user is a member.
- Auth telemetry excludes token values and customer content.

### M1A.5 - Live Transcript UI

Goal: make the vertical usable.

Prerequisite: either a hosted identity integration or an explicitly development-only token issuer must provide workspace-scoped realtime tokens. Hardcoded desktop tokens are not acceptable beyond synthetic local probes.

Tasks:

1. Add transcript panel with partial-to-final updates.
2. Add session controls: start, pause where supported, stop.
3. Add status bar for connected, reconnecting, degraded, local-only, and unavailable states.
4. Add compact overlay transcript view.

Acceptance criteria:

- User can start a session, speak, see transcript updates, stop the session, and know whether the session is degraded.

### M1B - Meeting Record and Post-Session Review

Goal: users can review and manage a completed meeting record.

Tasks:

1. Add meeting history API.
2. Add meeting detail API with transcript and gaps.
3. Add desktop review UI.
4. Add transcript search.
5. Add export to Markdown/JSON/clipboard.
6. Add delete meeting flow that respects policy.
7. Add retention cleanup job.

### M2 - Live AI Suggestions

Goal: manual suggestions stream from transcript context through a model gateway.

Tasks:

1. Prompt registry and prompt versions.
2. OpenAI streaming adapter behind AI orchestrator.
3. Rolling transcript context assembler.
4. `suggestion.request` routing.
5. `suggestion.stream_token` and `suggestion.complete` emission.
6. Cost and latency telemetry.
7. Suggestion UI.

### M3 - Knowledge Base and Source Grounding

Goal: uploaded knowledge can be retrieved and cited in live suggestions.

Tasks:

1. Document upload and storage.
2. Parsing and chunking.
3. Embeddings and pgvector storage.
4. Hybrid retrieval and reranking.
5. Permission-aware retrieval.
6. Source metadata in suggestions.
7. Retrieval eval set.

### Later Milestones

- M4: pre-call briefs and post-call workflows.
- M5: enterprise identity expansion, onboarding hardening, and admin-managed identity controls.
- M6: enterprise governance and admin console.
- M7: billing and usage metering.
- M8: production infrastructure and release operations.
- M9: role-specific packs, integrations, analytics, screen context, and local-first options.

## Tests and Verification

Every implementation slice must include:

- Targeted tests for changed packages/services.
- Workspace isolation tests for every database path.
- Content-redaction assertions for telemetry or diagnostics touched by the slice.
- `pnpm check` before completion.
- `pnpm generate:schemas` and diff review when contracts change.
- Rust `cargo test` when desktop native code changes.

## Documentation Updates

Update docs when a slice changes:

- Realtime protocol.
- Failure modes.
- Data flows.
- Multi-tenancy.
- Code architecture.
- Testing strategy or property catalogs.
- DevOps docs for local stack, deployment, or observability.

## Rollback or Degraded Behavior

- M1A must degrade to explicit unavailable or degraded states instead of silent drops.
- If PostgreSQL persistence fails, live transcript can continue with recoverable persistence errors.
- If STT fails, session remains open and status reflects degraded provider behavior.
- If reconnect fails, client emits gaps for dropped buffered audio.

## Open Questions

1. Auth implementation sequence: hosted provider from day one versus development-only issuer for local M1A testing before hosted provider integration.
2. Desktop platform priority: Windows-only M1A versus Windows plus macOS.
3. STT provider: continue with Deepgram first, then evaluate alternatives after M1A.
4. API/realtime topology: keep modular services rather than merge unless local development friction becomes a blocker.
5. Meeting review surface: desktop first for M1B, web later unless sharing becomes an immediate requirement.
