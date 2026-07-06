# Dokeza Production Feature Map (Initial Audit)

> [!NOTE]
> This document is the original strategic audit created on 2026-06-24 in conversation
> `83c98093-4f23-4684-9da4-11da40f44dac` ("Mapping Dokeza Production Roadmap").
> It proposed the "complete vertical first" thesis and identified the 6 foundational
> design decisions for M1A.
>
> **This document is archived for historical context.** The active execution plan is:
> - [`2026-07-06-production-alpha-gate.md`](2026-07-06-production-alpha-gate.md) — current controlling plan
> - [`2026-06-25-production-vertical-roadmap.md`](2026-06-25-production-vertical-roadmap.md) — canonical milestone structure
> - [`../progress.md`](../progress.md) — checkbox progress tracker

---

End-to-end feature inventory organized by milestone, grounded in a thorough audit of every implemented file versus every documented requirement. The next-action thesis is: **build one complete vertical first** (Milestone 1A below), then widen.

---

## Current State Audit (as of 2026-06-24)

### What Exists (code, not just docs)

| Layer | Implemented | Depth |
|-------|------------|-------|
| **Realtime contracts** | Full TypeBox schemas for every protocol message (auth, session, audio, transcript, suggestion, resume, flow-control, error) with validation helpers | Production-grade schemas |
| **Realtime WS server** | ws-server.ts — auth lifecycle, session start, audio chunk+binary frame validation, gap recording, context/suggestion `feature_unavailable` stubs, session end, backpressure, heartbeat, error codes | ~17 KB, heavily tested (~56 KB tests) |
| **Session manager** | session-manager.ts — in-memory session state, workspace-scoped auth, seq tracking, connection cleanup | Functional, in-memory only |
| **STT adapter interface** | stt-adapter.ts — provider-agnostic `SttAdapter` + `SttSession` contracts | Clean abstraction boundary |
| **Deepgram adapter** | deepgram-stt-adapter.ts — chunk-based and streaming modes, provider message mapping, telemetry, error recovery | ~439 lines, production-shape |
| **STT adapter factory** | stt-adapter-factory.ts — provider selection | Thin, correct |
| **Frame assembler** | frame-assembler.ts — audio chunk_meta + binary pairing | Clean |
| **Transcript processor** | transcript-processor.ts — dedup, ordering, suppression, session-closed guard | Solid |
| **Transcript timeline** | transcript-timeline.ts — `TranscriptTimelineSink` interface + `InMemoryTranscriptTimelineSink` (segments + gaps, workspace-scoped snapshots) | In-memory only; PostgreSQL sink is the gap |
| **Retention policy** | transcript-retention-policy.ts — persistence decision engine for live_only/local_only/cloud modes | Policy logic correct, no actual persistence yet |
| **Authz** | authz/index.ts — workspace role-based authorization | Functional |
| **Telemetry** | telemetry/index.ts — event creation with automatic content-key redaction, OTel resource attributes | Good, no OTel exporter wired yet |
| **Config** | `@dokeza/config` package with typed config | Imported everywhere |
| **AI orchestrator** | ai-orchestrator/index.ts — model route stub (`externalCallEnabled: false`) | Stub only |
| **Knowledge service** | knowledge/index.ts — retrieval request builder with authz check | Stub only |
| **API service** | api/http-server.ts — basic HTTP server | Skeleton |
| **Desktop UI** | App.tsx — diagnostics panel (mic, output, loopback, cache, crash, realtime WS, update policy probes) + overlay surface stub | Spike/QA UI, not product UI |
| **Desktop Rust** | src-tauri/src/ — audio_probe, cache_probe, crash_diagnostics, realtime_probe, update_policy, shortcuts | Probes, not capture pipeline |
| **Desktop protocol client** | realtimeClient.ts — basic WS client | Minimal |
| **Database** | 0001_workspace_rls_baseline.sql — 10 tables with RLS policies + pgvector | Schema correct, no CRUD layer yet |
| **Test fixtures** | `@dokeza/test-fixtures` package | Shared fixtures |

### What Did Not Exist Yet

| Gap | Impact |
|-----|--------|
| **No desktop audio capture pipeline** | Probes exist but no actual mic/system capture → STT → transcript flow |
| **No real auth/identity** | Token validation is mock; no OAuth/JWT, no user creation, no workspace provisioning |
| **No PostgreSQL data access layer** | Timeline sink, session store, and all CRUD are in-memory |
| **No reconnect/resume implementation** | Contract exists, server returns `session_not_resumable` |
| **No live transcript UI** | Overlay is a static placeholder |
| **No suggestion engine** | `feature_unavailable` stub; no prompt assembly, no LLM call, no streaming response |
| **No knowledge ingestion** | Request builder only; no parser, chunker, embedder, or vector search |
| **No post-call processing** | No summary, no action items, no follow-up draft |
| **No admin/policy management** | Schema exists, no API or UI |
| **No billing/metering** | Nothing |
| **No production infra** | Terraform directory exists, no modules |
| **No CI/CD pipeline** | `.github` exists, likely placeholder |
| **No E2E or load tests** | Unit/integration only |

---

## Design Decisions Resolved

These open questions were raised in this audit and resolved during M1A planning:

1. **Auth approach**: Managed hosted provider from day one (development-only issuer for local testing). → Resolved.
2. **PG hosting for dev**: Docker Compose locally, service container in CI. → Resolved.
3. **Desktop platform priority**: Windows full (mic + WASAPI loopback) + macOS mic-only for M1A; macOS system audio as fast-follow. → Resolved.
4. **STT provider**: Stay with Deepgram. → Resolved.
5. **Service topology**: Keep API and Realtime services separate. → Resolved.
6. **Meeting review surface**: Desktop first for M1B; web later. → Resolved.

---

## Distance Estimates (from 2026-06-24)

| Target | Distance from current state | Key blockers |
|--------|---------------------------|--------------| 
| **Internal technical alpha** (M1A complete) | 2–4 focused sprints | Audio capture pipeline, PG persistence, reconnect, live transcript UI, dev auth |
| **Internal dogfood** (M1A + M1B + M2) | 4–8 sprints | + suggestion engine, LLM integration, meeting review |
| **Private beta** (M1–M5) | 12–20 sprints | + knowledge base, calendar integration, production auth, onboarding UX |
| **Paid production** (M1–M8) | 20–35+ sprints | + billing, enterprise governance, production infra, security hardening, load testing |

> [!IMPORTANT]
> These are rough estimates for a small team (2-4 engineers). They depend heavily on team size, parallelization, and scope decisions. The key point is that **M1A is the minimum viable proof-of-architecture** and should be the exclusive focus until complete.
