# Minimal Realtime Transcription Pipeline Implementation Plan

## Goal

Add the first backend realtime transcription pipeline slice: accepted audio chunks flow from the WebSocket frame assembler into an internal STT adapter boundary, and transcript events are emitted back to the connected desktop client using the existing realtime protocol.

This slice intentionally uses a deterministic in-process STT adapter for tests and local development. It does not call Deepgram or any other external STT provider yet.

## Requirements and Milestone

| SRS Area | Requirement IDs | Milestone |
| --- | --- | --- |
| Speech-to-text | FR-060 to FR-067 | Milestone 1 |
| Meeting session management | FR-100 to FR-105 | Milestone 1 |
| Realtime protocol reliability | NFR-020 to NFR-026 | Milestone 1 |
| Security and isolation | NFR-043, NFR-047, NFR-048 | Milestone 1 / enterprise baseline |
| Maintainability and telemetry | NFR-100, NFR-103, NFR-104 | Milestone 0 / Milestone 1 |

## Affected Architecture

- `services/realtime/src/stt-adapter.ts` — new internal STT adapter interface, deterministic adapter, and metadata-only transcript telemetry.
- `services/realtime/src/ws-server.ts` — route accepted `audio.chunk` events through the adapter and emit transcript messages.
- `services/realtime/src/ws-server.test.ts` — WebSocket integration coverage for audio-to-transcript behavior and failure handling.
- `services/realtime/src/index.ts` — export adapter types for future provider implementations.

## Contracts and Data Model

- **Realtime protocol**: No schema change. The slice uses existing `audio.chunk_meta`, binary payload, `transcript.partial`, `transcript.final`, and `error` messages.
- **REST API**: No change.
- **Data model**: No database persistence in this slice. Transcript storage remains future work for FR-063 and FR-104.
- **AI structured output**: No change.
- **Telemetry events**: Add metadata-only STT/transcript telemetry. Telemetry must not include raw audio bytes or transcript text.

## Security and Privacy

- Workspace isolation remains enforced by the authenticated session and matching `session_id`.
- Audio bytes are passed only to the injected adapter in memory and are not logged or persisted.
- Transcript text is sent to the connected client as required by the realtime protocol, but not logged in telemetry.
- No external data flow is introduced because the adapter is deterministic and in-process. The future Deepgram adapter must update `docs/security/data_flows.md` if it introduces provider calls in this code path.

## Implementation Tasks

1. Add failing WebSocket tests for `audio.chunk` -> `transcript.partial` / `transcript.final`.
2. Add failing tests for STT adapter failure returning recoverable `stt_provider_timeout`.
3. Add a `SttAdapter` interface with `transcribeChunk(input)` returning zero or more transcript events.
4. Add a deterministic adapter for local tests/development.
5. Wire `createRealtimeServer({sttAdapter})` so binary audio chunk events are passed to the adapter.
6. Emit transcript messages with server sequence numbers and the authenticated session ID.
7. Ensure telemetry emitted by the adapter pipeline contains only metadata fields.
8. Export adapter types from `services/realtime/src/index.ts`.
9. Run focused realtime verification, then full `pnpm check`.

## Tests and Verification

- `pnpm --filter @dokeza/realtime test`
  - emits transcript events after a valid audio frame pair.
  - preserves server sequence ordering across transcript events and `session.closed`.
  - returns a recoverable `stt_provider_timeout` error when the adapter fails.
  - does not include transcript text or audio bytes in adapter telemetry.
- `pnpm --filter @dokeza/realtime typecheck`
- `pnpm check`

## Documentation Updates

- This implementation plan.
- No protocol doc update is required because existing message types are used unchanged.
- No data-flow update is required until a real external STT provider adapter is implemented.

## Rollback or Degraded Behavior

- If the adapter returns no transcript events, the server continues the session without emitting transcript messages.
- If the adapter throws or returns an error, the server emits a recoverable `stt_provider_timeout` error and keeps the WebSocket session open.
- Removing the slice reverts realtime behavior to frame validation without transcript output.

## Open Questions

- Should transcript persistence live inside the realtime service initially, or should transcript events be handed to a separate context/session persistence module first?
- Should the production Deepgram adapter stream a long-lived provider connection per Dokeza session, or batch short chunk windows for simpler retry semantics in the first beta?
