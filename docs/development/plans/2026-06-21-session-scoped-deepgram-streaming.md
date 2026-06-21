# Session-Scoped Deepgram Streaming Implementation Plan

## Goal

Wire cloud STT into the realtime service as a session-scoped provider stream. The current Deepgram adapter can map provider messages, but the realtime server still treats STT as a per-chunk call and defaults to the deterministic adapter unless a caller injects another adapter. This slice adds an STT session lifecycle so one Dokeza realtime session can own one provider stream, send audio chunks over that stream, receive provider transcript events asynchronously, and close the provider stream on session end or connection loss.

This slice keeps the desktop realtime protocol unchanged.

## Requirements and Milestone

| SRS Area | Requirement IDs | Milestone |
| --- | --- | --- |
| Speech-to-text | FR-060 to FR-064, FR-067 | Milestone 1 |
| Meeting session management | FR-100 to FR-105 | Milestone 1 |
| Reliability | NFR-020, NFR-025, NFR-026 | Milestone 1 |
| Security and isolation | NFR-040, NFR-043, NFR-047, NFR-048 | Milestone 1 / enterprise baseline |
| Maintainability and telemetry | NFR-100, NFR-102, NFR-103, NFR-104 | Milestone 0 / Milestone 1 |

## Affected Architecture

- `services/realtime/src/stt-adapter.ts` - extend the adapter boundary with optional session-scoped lifecycle types.
- `services/realtime/src/deepgram-stt-adapter.ts` - add session streaming support and keep one-shot chunk behavior for compatibility.
- `services/realtime/src/ws-server.ts` - create and close one STT session per realtime connection/session where supported.
- `services/realtime/src/stt-adapter-factory.ts` - compose production STT adapters from typed config while preserving deterministic local/test fallback.
- `services/realtime/src/*.test.ts` - cover session lifecycle, async transcript emission, failure handling, and config composition.
- `docs/testing/property-catalogs/realtime-stt-streaming.md` - define provider streaming reliability properties.

## Contracts and Data Model

- **Realtime protocol**: No schema change. Uses existing `session.start`, `audio.chunk_meta`, binary audio frames, `transcript.partial`, `transcript.final`, `error`, and `session.closed`.
- **REST API**: No change.
- **Data model**: No persistence change. Provider stream state is in-memory and scoped to one realtime session.
- **Provider contract**: Deepgram streaming transport keeps a WebSocket open per STT session, sends binary audio frames, can send provider control messages, and emits parsed provider result messages through callbacks.
- **Telemetry event**: Metadata-only STT session and provider events. No raw audio, transcript text, prompts, documents, suggestions, provider payload bodies, or API keys.

## Security and Privacy

- Deepgram credentials remain server-side only.
- Workspace ID and session ID stay explicit in STT session start input and telemetry.
- Raw audio is sent only to the configured provider stream and remains transient in memory.
- Live provider calls are not required for unit tests or `pnpm check`; tests use fake streaming transports.
- Production config must fail closed for missing Deepgram credentials and non-TLS provider URLs.

## Implementation Tasks

1. Add STT session lifecycle tests:
   - realtime server starts one STT session and sends multiple chunks through it.
   - async transcript events emitted by the STT session pass through `TranscriptProcessor` and reach the client.
   - delayed async transcript events after `session.end` are dropped.
   - STT session closes on `session.end` and WebSocket close.
   - session-level STT failures emit recoverable errors without closing the realtime session.
2. Add Deepgram session transport tests:
   - adapter opens a provider stream with deterministic URL and authorization header.
   - audio chunks are sent without reopening the provider stream.
   - provider result messages map to transcript callbacks.
   - close/finalize sends provider control messages.
   - telemetry excludes audio, transcript text, provider payloads, and API keys.
3. Add config factory tests:
   - local/test config without Deepgram key returns deterministic adapter.
   - production Deepgram config creates a `DeepgramSttAdapter`.
   - missing required production config throws a non-secret error if factory is called directly.
4. Implement session lifecycle types and default deterministic session wrapper.
5. Implement Deepgram streaming session and WebSocket session transport.
6. Wire `createRealtimeServer` to prefer session-scoped STT when the adapter supports it.
7. Add `createSttAdapterFromConfig`.
8. Add the realtime STT streaming property catalog.
9. Run focused tests and typechecks, commit, then run full `pnpm check`.

## Tests and Verification

- `pnpm --filter @dokeza/realtime test`
- `pnpm --filter @dokeza/realtime typecheck`
- `pnpm --filter @dokeza/config test`
- `pnpm --filter @dokeza/config typecheck`
- `pnpm check`

Required behavior:

- One realtime session owns at most one active STT provider stream.
- Multiple audio chunks for the same session do not create multiple provider streams.
- Provider transcript callbacks are processed through existing transcript ordering and suppression rules.
- Provider callbacks after session close do not emit client messages.
- STT provider stream errors are recoverable and content-safe.
- Local/test operation can stay credential-free through deterministic fallback.

## Documentation Updates

- This implementation plan.
- `docs/testing/property-catalogs/realtime-stt-streaming.md`.
- No realtime protocol update is required because the wire message schema is unchanged.
- No data-flow update is required because the Deepgram egress path was documented in the prior adapter slice.
- No failure-mode update is required unless implementation adds a new user-visible error or state beyond existing STT provider degradation.

## Rollback or Degraded Behavior

- If session-scoped STT creation fails, the realtime session should emit a recoverable STT error and remain open for later chunks.
- If Deepgram stream closes unexpectedly, the session should degrade through the existing STT provider timeout/degraded-provider path.
- Local and test environments can continue using `DeterministicSttAdapter` without credentials.
- Removing this slice reverts realtime STT to per-chunk adapter calls.

## Open Questions

- Should the server start the provider stream strictly on `session.start`, or lazily on first valid audio chunk until protocol tests enforce session ordering?
- Should Deepgram keepalive interval be configurable immediately, or stay as an internal default until live soak tests provide evidence?
