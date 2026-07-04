# M2 Suggestion Persistence Implementation Plan

## Goal

Persist completed live suggestions and their citation metadata so meeting review can show and export the AI assistance that occurred during a session.

## Requirements and Milestone

- Milestone: M2 - Live AI Suggestions, with M1B meeting review integration.
- Requirements: FR-104, FR-105, FR-143, FR-160 to FR-169, FR-180 to FR-186, FR-220 to FR-225, NFR-040 to NFR-046, NFR-060 to NFR-065, NFR-100 to NFR-104, NFR-110 to NFR-113.
- Roadmap slice: `M2.Persistence`, after `M2.RetrievalBridge` and `M3.Embeddings`.

## Affected Architecture

- `packages/contracts`: add meeting-review suggestion schemas and include suggestions in meeting detail responses.
- `packages/db` and `infra/db`: extend the existing `suggestions` table with request ID, server sequence, and source metadata columns.
- `services/realtime`: add a suggestion sink wired to `suggestion.complete` events, guarded by workspace retention mode.
- `services/api`: return persisted suggestions in meeting detail and JSON/Markdown exports.
- `apps/desktop`: render meeting review suggestions returned by the API.

## Contracts and Data Model

- Realtime protocol payloads stay unchanged.
- Meeting detail responses gain `suggestions: MeetingSuggestion[]`.
- `suggestions.sources` will be stored as JSON text for the first persistence slice to avoid a premature normalized citation table. Each entry stores `document_id`, `title`, and `chunk_id`.
- `suggestions.server_seq` preserves review ordering relative to realtime output.

## Security and Privacy

- Suggestions are generated content and are governed sensitive meeting content.
- `live_only` and `local_only` retention modes must block suggestion persistence.
- Every persisted suggestion is scoped by `workspace_id` and `meeting_session_id`.
- API routes must keep workspace authorization before reading suggestions.
- Meeting list responses must continue to omit transcript and suggestion content.
- Export includes suggestions because export is an explicitly authorized meeting-detail operation.
- Telemetry/logging remains metadata-only; no suggestion content is logged by default.

## Implementation Tasks

1. Add contracts and generated schemas for meeting-review suggestions.
2. Extend DB schema and migrations for source metadata and ordering columns.
3. Add a realtime suggestion sink with in-memory and PostgreSQL implementations plus retention evaluation.
4. Wire realtime `suggestion.complete` persistence after send, preserving live behavior on persistence failure.
5. Update meeting review repositories and exports to include suggestions.
6. Update desktop meeting review UI to display persisted suggestions and sources.
7. Update docs and roadmap status.

## Tests and Verification

- Contract tests and generated JSON Schema drift check.
- Realtime tests proving completed suggestions persist, no-storage modes skip persistence, and persistence failure emits a recoverable error without leaking content.
- API repository tests proving meeting detail/export include suggestions while history list omits content.
- PostgreSQL integration coverage behind `DOKEZA_PG_INTEGRATION=1` where practical.
- Desktop API/client/view tests for rendering persisted suggestions.
- Final verification: `pnpm check`.

## Documentation Updates

- `docs/architecture/realtime_protocol.md`
- `docs/architecture/failure_modes.md`
- `docs/security/data_flows.md`
- `docs/development/plans/2026-06-25-production-vertical-roadmap.md`

## Rollback or Degraded Behavior

- If suggestion persistence fails, the live suggestion is still delivered and the server emits a recoverable persistence error.
- If retention blocks persistence, live suggestions remain transient.
- If old suggestion rows lack source metadata, meeting review treats them as empty-source suggestions.

## Open Questions

- Normalized citation rows, cost ledger storage, and replay-after-process-restart semantics remain follow-up slices.
