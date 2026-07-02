# Realtime Transcript Timeline Property Catalog

## System Under Test

Realtime transcript timeline persistence from accepted transcript processor output and `audio.gap` messages into workspace-scoped meeting timeline records.

M1A.2 also covers bounded replay of emitted final transcript messages during WebSocket resume.

## State and Concurrency Model

- One realtime session belongs to exactly one workspace.
- `TranscriptProcessor` decides whether transcript events are emitted or suppressed.
- The transcript timeline sink records emitted final transcript segments and audio gaps.
- Partial transcript events remain live-only in this slice.
- Transcript retention policy is evaluated before cloud timeline persistence.
- Provider callbacks, binary audio handling, and WebSocket control messages can interleave.
- A dropped WebSocket moves the session into a disconnected-but-resumable state while preserving the original session ID and last connection ID.
- A reconnect first authenticates a new socket, then sends `resume.request` for the original session ID.
- The realtime server keeps bounded in-process replay state for emitted final transcript messages keyed by session ID and server sequence.

## Properties

- **Workspace scope**: Every segment and gap record includes the authenticated workspace ID and session ID.
- **No duplicate finals**: Duplicate final events suppressed by `TranscriptProcessor` cannot create duplicate timeline records.
- **Final-only persistence**: Partial transcript events are not durably recorded by the realtime service.
- **Gap continuity**: `audio.gap` messages create timeline gap records so downstream consumers do not infer continuous capture.
- **No-storage retention**: `live_only` and `local_only` retention modes skip cloud segment and gap persistence while live transcript delivery continues.
- **Cloud-retention persistence**: `7_days`, `30_days`, `1_year`, and `indefinite` retention modes allow timeline persistence.
- **Closed-session suppression**: Transcript callbacks after session close cannot write timeline records.
- **Content-safe telemetry**: Timeline telemetry excludes transcript text, raw audio, prompts, documents, suggestions, and provider payloads.
- **Recoverable sink failure**: Sink write failures emit recoverable realtime errors and do not close the WebSocket session by default.
- **Resume identity**: Successful resume reattaches the new connection to the original session ID.
- **Resume replay window**: Resume replays final transcript messages whose server sequence is greater than the client's `last_server_seq`.
- **Resume write idempotency**: Replaying transcript messages cannot create additional transcript timeline writes.
- **Resume isolation**: Cross-workspace, cross-user, ended-session, or stale-connection resume attempts fail with `session_not_resumable` before transcript replay.

## Minimal Test Topology

- In-process realtime WebSocket server.
- One test WebSocket client.
- Two or more sequential WebSocket clients for reconnect/resume workloads.
- Fake STT adapter returning synthetic transcript events.
- Fake transcript timeline sink that records writes or injects failures.

## Workloads

- Emit partial then final transcript events and assert only the final is recorded.
- Emit duplicate final transcript events and assert one record.
- Send an `audio.gap` message and assert one gap record.
- Run the same final segment and audio gap workloads under `live_only` or `local_only` and assert no timeline sink writes.
- Inject sink write failure and assert recoverable `transcript_persistence_failed`.
- Inject session-store write failure and assert recoverable `session_persistence_failed`.
- Close a session, then emit delayed STT callbacks and assert no timeline writes.
- Emit a final transcript, close the WebSocket, reconnect, resume with an older `last_server_seq`, and assert the original final transcript is replayed.
- Repeat resume for the same transcript window and assert the transcript timeline sink still has one write.
- Attempt resume from another workspace and assert no transcript content is replayed.

## Faults to Inject

- Transcript sink write failure.
- Duplicate final events.
- Partial-after-final events.
- Provider callback after session close.
- Audio gap during active session.
- WebSocket close followed by resume.
- Cross-workspace resume attempt.
- Repeated resume attempts with the same `last_server_seq`.

## Observability Needed

- Timeline segment write count by workspace/session.
- Timeline gap write count by workspace/session.
- Retention policy skip count by workspace/session and retention mode.
- Timeline write failure count.
- Transcript processor suppression count by reason.
- No content-bearing telemetry fields.
- Resume success and failure counts without transcript content.
- Replay count by workspace/session without transcript text.

## Open Risks

- The current sink is in-memory; PostgreSQL persistence must preserve the same workspace-scope and idempotency properties.
- Workspace policy resolution is still configured at the realtime server boundary; future work should load policy from the workspace policy service.
- Replay after realtime process restart still needs persisted server-sequence metadata on timeline records. Current M1A.2 coverage proves in-process replay and durable write idempotency, not process-restart replay.
