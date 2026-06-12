# Dokeza SRS to Scope Traceability Matrix

## 1. Purpose

This document maps requirements from `realtime_meeting_copilot_srs.md` to milestones and deliverables in `dokeza_full_system_scope.md`. It exists to prevent drift between product requirements, engineering scope, and release planning.

## 2. Requirement Group Mapping

| SRS Area | Requirement IDs | Full-System Milestone(s) | Scope Deliverable | Alignment |
| --- | --- | --- | --- | --- |
| Desktop application shell | FR-001 to FR-008 | Milestone 1, Milestone 10 | Desktop client, overlay, hotkeys, update channel, diagnostics | Aligned |
| Onboarding and permissions | FR-020 to FR-025 | Milestone 1, Milestone 7 | Account onboarding, permission prompts, workspace policy enforcement | Aligned |
| Audio capture | FR-040 to FR-047 | Milestone 1, Milestone 9 | Mic capture, system audio, VAD, chunking, local modes | Aligned |
| Speech-to-text | FR-060 to FR-067 | Milestone 1, Milestone 9 | Streaming STT, transcript segments, local STT option | Aligned |
| Screen and app context | FR-080 to FR-086 | Milestone 3, Milestone 5, Milestone 9 | Active window, OCR, browser extension, redaction | Priority updated: browser context is core for full product |
| Meeting session management | FR-100 to FR-105 | Milestone 1, Milestone 4, Milestone 10 | Session lifecycle, rolling state, retention | Aligned |
| Knowledge base | FR-120 to FR-127 | Milestone 3, Milestone 9 | Uploads, parsing, embeddings, permissions, source sync | Aligned |
| Retrieval and context assembly | FR-140 to FR-146 | Milestone 3, Milestone 5 | Hybrid retrieval, reranking, source grounding, role context | Aligned |
| LLM orchestration | FR-160 to FR-169 | Milestone 2, Milestone 5, Milestone 9 | Prompt registry, streaming generation, model routing, local/hybrid modes | Aligned |
| Live suggestion engine | FR-180 to FR-186 | Milestone 2, Milestone 5, Milestone 8 | Question detection, objection handling, ranking, suppression | Aligned |
| Overlay and live UI | FR-200 to FR-208 | Milestone 1, Milestone 2, Milestone 10 | Overlay, compact mode, status indicators, display privacy controls | Aligned |
| Post-call processing | FR-220 to FR-226 | Milestone 4, Milestone 6 | Summary, action items, follow-up, CRM-ready outputs | Aligned |
| Integrations | FR-240 to FR-247 | Milestone 4, Milestone 6 | Calendar, email, CRM, ATS, Slack, support systems | Aligned |
| Administration | FR-260 to FR-266 | Milestone 7 | RBAC, policies, audit logs, SSO, SCIM | Aligned |
| Billing and plans | FR-280 to FR-283 | Milestone 10 | Billing, plans, seats, usage metering | Aligned |
| Performance requirements | NFR-001 to NFR-005 | Milestone 1, Milestone 2, Milestone 10 | Latency, responsiveness, CPU, memory | Aligned |
| Reliability requirements | NFR-020 to NFR-024 | Milestone 1, Milestone 10 | Recovery, local state, retries, availability | Requires failure-mode spec |
| Security requirements | NFR-040 to NFR-046 | Milestone 7, Milestone 10 | Encryption, authz, retention, audit, model-training policy | Requires threat model and data flows |
| Privacy and compliance | NFR-060 to NFR-065 | Milestone 7, Milestone 9 | Retention, export, subprocessors, consent docs | Requires data-flow annotations |
| Maintainability | NFR-100 to NFR-104 | Milestone 0, Milestone 10 | Modular services, prompt versioning, provider abstraction, telemetry | Aligned |

## 3. Priority Corrections

### 3.1 Pre-Call Briefs

The full-system scope treats pre-call briefs as central to Dokeza's before/during/after meeting lifecycle. The SRS must treat pre-call briefs as `Must` for the full product, not a low-priority enhancement.

Required SRS alignment:

- Upgrade calendar-based pre-call briefs to `Must` for full-system scope.
- Add sub-requirements for account, participant, prior-meeting, and knowledge-base context.
- Keep advanced CRM-enriched brief quality dependent on integration availability.

### 3.2 Browser Extension Context

The full-system scope treats browser extension context as a platform capability. The SRS originally described structured browser context as `Could`, which is too low for the full Dokeza system.

Required SRS alignment:

- Browser extension context should be `Should` for early full product and `Must` for mature business/enterprise plans.
- OCR should remain available as fallback, but structured browser context should be preferred.
- Browser extension permissions must be transparent and revocable.

### 3.3 Realtime Protocol

The SRS requires streaming transcript and suggestions but does not define the contract. The realtime protocol spec now provides the baseline contract.

Required SRS alignment:

- Reference `docs/architecture/realtime_protocol.md`.
- Add explicit versioning, reconnection, and backpressure requirements.

### 3.4 Failure Modes

The SRS requires graceful recovery but lacks a failure matrix. The failure mode spec now defines expected system behavior.

Required SRS alignment:

- Reference `docs/architecture/failure_modes.md`.
- Treat failure injection tests as release gates for beta and commercial launch.

### 3.5 Multi-Tenancy and Trust Boundaries

The SRS requires authorization and privacy controls but does not define tenant isolation or data boundary behavior. The multi-tenancy and data-flow specs now provide these details.

Required SRS alignment:

- Reference `docs/architecture/multi_tenancy.md`.
- Reference `docs/security/data_flows.md`.
- Reference `docs/security/threat_model.md`.

## 4. Milestone Coverage

| Milestone | Must Cover These SRS Areas | Verification Source |
| --- | --- | --- |
| Milestone 0 | Architecture, threat model, provider choices, protocol baseline | C4 architecture, threat model, realtime protocol |
| Milestone 1 | Desktop shell, onboarding, audio capture, STT, session lifecycle | Desktop QA, protocol tests, STT latency metrics |
| Milestone 2 | LLM orchestration, live suggestion engine, overlay UX | Suggestion latency traces, prompt version logs |
| Milestone 3 | Knowledge base, retrieval, source grounding, tenant isolation | Retrieval evals, authz tests, vector isolation tests |
| Milestone 4 | Pre-call briefs, post-call outputs, calendar/email workflows | End-to-end workflow tests |
| Milestone 5 | Product verticals and role-specific prompts | Vertical eval sets and design partner review |
| Milestone 6 | CRM, ATS, support, Slack, email writeback | Integration tests and audit log verification |
| Milestone 7 | Admin, RBAC, SSO, SCIM, retention, audit | Enterprise readiness checklist |
| Milestone 8 | Analytics, coaching, quality dashboards | Analytics privacy checks and metric validation |
| Milestone 9 | Local-first and advanced privacy | Local-mode tests and policy enforcement tests |
| Milestone 10 | Billing, scale, reliability, commercial operations | Load tests, billing reconciliation, DR drill |

## 5. Orphan and Drift Checks

Before each milestone exits, the team should answer:

- Which SRS requirements are newly satisfied?
- Which requirements remain partially satisfied?
- Which scope deliverables lack SRS requirement IDs?
- Which SRS requirements no longer match product strategy?
- Which requirements have security or privacy implications not covered by the threat model?

## 6. Previously Known Gaps Closed by New Docs

| Gap | New Document |
| --- | --- |
| C4 architecture | `docs/architecture/c4_architecture.md` |
| Realtime protocol | `docs/architecture/realtime_protocol.md` |
| Failure mode matrix | `docs/architecture/failure_modes.md` |
| Multi-tenancy model | `docs/architecture/multi_tenancy.md` |
| Data-flow trust boundaries | `docs/security/data_flows.md` |
| Threat model | `docs/security/threat_model.md` |
| Infrastructure architecture | `docs/devops/infrastructure_architecture.md` |
| CI/CD and release strategy | `docs/devops/ci_cd_release.md` |
| Code architecture | `docs/architecture/code_architecture.md` |
| Testing strategy | `docs/testing/testing_strategy.md` |
| Agent development workflow | `docs/development/agent_workflow.md` |
