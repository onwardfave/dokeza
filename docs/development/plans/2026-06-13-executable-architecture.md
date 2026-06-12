# Executable Architecture Implementation Plan

## Goal

Create the first executable architecture slice for Dokeza: a TypeScript monorepo scaffold with shared contracts, typed config, authz, redacted telemetry, core backend service skeletons, initial RLS migrations, and a Tauri desktop spike shell. The slice proves the documented module boundaries compile and have tests before product features are built.

## Requirements and Milestone

- Milestone 0: Product and Architecture Foundation.
- Milestone 1: Core Desktop and Realtime Backbone.
- SRS requirements: FR-001, FR-006, FR-008, FR-040 to FR-047, FR-060 to FR-067, FR-100 to FR-105, NFR-025, NFR-026, NFR-047, NFR-048, NFR-100, NFR-103, NFR-104.

## Affected Architecture

- `packages/contracts`: realtime schemas and generated JSON Schema artifacts.
- `packages/config`: typed environment/config parsing.
- `packages/authz`: workspace authorization helpers.
- `packages/telemetry`: redacted logging and metrics helpers.
- `services/api`: REST health and workspace/auth surface placeholder.
- `services/realtime`: WebSocket protocol handler foundation.
- `services/ai-orchestrator`: model gateway/provider adapter boundary.
- `services/knowledge`: retrieval boundary with workspace-scoped API.
- `apps/desktop`: Tauri v2 spike shell and realtime protocol client placeholder.
- `infra/db`: PostgreSQL migration baseline with RLS for high-risk tables.

## Contracts and Data Model

- Realtime messages follow `docs/architecture/realtime_protocol.md`.
- JSON Schema generation is required for contract artifacts.
- Initial database migration must include `workspace_id` on tenant-owned tables and RLS policies for high-risk tables.
- No external provider calls are implemented in this slice; provider boundaries are stubbed.

## Security and Privacy

- Workspace isolation must be explicit in authz helpers, repository boundaries, and service stubs.
- Raw transcript, prompt, document, suggestion, and audio content must not be logged by default.
- Desktop does not stream directly to AI providers.
- All sample/test data must be synthetic.

## Implementation Tasks

1. Create pnpm workspace, TypeScript project references, Vitest configuration, and shared build/test scripts.
2. Implement `packages/contracts` with realtime schemas, validators, JSON Schema generation, and contract tests.
3. Implement `packages/config`, `packages/authz`, and `packages/telemetry` with unit tests.
4. Add service skeletons for API, realtime, AI orchestrator, and knowledge with boundary tests.
5. Add initial PostgreSQL migration with workspace tables, session tables, transcript gaps, documents, and RLS policies.
6. Add Tauri desktop spike shell structure and frontend protocol-client placeholder.
7. Run targeted verification after each commit-sized slice.

## Tests and Verification

- `pnpm test` for package and service unit/contract tests.
- `pnpm typecheck` for TypeScript project boundaries.
- Contract tests for realtime envelope validation, audio metadata, binary pairing state, `audio.gap`, and `session.closed`.
- Authz tests for workspace membership checks.
- Telemetry tests proving restricted content keys are redacted.
- Migration text checks for RLS enablement and workspace-scoped policies.

## Documentation Updates

- This implementation plan.
- Update docs only if implementation reveals a contract or architecture mismatch.
- Note Rust/Tauri verification limits if Rust toolchain is not available locally.

## Rollback or Degraded Behavior

- This slice is additive scaffold work.
- Realtime service stubs must emit recoverable errors for malformed frame sequences.
- Provider adapters remain no-op/stubbed until provider integration work begins.

## Open Questions

- Rust/Cargo are not installed in the current environment, so native Tauri build verification is blocked locally.
- Final Tauri spike acceptance requires Windows and macOS manual/native verification beyond this scaffold.
