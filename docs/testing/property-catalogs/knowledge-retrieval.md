# Knowledge Retrieval Property Catalog

## System Under Test

The M3 knowledge foundation spans API workspace authorization, `services/knowledge` repository behavior, and PostgreSQL `documents` / `document_chunks` storage.

## State and Concurrency Model

- Documents and chunks are workspace-owned records.
- Upload writes one document plus deterministic chunks in a single repository operation.
- Keyword search reads active chunks and returns source metadata for matching chunks.
- PostgreSQL operations run inside `withWorkspaceTransaction`, relying on RLS plus explicit workspace predicates.

## Properties

- A user cannot list, inspect, or search documents for a workspace they are not authorized to access.
- Repository search never returns chunks from a workspace other than the input workspace.
- Search with `allowedDocumentIds` returns only those document IDs.
- List responses do not include raw document or chunk text.
- Detail and search responses include content only through authorized workspace-scoped routes.
- Live suggestions can only cite chunks returned by server-side retrieval for the authenticated session workspace.
- If source retrieval fails or returns no authorized chunks, live suggestions continue with empty citations rather than leaking query or chunk content in errors.
- `live_only` and `local_only` retention modes block cloud document and chunk persistence.
- Empty or invalid queries fail without echoing document text.

## Minimal Test Topology

- Component tests use `InMemoryKnowledgeRepository`.
- API tests use an injected memory repository and Dokeza auth tokens.
- PostgreSQL integration tests use local/CI PostgreSQL with migrations applied and `DOKEZA_PG_INTEGRATION=1`.

## Workloads

- Upload a text document and verify deterministic chunk creation.
- List document summaries and assert document content is absent.
- Fetch authorized document detail.
- Search matching chunks in one workspace while another workspace has matching content.
- Search with an explicit allowed-document filter.
- Request a live suggestion with `include_sources=true` and verify retrieved citations come from the authenticated workspace.
- Request a live suggestion with retrieval failure and verify transcript-only fallback with no leaked source query or chunk text.
- Attempt upload under no-storage retention.

## Faults to Inject

- Repository unavailable.
- Blank document body.
- Blank search query.
- Cross-workspace route access.
- Workspace retention mode set to `live_only` or `local_only`.

## Observability Needed

Future production telemetry should include metadata-only counts and latency for upload, chunking, and retrieval route execution. It must not include document text, query text, chunk text, prompt text, suggestion content, or provider payload bodies by default.

## Open Risks

- Document-level permissions are currently represented only by metadata and allowed-document filters; full permission evaluation is a later M3 slice.
- Search is deterministic keyword matching; embedding provider, vector search, and reranking remain later slices.
- Source-grounded live suggestions are wired to keyword retrieval only; embedding-backed grounding and reranking remain later slices.
