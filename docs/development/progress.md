# Dokeza SRS/MVP Progress Tracker

Checkbox tracker for full SRS/MVP completion, derived from the [SRS](../srs/realtime_meeting_copilot_srs.md), [traceability matrix](../srs/traceability_matrix.md), [production alpha gate plan](plans/2026-07-06-production-alpha-gate.md), and [production vertical roadmap](plans/2026-06-25-production-vertical-roadmap.md). Updated in the same commit as feature, workflow, or documentation changes that alter completion state.

**Legend:** `[x]` done · `[ ]` open · `Partial:` implemented foundation exists, production/completion gap remains · `Alpha-deferred:` outside the current production-alpha gate but still open for full SRS/MVP completion.

## Tracker Rules

- This file is the lightweight completion checklist for both full SRS/MVP and the current production-alpha execution gate; detailed rationale stays in the linked SRS, traceability matrix, roadmap, and alpha gate plan.
- Mark `[x]` only after the implementation is merged into repo state and verified with the relevant gate.
- Use `Partial:` instead of a checked box when contracts, fakes, local/test paths, or first UI slices exist but production storage, policy, provider, or operational wiring remains.
- Include SRS requirement IDs on MVP/full-SRS items wherever practical.
- Do not duplicate broad verification such as `pnpm check` as a permanent feature checkbox; record the latest broad verification below and keep per-slice verification in commit handoffs or QA docs.
- When a future slice changes feature status, update this file in the same commit as the implementation/docs.

## Completion Definitions

- **Production alpha complete:** the controlled Windows alpha workflow in `plans/2026-07-06-production-alpha-gate.md` is usable by a design partner with explicit degraded states.
- **MVP complete:** all SRS 9.1 must-haves and SRS 11.1 acceptance criteria are satisfied for Windows and macOS where required by the SRS.
- **Full SRS complete:** all SRS `Must` requirements are satisfied, and `Should` / `Could` requirements are either implemented or explicitly accepted as post-release scope in the SRS/traceability matrix.

Current status: production alpha is still open, MVP is not complete, and full SRS completion is not complete.

## Latest Broad Verification

- [x] 2026-07-06, SRS/MVP tracker alignment update: `pnpm check` passed.
- [x] 2026-07-06, progress tracker/process update: `pnpm check` passed.
- [x] 2026-07-06, commit `ee70b2e`: `pnpm check` passed; `pnpm generate:schemas` completed after auth contract/schema updates.

---

## SRS/MVP Dashboard

- [ ] Production alpha complete: Alpha.1 through Alpha.6 remain open.
- [ ] MVP complete: key blockers remain in auth/onboarding, macOS support, system audio, desktop productization, usage guardrails, post-call outputs, document upload UI/parsing, and E2E verification.
- [ ] Full SRS completion: post-call, calendar/pre-call, admin/audit, mandatory cost controls, billing/usage `Should` items, and cross-platform release readiness remain open.
- [x] Foundation architecture aligns with the SRS traceability matrix: desktop shell, realtime protocol, workspace isolation, provider abstraction, retention-aware persistence, and source-grounded retrieval foundations exist.

## MVP Scope Checklist (SRS 9.1)

- [ ] Windows and macOS desktop client.
- [ ] Authenticated user account.
- [ ] Partial: manual meeting start and stop exist in local/dev flow; production-authenticated UX remains open.
- [ ] Partial: microphone capture exists for bounded Windows capture; long-lived stream and QA remain open.
- [ ] System audio capture where feasible.
- [ ] Partial: streaming transcription exists through the realtime service and desktop live panel; production QA remains open.
- [x] Live transcript view foundation.
- [ ] Manual "suggest answer" hotkey/action in the productized overlay.
- [ ] Productized live suggestion overlay.
- [ ] Desktop document upload.
- [x] Basic vector retrieval foundation.
- [x] Source-grounded answer generation foundation for manual suggestions.
- [ ] Post-call summary.
- [ ] Action item extraction.
- [ ] Follow-up email draft.
- [ ] Basic settings and capture controls.

## MVP Acceptance Checklist (SRS 11.1)

- [ ] FR-001, FR-007, FR-009, FR-010, FR-011: user can install the desktop app on Windows and macOS through a release/update channel.
- [ ] FR-020, NFR-042, NFR-080: user can authenticate, complete onboarding, select a workspace, and store tokens in platform-secure storage.
- [ ] Partial: FR-100, NFR-084: user can manually start, pause, and stop a meeting session in the local/dev vertical; production-authenticated product flow remains open.
- [ ] Partial: FR-040, FR-060 to FR-063: permitted microphone audio can produce a live transcript in the Windows/local vertical; long-lived native streaming, system audio, macOS, and alpha QA remain open.
- [ ] FR-183, FR-200, NFR-001: app generates a useful suggestion from a manual hotkey/action within 3 seconds under normal conditions and proves that latency with measurements.
- [ ] Partial: FR-120, FR-123, FR-140, FR-143: backend can retrieve uploaded document context and return source metadata; desktop upload UI, binary parsing, reranking/evals, and source-selection UX remain open.
- [ ] FR-220, FR-221, FR-222, FR-224, FR-225: app produces post-call summary, action items, follow-up draft, editable notes, and export workflow.
- [ ] Partial: FR-105, NFR-062, NFR-063: meeting delete/export primitives exist; policy-aware delete, audit, and production UX verification remain open.
- [ ] FR-047, NFR-020 to NFR-026: app handles missing permissions, disconnected devices, reconnect, provider failures, and process-restart recovery without crashing or silent data loss.

## SRS Requirement Coverage

### Desktop Application Shell (FR-001 to FR-011)

- [ ] Partial: Windows Tauri shell and diagnostics foundation exist.
- [ ] macOS validation and installable macOS release path.
- [ ] Main app window covering onboarding, settings, integrations, billing, and meeting history.
- [ ] Global hotkeys for opening assistant, requesting suggestions, dismissing suggestions, and muting capture.
- [ ] Customizable hotkeys.
- [ ] Automatic updates, active-meeting update deferral, rollback, and stable/beta channels.
- [x] Diagnostics exclude sensitive transcript content by default.

### Onboarding and Permissions (FR-020 to FR-025, NFR-060, NFR-080)

- [ ] Production account creation/sign-in and workspace selection.
- [ ] Desktop hosted IdP redirect/SDK flow.
- [ ] Desktop secure token storage.
- [ ] First-run capture explanation and consent/disclosure copy.
- [ ] Independent controls for microphone, system audio, screen context, and document retrieval.
- [x] Visible capture/realtime state foundation exists in the desktop live-session surface.

### Audio Capture and STT (FR-040 to FR-067, NFR-020 to NFR-026)

- [ ] Partial: Windows selected/default microphone capture with protocol-compatible chunks exists.
- [ ] Long-lived native microphone stream.
- [ ] System audio capture where supported and authorized by the OS.
- [ ] macOS audio capture validation.
- [ ] VAD/silence detection to reduce unnecessary processing.
- [ ] Clear productized error states for missing permissions, unavailable loopback audio, and disconnected devices.
- [ ] Durable reconnect/replay after realtime process restart.
- [x] Cloud STT adapter boundary and realtime transcript persistence foundation exist.

### Meeting Session Management and Review (FR-100 to FR-105, NFR-061 to NFR-063)

- [x] Manual start/stop foundation exists.
- [ ] Production-authenticated live session flow without dev-token fields.
- [ ] Rolling meeting state with detected topics, open questions, decisions, and action items.
- [ ] Summarized older meeting context to control prompt size.
- [x] Retention-aware transcript/gap/suggestion persistence foundation exists.
- [ ] Policy-aware local/cloud delete, audit, and scheduled retention cleanup.

### Knowledge Base and Retrieval (FR-120 to FR-146)

- [ ] Desktop/web knowledge upload UI.
- [ ] Common document parsing for PDF, DOCX, TXT, Markdown, and HTML.
- [x] Text upload API, deterministic chunking, embeddings, pgvector storage, and hybrid retrieval foundation exist.
- [ ] Document-level permissions and admin remove/disable controls.
- [ ] Reranking and retrieval evaluation dataset.
- [x] Source metadata and authorized-source filtering foundation exists for manual suggestions.
- [ ] External knowledge sync from Notion, Google Drive, Confluence, or help centers.

### LLM Orchestration and Live Suggestions (FR-160 to FR-186, NFR-001, NFR-081)

- [x] Prompt registry, provider abstraction, bounded transcript context, streaming generation, source cues, and manual suggestion routing exist.
- [ ] Manual hotkey/action polish for "suggest answer", "summarize so far", and "suggest follow-up questions".
- [ ] Detected-question live answer generation.
- [ ] Objection and follow-up moment detection where role context is configured.
- [ ] Automatic trigger debounce and suppression of repetitive/low-confidence suggestions.
- [ ] Token/context budgets and measured latency gate for first useful suggestion under 3 seconds.
- [ ] Response validation for format, length, and source availability.
- [ ] User/workspace custom instructions.

### Overlay and Live UI (FR-200 to FR-208, NFR-082 to NFR-084)

- [ ] Productized compact overlay or side panel for live suggestions.
- [ ] Movable/resizable overlay with compact and expanded modes.
- [ ] Dismiss, copy, pin, and request-more actions.
- [ ] Assistant/capture status indicators for normal and degraded states.
- [ ] Privacy controls for accidental exposure during presentations.
- [x] Evasion-oriented product direction is explicitly prohibited in SRS and agent rules.

### Post-Call Processing (FR-220 to FR-226)

- [ ] Meeting summary generation after session end.
- [ ] Action item extraction with owner and due-date candidates.
- [ ] Follow-up email draft generation.
- [ ] Open questions and unresolved risk extraction.
- [ ] Editable generated notes before sharing/export.
- [ ] Markdown/PDF/clipboard note export.
- [ ] Structured output sync to CRM or connected systems remains post-MVP unless promoted.

### Calendar, Integrations, and Pre-Call Briefs (FR-240 to FR-251)

- [ ] Google Calendar integration.
- [ ] Microsoft Outlook Calendar integration.
- [ ] Explicit authorization and revoke flow for integrations.
- [ ] Calendar-based pre-call briefs from calendar metadata, meeting history, workspace knowledge, and participant context.
- [ ] Source metadata in pre-call briefs where available.
- [ ] HubSpot/Salesforce context is post-MVP unless required by a design partner.

### Administration, Billing, and Governance (FR-260 to FR-283, NFR-040 to NFR-065, NFR-110 to NFR-113)

- [ ] Durable workspace membership management with owner/admin/member roles.
- [ ] Workspace-level capture and retention policies.
- [ ] Admin audit logs.
- [ ] Usage analytics without meeting content.
- [ ] Free/paid plan model, usage limits, billing, and usage meters.
- [ ] TLS/at-rest encryption/security review evidence for production environments.
- [x] Workspace isolation, data-flow docs, threat model, and no-training policy foundations exist.
- [ ] Platform-secure token storage, selected subprocessors, and consent/disclosure documentation.
- [ ] Durable cost ledger, token budgets, debounce limits, and commercial cost threshold enforcement.

### Quality Gates and Evaluation (SRS 7.3, SRS 11.2, NFR-001 to NFR-005, NFR-103 to NFR-104)

- [ ] Crash-free desktop sessions exceed 99%.
- [ ] P95 manual suggestion latency below 3 seconds.
- [ ] P95 overlay render latency below 100 ms after receiving data.
- [ ] CPU and memory targets measured during typical meetings.
- [ ] STT provider failures produce visible fallback/error states.
- [ ] Security review confirms encryption, auth, retention, and access controls.
- [ ] Prompt/source evaluation demonstrates low hallucination rates on source-grounded Q&A test sets.
- [ ] Offline/online evaluation for STT WER, question detection, suggestion latency, retrieval relevance, hallucination rate, and user acceptance.

## M1A.0 — Local Database and Access Foundation

- [x] `@dokeza/db` package with Drizzle schema matching SQL migrations
- [x] Schema tests comparing critical column types against migration expectations
- [x] `withWorkspaceTransaction` sets `app.current_workspace_id` via `SET LOCAL`
- [x] RLS helper rejects empty workspace IDs
- [x] Local Docker Compose PG 17 + pgvector stack (`docker-compose.yml`)
- [x] `pnpm dev:infra` / `dev:infra:down` / `dev:infra:status` scripts
- [x] Migration 0002: session recovery columns

## M1A.1 — PostgreSQL Session and Transcript Persistence

- [x] `SessionStore` interface and `PgSessionStore` implementation
- [x] `PgTranscriptTimelineSink` implementation
- [x] Final transcript segments persist to `transcript_segments`
- [x] Audio gaps persist to `transcript_gaps`
- [x] Idempotent segment writes (duplicate finals do not create duplicates)
- [x] `live_only` / `local_only` retention modes write nothing
- [x] Typed config selects memory vs. PostgreSQL persistence
- [x] Realtime server persists session start/end lifecycle through `SessionStore`
- [x] Local opt-in PostgreSQL integration tests
- [x] CI PostgreSQL integration tests against `pgvector/pgvector:pg17`

## M1A.2 — Reconnect and Resume

- [x] `resume.request` handler for in-process active/disconnected sessions
- [x] Session sequence state persisted via `SessionStore.updateSeqState`
- [x] Bounded in-process final-transcript replay using `last_server_seq`
- [x] Repeated resume attempts do not duplicate transcript records
- [x] Invalid / cross-workspace resume attempts fail safely
- [ ] Durable replay after realtime process restart (timeline records lack server seq metadata)
- [ ] Broader fault-injection and process-restart tests

## M1A.3 — Desktop Realtime Client (Synthetic Audio)

- [x] Full auth/session/audio/transcript lifecycle over synthetic webview transport
- [x] Synthetic PCM audio source for deterministic testing
- [x] Handle `error`, `session.status`, `transcript.partial`, `transcript.final`, `session.closed`
- [x] Reconnect state machine with exponential backoff
- [x] Local audio buffer with policy limits
- [x] `audio.gap` emission for dropped buffered audio
- [x] Resume request construction from stored sequence state
- [x] Buffered audio flush after resume
- [x] Connection state exposed in live-session panel

## M1A.4 — Desktop Audio Capture (Windows Mic First)

- [x] Enumerate selectable input devices
- [x] Bounded selected/default microphone capture
- [x] Downmix / resample to mono 16 kHz `pcm_s16le`
- [x] Chunk into protocol-compatible 100 ms frames
- [x] Continuous capture controller over repeated bounded windows
- [x] Monotonic chunk reindexing across windows
- [x] Pause / resume / stop state machine
- [x] `audio.gap` for user pause and device capture failure
- [ ] Replace repeated bounded capture windows with long-lived native stream
- [ ] Alpha-deferred: system audio capture (Windows WASAPI loopback); open for SRS/MVP
- [ ] Alpha-deferred: macOS system audio capture; open for SRS/MVP

## M1A.Auth — Minimum Auth and Workspace Token Path

- [x] `@dokeza/auth` package: sign and validate Dokeza auth tokens
- [x] Development-only token issuer (local/test only, fail-closed outside)
- [x] Auth-related REST schemas in `@dokeza/contracts` (profile, workspace list, realtime token)
- [x] API endpoints: profile, workspace list, realtime token issuance (dev in-memory memberships)
- [x] Realtime accepts only Dokeza-issued realtime tokens (purpose, workspace, device context)
- [x] Desktop can request local dev realtime token
- [x] Provider-neutral OIDC/JWKS verification boundary at API (`POST /v1/auth/provider/exchange`)
- [x] PostgreSQL provider identity mapping and first-workspace provisioning foundation
- [x] Auth telemetry foundation (metadata-only, no token values)
- [x] Desktop secure token storage foundation (OS credential store for API session tokens)
- [ ] Select hosted IdP vendor
- [ ] Define desktop redirect/SDK strategy
- [ ] Full durable workspace provisioning and membership administration
- [ ] Hosted IdP refresh/session renewal in desktop secure storage
- [ ] Replace visible dev-token product flow with authenticated state

## M1A.5 — Live Transcript UI

- [x] Transcript panel with partial-to-final updates
- [x] Session controls: start, pause, stop
- [x] Status bar for connected, reconnecting, degraded, local-only, unavailable
- [x] Compact overlay transcript view (live in-memory broadcast)
- [x] Device selector with microphone selection

---

## M1B — Meeting Record and Post-Session Review

- [x] Meeting history API (authenticated, workspace-scoped, memory + PG repositories)
- [x] Meeting detail API with transcript and gaps
- [x] Desktop review panel (first version)
- [x] Transcript search (API history query + desktop panel)
- [x] Export to Markdown / JSON / clipboard
- [x] Delete meeting flow with workspace authorization and repository delete
- [ ] Add role/admin policy checks and audit to meeting delete
- [x] Retention cleanup repository primitive
- [ ] Schedule retention cleanup and add audit trail

---

## M2 — Live AI Suggestions

- [x] Prompt registry with versioned live prompt pack
- [x] OpenAI Responses streaming adapter boundary (injectable transport)
- [x] Bounded final-transcript context assembly
- [x] `suggestion.request` routing (manual, authenticated workspace/session)
- [x] `suggestion.stream_token` + `suggestion.complete` emission
- [x] Deterministic credential-free local streaming mode
- [x] Source retrieval: realtime queries knowledge repo, passes authorized chunks
- [x] Citation metadata in `suggestion.complete.sources`
- [x] `cloud_llm_allowed` policy enforcement
- [x] Durable suggestion persistence (request ID, server seq, prompt/model metadata, citations)
- [x] Desktop live-session panel suggestion display with source cues
- [x] Meeting review shows persisted suggestions
- [x] Cost/latency telemetry metadata events
- [ ] Automatic suggestion triggers
- [ ] Debounce / per-session rate limits
- [ ] Cost ledger storage
- [ ] Replay suggestions after process restart

---

## M3 — Knowledge Base and Source Grounding

- [x] Knowledge document upload/list/detail/search contracts + JSON Schema
- [x] Text document upload through workspace-scoped API
- [x] Deterministic text chunking
- [x] In-memory and PostgreSQL knowledge repositories
- [x] Deterministic local/test embeddings
- [x] OpenAI embedding adapter boundary
- [x] pgvector storage/indexing + vector index migration
- [x] Hybrid keyword + vector search with keyword-only fallback
- [x] `live_only` / `local_only` block cloud document + embedding persistence
- [x] Source metadata returned in manual live suggestions
- [x] Permission-aware retrieval foundation: workspace isolation and explicit allowed-document filter
- [ ] Document-level permission policy
- [ ] Reranking
- [ ] Desktop / web knowledge upload UI
- [ ] Retrieval evaluation dataset
- [ ] Binary file parsing (PDF, DOCX, HTML)
- [ ] Object storage for binary files

---

## Alpha Gate Slices (from production-alpha-gate.md)

### Alpha.0 — Gate and Roadmap Alignment
- [x] Production alpha gate plan added to repo
- [x] Roadmap references alpha gate as next hardening sequence

### Alpha.1 — Production Auth and Onboarding
- [x] Provider-neutral OIDC/JWKS verification boundary
- [x] `POST /v1/auth/provider/exchange` route
- [x] Development-only issuer (fail-closed outside local/test)
- [x] PostgreSQL provider identity mapping and first-workspace provisioning foundation
- [x] Auth telemetry foundation (metadata-only, no token values)
- [x] Desktop secure token storage foundation (OS credential store for API session tokens)
- [ ] Select hosted IdP vendor
- [ ] Implement desktop redirect/SDK flow
- [ ] Full durable workspace provisioning and membership administration
- [ ] Hosted IdP refresh/session renewal in desktop secure storage
- [ ] Replace dev-token product flow

### Alpha.2 — Desktop Productization Pass
- [ ] Live-session-first application surface (replace diagnostics-first layout)
- [ ] Diagnostics behind secondary QA surface
- [ ] First-run capture explanation + permission UX
- [ ] Collapse endpoint/workspace/token controls behind config + auth state
- [ ] Improved session controls (start, pause, resume, stop, request suggestion, copy, inspect sources)
- [ ] Overlay state for capture, reconnecting, degraded, suggestions unavailable
- [ ] Empty / loading / degraded / failed states for review + knowledge
- [ ] UI tests for view models + client state transitions

### Alpha.3 — Native Microphone Stream Hardening
- [ ] Long-lived native stream lifecycle (enumerate, start, emit PCM, pause, resume, stop, recover)
- [ ] Tauri event streaming or tested native-to-webview bridge for continuous PCM delivery
- [ ] Preserve mono 16 kHz `pcm_s16le` 100 ms chunk contract
- [ ] Handle device unavailable, permission denied, stream error, app shutdown
- [ ] Emit `audio.gap` for user pause, capture failure, buffer overflow
- [ ] Native Rust tests + TypeScript capture controller integration tests
- [ ] Windows manual QA with real microphone (30-minute session target)

### Alpha.4 — M2 Usage Guardrails
- [ ] Manual suggestion debounce + per-session request cap
- [ ] Token/context budgets (transcript, sources, prompt, output)
- [ ] Durable usage ledger
- [ ] Provider timeout/rate-limit → safe degraded states
- [ ] Metadata-only telemetry (latency, token counts, model, status)
- [ ] Tests for budget enforcement, debounce, rate-limit, redaction

### Alpha.5 — Production Alpha E2E Verification
- [ ] Manual E2E checklist for Windows alpha
- [ ] Automated service-level E2E (API auth → realtime → transcript → suggestion → review)
- [ ] Seeded local workflow script with synthetic data
- [ ] Failure injection: reconnect, token issuance, STT timeout, LLM timeout, retrieval, mic unavailable
- [ ] Verification evidence in docs

### Alpha.6 — Knowledge Upload UI
- [ ] Desktop knowledge panel (text/Markdown upload, list, detail, search)
- [x] Source cues in manual suggestions
- [ ] Source selection controls for knowledge-backed suggestions
- [ ] Desktop API client tests + view-model/UI tests

---

## SRS/MVP Later Milestones and Post-MVP Scope

- [ ] M4 / SRS MVP: post-call summaries, action items, follow-up drafts, editable notes, and calendar/pre-call workflow.
- [ ] M5 / Full SRS: enterprise identity expansion, onboarding hardening, roles, membership, and admin-managed controls.
- [ ] M6 / Full SRS: enterprise governance, admin console, audit logs, integration authorization, and revoke flows.
- [ ] M7 / Full SRS: billing, plans, usage limits, and usage meters.
- [ ] M8 / MVP/Beta readiness: production infrastructure, signed release operations, availability, latency, security review, and release QA.
- [ ] M9 / Full SRS or later: role-specific packs, CRM/ATS/support integrations, analytics, screen/browser context, and local-first options.

---

## Documentation Debt

- [x] Update `authentication.md` with provider-neutral hosted auth exchange boundary
- [ ] Update `authentication.md` with selected hosted IdP details
- [x] Update `data_flows.md` with provider-token exchange boundary
- [ ] Update `data_flows.md` with selected IdP redirect/session flow
- [x] Update `failure_modes.md` with hosted provider token exchange rejection
- [ ] Update `failure_modes.md` with usage guardrail and desktop capture failures
- [x] Update `multi_tenancy.md` with durable provider identity mapping
- [ ] Update `multi_tenancy.md` with full membership administration
- [ ] Update `code_architecture.md` with `packages/db`, `packages/auth`
- [ ] Update `testing_strategy.md` with alpha E2E, failure injection, prompt/source evals
- [x] Update `local_environment.md` with provider-neutral hosted auth env vars
- [ ] Update `local_environment.md` with selected IdP local setup
