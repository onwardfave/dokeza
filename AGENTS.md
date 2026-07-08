# Dokeza Agent Instructions

## Before Implementation

Read the relevant docs before changing code:

- `docs/srs/dokeza_full_system_scope.md`
- `docs/srs/realtime_meeting_copilot_srs.md`
- `docs/srs/traceability_matrix.md`
- `docs/architecture/c4_architecture.md`
- `docs/architecture/code_architecture.md`
- `docs/architecture/authentication.md`
- `docs/architecture/realtime_protocol.md`
- `docs/architecture/failure_modes.md`
- `docs/architecture/multi_tenancy.md`
- `docs/devops/infrastructure_architecture.md`
- `docs/devops/ci_cd_release.md`
- `docs/security/data_flows.md`
- `docs/security/threat_model.md`
- `docs/testing/testing_strategy.md`
- `docs/development/agent_workflow.md`
- `docs/development/progress.md`

`docs/development/agent_workflow.md` is the controlling execution playbook for multi-step agent work. For implementation turns, follow its planning, checkpoint commit, verification, documentation, living-lessons, and handoff rules before final response.

## Project Skills

Use the project-local skills in `.codex/skills/` when relevant:

- `dokeza-implementation-planning` for non-trivial implementation planning.
- `dokeza-tdd-execution` for feature implementation.
- `dokeza-reliability-testing` for property, fault, and reliability testing.
- `dokeza-systematic-debugging` for root-cause investigation before fixing bugs.
- `dokeza-verification-before-completion` for evidence-based completion claims.
- `dokeza-provider-integration` for external provider adapters, credentials, telemetry, retries, and data-flow updates.
- `dokeza-data-governance` for retention, deletion, no-storage, export, and sensitive-content persistence changes.
- `dokeza-rag-source-grounding` for embeddings, retrieval, source injection, citations, retrieval evals, and source-grounded suggestion safety.

## Current Technology Decisions

- Desktop shell: Tauri v2; Windows spike passed, macOS validation pending.
- Desktop UI: React + TypeScript inside Tauri WebView.
- Desktop native layer: Rust.
- Backend: TypeScript/Node.js initially, with stable JSON Schema contract artifacts.
- Infrastructure: Terraform-first.
- Realtime transport: WebSocket over TLS.

## Current Execution Gate

- Near-term work follows `docs/development/plans/2026-07-06-production-alpha-gate.md`.
- Full SRS/MVP and production-alpha completion status is tracked in `docs/development/progress.md`; update it in the same commit when a slice changes what is done, partial, alpha-deferred, or open.
- Alpha.1 production auth is complete. The active bottleneck order (revised 2026-07-08) is: Alpha.5a real-provider smoke test, Alpha.3 native microphone stream hardening, Alpha.4 usage guardrails, Alpha.7 deployment and signed install, then full Alpha.5 E2E verification, Alpha.6 knowledge upload UI, and remaining Alpha.2 polish.
- Hosted identity is implemented through a provider-neutral OIDC/JWKS verification boundary at the API service; Dokeza-owned workspace membership remains authoritative.

## Hard Rules

- Keep workspace isolation explicit in every data access path.
- Do not log raw transcript, prompt, document, or suggestion content by default.
- Do not add a new external data flow without updating `docs/security/data_flows.md`.
- Do not change realtime messages without updating `docs/architecture/realtime_protocol.md`.
- Do not add a failure behavior without updating `docs/architecture/failure_modes.md`.
- Do not mark a feature complete without updating `docs/development/progress.md` when the completion state changes.
- Do not finish an implementation turn with verified but uncommitted work when the user asked for commits; either commit coherent checkpoints or explicitly report the blocking reason.
- Do not implement evasion-oriented undetectability features.
