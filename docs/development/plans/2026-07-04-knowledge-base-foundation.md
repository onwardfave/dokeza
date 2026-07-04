# Knowledge Base Foundation Implementation Plan

## Goal

Implement the first M3 knowledge-base slices: workspace-authorized document upload, deterministic text chunking, document listing/detail, and keyword retrieval with source metadata. Keep vector embeddings, reranking, and live suggestion source injection behind later provider-backed slices.

## Requirements and Milestone

- Milestone 3: knowledge ingestion, retrieval, and source grounding.
- FR-120: users can upload documents for assistant context.
- FR-122: uploaded documents are chunked for retrieval.
- FR-125: source metadata is tracked for retrieved chunks.
- FR-126: documents can be removed or disabled in a later admin slice.
- FR-140 to FR-144: retrieval is workspace scoped and excludes unauthorized content.
- NFR-043, NFR-047 to NFR-049: workspace authorization, isolation, data-flow and threat-model alignment.

## Affected Architecture

- `packages/contracts`: add REST contracts for knowledge document upload/list/detail/search.
- `services/knowledge`: own chunking and repository interfaces, with memory and PostgreSQL implementations.
- `services/api`: expose authenticated workspace-scoped REST routes that delegate to the knowledge repository.
- `packages/db` and existing migrations: use existing `documents` and `document_chunks` tables.

## Contracts and Data Model

Initial REST routes:

- `POST /v1/workspaces/{workspace_id}/documents`
- `GET /v1/workspaces/{workspace_id}/documents`
- `GET /v1/workspaces/{workspace_id}/documents/{document_id}`
- `GET /v1/workspaces/{workspace_id}/knowledge/search?q=...&top_k=...`

The first search implementation is deterministic keyword search over stored chunks. It returns chunk text and document source metadata only after API workspace authorization and repository workspace filtering.

## Security and Privacy

- Every route authorizes workspace membership before repository access.
- Every repository read/write is scoped by `workspace_id`; PostgreSQL operations use `withWorkspaceTransaction`.
- Raw document text is accepted only in upload requests and stored as chunks; list responses do not include document content.
- Telemetry/log behavior is unchanged. Errors must not echo document text.
- `live_only` and `local_only` retention modes block cloud document/chunk persistence.
- No new external provider or third-party data flow is introduced in this slice.

## Implementation Tasks

1. Add knowledge contracts and JSON Schema generation.
2. Add deterministic chunking and repository behavior in `services/knowledge`.
3. Add in-memory repository tests for chunking, workspace filtering, search, and no-storage blocking.
4. Add PostgreSQL repository implementation and opt-in integration coverage.
5. Add API route tests for authz, upload/list/detail/search, and redacted errors.
6. Update roadmap status and retrieval property catalog.

## Tests and Verification

- `pnpm --filter @dokeza/contracts test`
- `pnpm --filter @dokeza/knowledge test`
- `pnpm --filter @dokeza/api test`
- `pnpm generate:schemas`
- `pnpm check`

PostgreSQL integration tests remain opt-in locally through `DOKEZA_PG_INTEGRATION=1`.

## Documentation Updates

- Update `docs/development/plans/2026-06-25-production-vertical-roadmap.md` to mark the M3 foundation as partially implemented.
- Add a knowledge retrieval property catalog for workspace isolation and source authorization.

## Rollback or Degraded Behavior

- If the repository is unavailable, API routes return `service_unavailable`.
- If retention policy blocks cloud storage, upload fails closed with `knowledge_storage_blocked`.
- If no chunks match a query, search returns an empty result set.

## Open Questions

- Exact document permission model beyond workspace-level access and explicit allowed-document filters.
- Embedding provider configuration and workspace policy controls for cloud embeddings.
- Whether manual document upload belongs first in desktop, web workspace, or both.
