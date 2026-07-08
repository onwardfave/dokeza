# Dokeza

Dokeza is a real-time desktop meeting copilot. It captures authorized meeting audio, transcribes it live, retrieves relevant workspace knowledge, and streams concise, source-grounded suggestions to a desktop overlay — with post-call summaries and follow-ups planned next.

Dokeza is explicitly **not** designed for evasion. Display-privacy features exist to prevent accidental exposure of private notes, not to defeat proctoring, meeting transparency, or platform detection. See the [SRS](docs/srs/realtime_meeting_copilot_srs.md#12-product-vision).

## Status

Pre-release. The current execution gate is the [production alpha gate](docs/development/plans/2026-07-06-production-alpha-gate.md): a controlled Windows alpha where a design partner can sign in, run a microphone-backed live session, request source-grounded suggestions, and review/export/delete the meeting record. Completion state is tracked in [docs/development/progress.md](docs/development/progress.md).

## Architecture at a glance

- **Desktop app** (`apps/desktop`): Tauri v2 shell — Rust native layer for audio capture and secure storage, React + TypeScript UI in the WebView.
- **API service** (`services/api`): REST gateway — auth exchange, workspaces, meeting review, knowledge routes.
- **Realtime service** (`services/realtime`): WebSocket session service — audio ingest, STT bridging, transcript timeline, live suggestions.
- **Knowledge service** (`services/knowledge`): chunking, embeddings, pgvector-backed hybrid retrieval.
- **AI orchestrator** (`services/ai-orchestrator`): prompt registry, provider adapters, streaming generation.
- **Shared packages** (`packages/`): contracts (TypeBox + generated JSON Schema), auth, authz, config, db (Drizzle + RLS helpers), telemetry, test fixtures.
- **Data**: PostgreSQL 17 + pgvector, row-level security keyed on `workspace_id`.

Deeper reading: [C4 architecture](docs/architecture/c4_architecture.md), [code architecture](docs/architecture/code_architecture.md), [realtime protocol](docs/architecture/realtime_protocol.md), [ADRs](docs/architecture/adr/).

## Getting started

Prerequisites: Node (see `.node-version`), pnpm 10, Rust (see `rust-toolchain.toml`), Docker Desktop. Windows setup helpers live in `scripts/setup-windows-dev.ps1` and `scripts/verify-toolchain.ps1`.

```powershell
pnpm install
pnpm dev:infra          # local PostgreSQL 17 + pgvector
pnpm db:migrate
pnpm check              # format check, lint, typecheck, all tests
pnpm --filter @dokeza/desktop tauri dev   # run the desktop app
```

Full local setup, environment variables, and hosted-auth configuration: [docs/development/local_environment.md](docs/development/local_environment.md).

## Development workflow

- Contracts are source-of-truth TypeBox schemas; regenerate JSON Schema artifacts with `pnpm generate:schemas` (CI fails on drift).
- Every persisted customer-owned row is workspace-scoped; workspace isolation tests are required for new data paths.
- Raw transcript, prompt, document, and suggestion content is never logged by default; telemetry is metadata-only.
- Agent contributors: [AGENTS.md](AGENTS.md) is the entry point; `docs/development/agent_workflow.md` is the execution playbook.

## Key documentation

| Area | Doc |
| --- | --- |
| Requirements | [SRS](docs/srs/realtime_meeting_copilot_srs.md), [traceability matrix](docs/srs/traceability_matrix.md) |
| Current gate & progress | [Production alpha gate](docs/development/plans/2026-07-06-production-alpha-gate.md), [progress tracker](docs/development/progress.md) |
| Security & privacy | [Data flows](docs/security/data_flows.md), [threat model](docs/security/threat_model.md), [multi-tenancy](docs/architecture/multi_tenancy.md) |
| Reliability | [Failure modes](docs/architecture/failure_modes.md), [testing strategy](docs/testing/testing_strategy.md) |
| Operations | [Local environment](docs/development/local_environment.md), [CI/CD & release](docs/devops/ci_cd_release.md), [desktop release operations](docs/devops/desktop_release_operations.md) |

## License

Proprietary. All rights reserved.
