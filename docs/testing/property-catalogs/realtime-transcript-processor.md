# Realtime Transcript Processor Property Catalog

## System Under Test

The realtime transcript processor inside `services/realtime`. It receives transcript events from an STT adapter and decides which `transcript.partial` and `transcript.final` messages are safe to emit over the authenticated WebSocket session.

## State and Concurrency Model

- State is scoped to one realtime session.
- Transcript segments are keyed by `segment_id`.
- A segment can be open after `transcript.partial` or finalized after `transcript.final`.
- STT adapter results may arrive in bursts or after the client sends `session.end`.
- WebSocket server sequence numbers are still owned by `SessionManager`.

## Properties

- **Session isolation**: transcript state for one session cannot affect another session.
- **Partial revision**: a partial update for an open segment may replace the current open revision.
- **Finalization**: a final update for a segment finalizes that segment and supersedes prior partial content.
- **No duplicate finals**: a duplicate final for an already finalized segment is suppressed.
- **No stale partial after final**: a partial update for a finalized segment is suppressed.
- **Timestamp monotonicity**: accepted transcript events cannot move the session transcript timeline backwards.
- **Closed-session suppression**: transcript events produced after `session.end` are dropped.
- **Telemetry minimization**: telemetry for accepted or suppressed transcript events does not include transcript text, raw audio, prompt text, document text, or suggestion content.

## Minimal Test Topology

- Unit tests for `TranscriptProcessor`.
- WebSocket integration tests with injected deterministic or delayed `SttAdapter` implementations.
- No database, external STT provider, or desktop client is needed for this slice.

## Workloads

- Partial followed by final for the same segment.
- Duplicate final for the same segment.
- Partial arriving after final for the same segment.
- Segment event with earlier `start_ms` than the current accepted timeline.
- STT adapter promise resolving after `session.end`.
- Two independent WebSocket connections with different sessions.

## Faults to Inject

- Delayed STT output.
- Duplicate STT output.
- Out-of-order STT output.
- STT output after session closure.

## Observability Needed

- Metadata-only event names for accepted and suppressed transcript events.
- Suppression reason.
- Session and workspace IDs.
- Segment ID.
- Transcript event type.
- Timing metadata.

## Open Risks

- Reconnect/resume will require persisted or replayable transcript state; this catalog only covers in-memory state.
- Real provider adapters may produce provider-specific segment IDs that need normalization rules in a future slice.
