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

## Project Skills

Use the project-local skills in `.codex/skills/` when relevant:

- `dokeza-implementation-planning` for non-trivial implementation planning.
- `dokeza-tdd-execution` for feature implementation.
- `dokeza-reliability-testing` for property, fault, and reliability testing.
- `dokeza-systematic-debugging` for root-cause investigation before fixing bugs.
- `dokeza-verification-before-completion` for evidence-based completion claims.
- `dokeza-provider-integration` for external provider adapters, credentials, telemetry, retries, and data-flow updates.
- `dokeza-data-governance` for retention, deletion, no-storage, export, and sensitive-content persistence changes.

## Current Technology Decisions

- Desktop shell: Tauri v2; Windows spike passed, macOS validation pending.
- Desktop UI: React + TypeScript inside Tauri WebView.
- Desktop native layer: Rust.
- Backend: TypeScript/Node.js initially, with stable JSON Schema contract artifacts.
- Infrastructure: Terraform-first.
- Realtime transport: WebSocket over TLS.

## Hard Rules

- Keep workspace isolation explicit in every data access path.
- Do not log raw transcript, prompt, document, or suggestion content by default.
- Do not add a new external data flow without updating `docs/security/data_flows.md`.
- Do not change realtime messages without updating `docs/architecture/realtime_protocol.md`.
- Do not add a failure behavior without updating `docs/architecture/failure_modes.md`.
- Do not implement evasion-oriented undetectability features.
