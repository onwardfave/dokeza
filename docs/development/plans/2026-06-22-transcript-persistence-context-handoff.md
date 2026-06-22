# Transcript Persistence and Context Handoff Implementation Plan

## Goal

Add a realtime transcript timeline persistence boundary so final transcript segments and audio gaps are recorded in a workspace-scoped session timeline. This turns live STT output into meeting state that downstream context assembly, suggestions, and post-call workflows can consume.

This slice does not add a production PostgreSQL client yet. The existing DB baseline already defines `transcript_segments` and `transcript_gaps` with RLS, so this slice adds the domain/repository contract and an in-memory implementation for realtime wiring and tests. A later storage slice can adapt the same contract to PostgreSQL.

## Requirements and Milestone

| SRS Area | Requirement IDs | Milestone |
| --- | --- | --- |
| Speech-to-text | FR-061 to FR-064, FR-067 | Milestone 1 |
| Meeting session management | FR-100, FR-102 to FR-105 | Milestone 1 / Milestone 4 |
| Retrieval and context assembly | FR-140, FR-146 | Milestone 3 precursor |
| Reliability | NFR-020, NFR-025, NFR-026 | Milestone 1 |
| Security and isolation | NFR-043, NFR-047, NFR-048 | Milestone 1 / enterprise baseline |
| Maintainability and telemetry | NFR-100, NFR-103, NFR-104 | Milestone 0 / Milestone 1 |

## Affected Architecture

- `services/realtime/src/transcript-timeline.ts` - new workspace-scoped transcript sink, timeline record types, in-memory implementation, and context handoff snapshot API.
- `services/realtime/src/ws-server.ts` - persist emitted final transcript segments and accepted `audio.gap` timeline markers.
- `services/realtime/src/index.ts` - export transcript timeline types for context/retrieval services.
- `services/realtime/src/*.test.ts` - unit and WebSocket coverage for persistence, idempotency, gap records, closed-session behavior, and telemetry redaction.
- `infra/db/tests/rls-migration.test.ts` - ensure transcript tables stay in high-risk RLS checks, including `transcript_gaps`.
- `docs/testing/property-catalogs/realtime-transcript-timeline.md` - reliability and isolation properties for persisted transcript timelines.

## Contracts and Data Model

- **Realtime protocol**: No schema change. Uses existing `transcript.partial`, `transcript.final`, and `audio.gap` messages.
- **REST API**: No change.
- **Data model**: No migration change expected because `transcript_segments` and `transcript_gaps` already exist. This slice defines the service-level write contract that matches those shapes.
- **AI structured output**: No change.
- **Telemetry event**: Add metadata-only transcript timeline telemetry. No transcript text, raw audio, prompts, documents, suggestions, or provider payloads.

## Security and Privacy

- Every timeline record includes `workspaceId` and `sessionId`.
- The sink must reject cross-session or cross-workspace writes for an active timeline.
- Transcript text is stored in the timeline records but never emitted in telemetry.
- Audio gaps contain timing and dropped-count metadata only, not raw audio.
- No new external data flow is introduced.

## Implementation Tasks

1. Add transcript timeline unit tests for:
   - persisting final segments with workspace/session IDs.
   - ignoring partial transcript events for durable storage.
   - idempotently replacing duplicate final segment writes by segment ID.
   - rejecting workspace/session mismatches.
   - recording audio gaps.
   - exposing context handoff snapshots ordered by time.
   - telemetry redaction.
2. Add WebSocket server tests for:
   - final transcript events are written to the configured transcript sink.
   - duplicate final events are persisted once after processor suppression.
   - `audio.gap` messages are written to the sink.
   - partial transcript events are not durably stored.
   - sink failures emit recoverable errors without closing the session.
3. Implement `TranscriptTimelineSink`, `InMemoryTranscriptTimelineSink`, segment/gap record types, and snapshot API.
4. Wire `createRealtimeServer` to accept an optional transcript timeline sink.
5. Persist final transcript events only after `TranscriptProcessor` returns `emit`.
6. Persist `audio.gap` messages after validation and monotonic sequence handling.
7. Update DB migration tests so `transcript_gaps` is explicitly covered as high-risk workspace-scoped data.
8. Add the transcript timeline property catalog.
9. Run focused tests and typechecks, commit, then run full `pnpm check`.

## Tests and Verification

- `pnpm --filter @dokeza/realtime test`
- `pnpm --filter @dokeza/realtime typecheck`
- `pnpm --filter @dokeza/db test`
- `pnpm check`

Required behavior:

- Only emitted final transcript segments are durably recorded.
- Duplicate final transcript events cannot duplicate persisted segments.
- Audio gaps are recorded with workspace/session/timing metadata.
- Timeline snapshots are ordered and workspace/session scoped.
- Sink failures degrade gracefully through recoverable realtime errors.
- Telemetry contains no transcript text or raw audio.

## Documentation Updates

- This implementation plan.
- `docs/testing/property-catalogs/realtime-transcript-timeline.md`.
- No realtime protocol update is required because `audio.gap` and transcript messages already exist.
- No data-flow update is required because no new external data flow is introduced.
- No failure-mode update is required unless sink write failure behavior diverges from the existing backend DB write failure mode.

## Rollback or Degraded Behavior

- If the transcript sink fails, the server should keep the live session open and emit a recoverable error.
- If no sink is configured, the server uses an in-memory sink by default for local/test continuity.
- Removing the server wiring reverts transcript persistence to ephemeral processor state.

## Open Questions

- Should partial transcript revisions ever be persisted for meeting review, or should they remain live-only?
- Should PostgreSQL persistence land in the realtime service directly or through a future session/context service boundary?
