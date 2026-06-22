# Dokeza Code Architecture

## 1. Purpose

This document defines the intended source-code architecture for Dokeza. It complements the C4 architecture by describing module boundaries, repository layout, dependency rules, and testing ownership.

## 2. Repository Strategy

Use a monorepo during early development to keep contracts, shared types, desktop, backend, and tests aligned.

Current implemented top-level layout:

```text
apps/
  desktop/              # Tauri desktop app
services/
  api/                  # REST API gateway and core backend
  realtime/             # WebSocket session service
  ai-orchestrator/      # Prompt routing, model gateway, response validation
  knowledge/            # Ingestion, chunking, embeddings, retrieval
packages/
  contracts/            # Shared API and realtime schemas
  authz/                # Workspace authorization helpers
  telemetry/            # Shared tracing and metrics helpers
  config/               # Typed configuration and environment parsing
  test-fixtures/        # Shared fixtures for transcripts, docs, sessions
infra/
  terraform/            # Cloud infrastructure
  db/                   # Database migrations and RLS tests
  observability/        # Local observability stack
docs/
  architecture/
  devops/
  security/
  srs/
```

Planned layout additions:

```text
apps/
  web/                  # Web workspace and admin console, Milestone 3+
services/
  workflow/             # Post-call jobs and integration writeback, Milestone 4+
infra/
  docker/               # Local and CI images when service packaging needs dedicated images
  k8s/                  # Production manifests or Helm charts if adopted
tests/
  e2e/                  # Cross-service end-to-end tests
  reliability/          # Fault, property, and workload tests
```

## 3. Language and Runtime Baseline

| Area | Baseline |
| --- | --- |
| Desktop shell | Tauri v2 |
| Desktop native layer | Rust |
| Desktop UI | React + TypeScript |
| Web app | React + TypeScript |
| Backend services | TypeScript/Node.js for initial implementation |
| Realtime protocol contracts | TypeScript schemas plus generated JSON Schema |
| Database migrations | Versioned migration tool owned by backend |
| Infrastructure | Terraform-first |

Go remains acceptable for later performance-sensitive services, but only behind stable contract boundaries. Shared schemas must stay language-neutral at the artifact boundary through generated JSON Schema, even when TypeScript is the source format.

## 4. Dependency Rules

- UI layers may depend on contracts, UI components, and service clients.
- Desktop native modules may depend on platform adapters and protocol clients.
- Backend services may depend on contracts, authz, telemetry, and config packages.
- Domain logic must not depend directly on framework request/response objects.
- Services must not call each other's databases directly.
- Retrieval and prompt assembly must not accept arbitrary document text from clients.
- Integration credentials must only be accessed through the integration or workflow service.

## 5. Core Domain Modules

| Module | Owns |
| --- | --- |
| Identity | Users, workspaces, memberships, roles. |
| Session | Meeting lifecycle, capture state, transcript timeline. |
| Context | Rolling state, active screen/app context, event detection. |
| Knowledge | Documents, chunks, embeddings, retrieval, permissions. |
| AI | Prompt registry, model routing, structured validation, eval metadata. |
| Workflow | Summaries, action items, follow-ups, writeback approvals. |
| Governance | Policies, retention, audit logs, admin controls. |
| Billing | Plans, seats, usage meters, entitlements. |

## 6. Contracts

Contracts are product infrastructure and must be versioned.

Required contracts:

- REST API schemas.
- Realtime protocol messages.
- Webhook payloads.
- Integration writeback schemas.
- Structured AI output schemas.
- Audit event schema.
- Telemetry event schema.

Contract changes must include:

- Backward compatibility assessment.
- Schema version update when breaking.
- Client and server tests.
- Migration note if persisted data changes.

## 7. Configuration

Configuration must be typed and validated at startup.

Required categories:

- Environment identity.
- Database connections.
- Vector store.
- Object storage.
- STT providers.
- LLM providers.
- Embedding providers.
- Billing provider.
- OAuth providers.
- Feature flags.
- Retention defaults.
- Telemetry sinks.

Secrets must not live in repository config files.

## 8. Testing Ownership

Each module owns:

- Unit tests for pure logic.
- Integration tests for external adapters.
- Contract tests for public interfaces.
- Failure-mode tests for expected degradation behavior.
- Authorization tests for workspace-scoped resources.

AI-facing modules also own:

- Prompt regression tests.
- Retrieval relevance tests.
- Structured output validation tests.
- Source-grounding tests.

## 9. Code Review Gates

Before merge, implementation changes must answer:

- Which requirement or milestone does this satisfy?
- Which contracts changed?
- Which policies or trust boundaries changed?
- Which tests prove the change?
- Which telemetry proves it in production?
- Which docs were updated?
