# Dokeza Progress Tracker

Checkbox tracker derived from the [production alpha gate plan](plans/2026-07-06-production-alpha-gate.md) and [production vertical roadmap](plans/2026-06-25-production-vertical-roadmap.md). Updated as work lands.

**Legend:** `[x]` done · `[/]` partially done · `[ ]` not started

---

## M1A.0 — Local Database and Access Foundation

- [x] `@dokeza/db` package with Drizzle schema matching SQL migrations
- [x] Schema tests comparing critical column types against migration expectations
- [x] `withWorkspaceTransaction` sets `app.current_workspace_id` via `SET LOCAL`
- [x] RLS helper rejects empty workspace IDs
- [x] Local Docker Compose PG 17 + pgvector stack (`docker-compose.yml`)
- [x] `pnpm dev:infra` / `dev:infra:down` / `dev:infra:status` scripts
- [x] Migration 0002: session recovery columns
- [x] `pnpm check` passes

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
- [ ] System audio capture (Windows WASAPI loopback)
- [ ] macOS system audio capture

## M1A.Auth — Minimum Auth and Workspace Token Path

- [x] `@dokeza/auth` package: sign and validate Dokeza auth tokens
- [x] Development-only token issuer (local/test only, fail-closed outside)
- [x] Auth-related REST schemas in `@dokeza/contracts` (profile, workspace list, realtime token)
- [x] API endpoints: profile, workspace list, realtime token issuance (dev in-memory memberships)
- [x] Realtime accepts only Dokeza-issued realtime tokens (purpose, workspace, device context)
- [x] Desktop can request local dev realtime token
- [x] Provider-neutral OIDC/JWKS verification boundary at API (`POST /v1/auth/provider/exchange`)
- [/] Hosted IdP vendor selection and desktop redirect/SDK strategy
- [ ] Durable PostgreSQL identity / workspace provisioning
- [ ] Desktop secure token storage (platform keychain)
- [ ] Replace visible dev-token product flow with authenticated state
- [ ] Auth telemetry (metadata-only, no token values)

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
- [/] Delete meeting flow (workspace authz + repo delete; role/admin policy + audit later)
- [/] Retention cleanup job (workspace-scoped primitive; scheduling + audit later)

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
- [/] Cost/latency telemetry (metadata-only events exist; durable usage ledger remains)
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
- [/] Permission-aware retrieval (workspace isolation + explicit allowed-document filter; doc-level policy later)
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
- [/] Hosted IdP vendor + desktop redirect/SDK
- [ ] Durable PG identity/workspace provisioning
- [ ] Desktop secure token storage
- [ ] Replace dev-token product flow
- [ ] Auth telemetry

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
- [ ] Source selection / source cues in manual suggestions
- [ ] Desktop API client tests + view-model/UI tests

---

## Later Milestones (not started)

- [ ] M4: pre-call briefs and post-call workflows
- [ ] M5: enterprise identity expansion, onboarding hardening
- [ ] M6: enterprise governance and admin console
- [ ] M7: billing and usage metering
- [ ] M8: production infrastructure and release operations
- [ ] M9: role-specific packs, integrations, analytics, screen context, local-first options

---

## Documentation Debt

- [ ] Update `authentication.md` with selected hosted IdP details
- [ ] Update `data_flows.md` with hosted IdP token exchange
- [ ] Update `failure_modes.md` with auth, usage, desktop capture failures
- [ ] Update `multi_tenancy.md` with durable identity/membership
- [ ] Update `code_architecture.md` with `packages/db`, `packages/auth`
- [ ] Update `testing_strategy.md` with alpha E2E, failure injection, prompt/source evals
- [ ] Update `local_environment.md` with hosted auth local setup
