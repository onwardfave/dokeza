# M3 Embeddings Implementation Plan

## Goal

Add embedding generation and pgvector-backed retrieval to the M3 knowledge service so uploaded knowledge can be retrieved semantically and cited by the existing live-suggestion source-grounding bridge.

Status: implemented for deterministic local/test embeddings, OpenAI provider adapter boundary, pgvector storage/indexing, and hybrid keyword/vector retrieval. Reranking, eval-backed thresholds, and richer document-permission policy remain follow-up slices.

## Requirements and Milestone

- Milestone: M3 - Knowledge Base and Source Grounding.
- Requirements: FR-120 to FR-127, FR-140 to FR-146, FR-160 to FR-169, NFR-040 to NFR-046, NFR-060 to NFR-065, NFR-100 to NFR-104, NFR-110 to NFR-113.
- Roadmap slice: `M3.Embeddings`, after `M2.RetrievalBridge`.

## Affected Architecture

- `@dokeza/config`: typed embedding provider settings and production credential validation.
- `services/knowledge`: embedding adapter boundary, upload indexing, hybrid search, provider failure fallback.
- `packages/db`: Drizzle model for the existing `document_chunks.embedding vector(1536)` column.
- `infra/db`: vector index migration.
- `services/api` and `services/realtime`: consume the existing knowledge repository contract without public API or realtime protocol changes.

## Contracts and Data Model

- No REST or realtime payload changes are planned.
- `document_chunks.embedding vector(1536)` already exists in the baseline SQL migration and remains the storage location.
- Add an index migration for vector similarity search.
- Search keeps returning the existing numeric `score`; vector distance stays internal for now.

## Security and Privacy

- Embedding provider credentials remain server-side in `@dokeza/config`.
- Local and test defaults must be deterministic and credential-free.
- Production embedding provider defaults to OpenAI and fails closed without credentials.
- `live_only` and `local_only` retention modes block document/chunk storage and therefore block embedding persistence.
- Provider telemetry and errors must be metadata-only; never include document text, query text, chunk text, prompt text, suggestion content, or API keys.
- Vector search must always include workspace predicates and remain inside the knowledge service.

## Implementation Tasks

1. Add typed embedding config with deterministic local/test defaults and OpenAI production validation.
2. Add an embedding adapter interface, deterministic embedding implementation, OpenAI transport boundary, and response validation.
3. Wire optional embedding generation into document upload after storage policy checks and before chunk persistence.
4. Add vector scoring to in-memory search and pgvector search, with keyword-only fallback when embedding generation fails.
5. Model the `embedding` column in Drizzle and add a vector index migration.
6. Update docs and roadmap status after behavior is verified.

## Tests and Verification

- Config tests for default deterministic embeddings, explicit OpenAI settings, production fail-closed behavior, HTTPS validation, and dimension validation.
- Knowledge unit tests for deterministic embedding generation, vector-only match retrieval, provider failure fallback, no-storage blocking before embedding calls, and no sensitive content in provider errors.
- PostgreSQL integration test coverage for vector search should be added behind the existing opt-in integration flag where practical.
- Schema/migration tests for the vector column and index migration.
- Final verification: `pnpm check`.

## Documentation Updates

- `docs/security/data_flows.md`
- `docs/architecture/failure_modes.md`
- `docs/testing/property-catalogs/knowledge-retrieval.md`
- `docs/development/plans/2026-06-25-production-vertical-roadmap.md`

## Rollback or Degraded Behavior

- If embedding generation fails during upload, the document and chunks remain searchable by keyword and the repository records no embedding for those chunks.
- If query embedding fails during search, search falls back to deterministic keyword scoring.
- Local and CI runs never require live OpenAI calls.

## Open Questions

- A later policy slice should decide whether cloud embeddings need a separate workspace policy flag from `cloud_llm_allowed`.
- Reranking and richer score semantics remain later M3 slices.
