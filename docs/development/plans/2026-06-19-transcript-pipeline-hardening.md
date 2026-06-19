# Transcript Pipeline Hardening Implementation Plan

## Goal

Harden the realtime transcript pipeline by adding a session-scoped transcript processor between STT adapter output and WebSocket emission. The processor will normalize transcript events, preserve partial-to-final revision semantics, suppress duplicate final segments, reject stale partial updates after finalization, and provide metadata-only telemetry for transcript state changes.

This slice keeps the existing realtime protocol unchanged and does not add persistence or a real external STT provider.

## Requirements and Milestone

| SRS Area | Requirement IDs | Milestone |
| --- | --- | --- |
| Speech-to-text | FR-060 to FR-064, FR-067 | Milestone 1 |
| Meeting session management | FR-100 to FR-104 | Milestone 1 |
| Reliability | NFR-020, NFR-025, NFR-026 | Milestone 1 |
| Security and isolation | NFR-043, NFR-047, NFR-048 | Milestone 1 / enterprise baseline |
| Maintainability and telemetry | NFR-100, NFR-103, NFR-104 | Milestone 0 / Milestone 1 |

## Affected Architecture

- `services/realtime/src/transcript-processor.ts` — new session-scoped transcript state manager.
- `services/realtime/src/ws-server.ts` — process STT transcript events before sending them to the client.
- `services/realtime/src/index.ts` — export transcript processor types for future context/session modules.
- `services/realtime/src/*.test.ts` — unit and WebSocket coverage for transcript ordering, revision, duplicate suppression, and session-close behavior.
- `docs/testing/property-catalogs/realtime-transcript-processor.md` — reliability properties for transcript state.

## Contracts and Data Model

- **Realtime protocol**: No schema change. Uses existing `transcript.partial`, `transcript.final`, `error`, and `session.closed` messages.
- **REST API**: No change.
- **Data model**: No database persistence in this slice. The processor state is in-memory per WebSocket connection/session.
- **AI structured output**: No change.
- **Telemetry event**: Add metadata-only transcript processor telemetry. No raw transcript text is emitted in telemetry.

## Security and Privacy

- Transcript events remain scoped to the authenticated WebSocket session and existing `session_id` checks.
- The processor stores transcript text in memory only for active sessions; it does not log or persist content.
- Telemetry may include workspace ID, session ID, segment ID, event type, timing metadata, and action names, but not transcript text, raw audio, prompts, documents, or suggestions.
- No new external data flow is introduced.

## Implementation Tasks

1. Add `TranscriptProcessor` tests for:
   - partial segments are accepted and stored as open revisions.
   - final segments replace matching partial segments.
   - duplicate final segments are suppressed.
   - stale partial updates after finalization are suppressed.
   - segments with decreasing timestamps are suppressed.
   - telemetry excludes transcript text.
2. Implement `TranscriptProcessor` with session-scoped segment state and metadata-only telemetry.
3. Wire `TranscriptProcessor` into `createRealtimeServer` per connection/session.
4. Add WebSocket tests proving duplicate final events and stale partial events are not emitted to the client.
5. Add WebSocket test proving `session.end` prevents delayed STT transcript events from being emitted after `session.closed`.
6. Export transcript processor types from `services/realtime/src/index.ts`.
7. Run focused realtime verification, commit, then run full `pnpm check`.

## Tests and Verification

- `pnpm --filter @dokeza/realtime test`
- `pnpm --filter @dokeza/realtime typecheck`
- `pnpm check`

Required behavior:

- A final transcript segment with the same `segment_id` replaces a prior partial revision.
- Duplicate final segments are not sent twice.
- Partial updates for finalized segments are ignored.
- Timestamp order cannot move backwards within a session.
- Delayed STT results after `session.end` are dropped.
- Telemetry contains no transcript text or raw audio.

## Documentation Updates

- This implementation plan.
- `docs/testing/property-catalogs/realtime-transcript-processor.md`.
- No protocol or data-flow documentation changes are required because no message schema or external trust boundary changes.

## Rollback or Degraded Behavior

- If the processor suppresses a transcript event, the session remains active and no client error is emitted.
- If transcript processor state is lost due to process restart, reconnect/resume work will need to reconstruct or replay transcript state in a future slice.
- Removing this slice reverts the server to directly forwarding STT adapter transcript events.

## Open Questions

- Should finalized transcript state move into a shared session/context module before persistence is implemented?
- What retention mode should govern in-memory transcript state once no-storage and local-only modes are fully implemented?
