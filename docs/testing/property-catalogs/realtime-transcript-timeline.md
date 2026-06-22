# Realtime Transcript Timeline Property Catalog

## System Under Test

Realtime transcript timeline persistence from accepted transcript processor output and `audio.gap` messages into workspace-scoped meeting timeline records.

## State and Concurrency Model

- One realtime session belongs to exactly one workspace.
- `TranscriptProcessor` decides whether transcript events are emitted or suppressed.
- The transcript timeline sink records emitted final transcript segments and audio gaps.
- Partial transcript events remain live-only in this slice.
- Provider callbacks, binary audio handling, and WebSocket control messages can interleave.

## Properties

- **Workspace scope**: Every segment and gap record includes the authenticated workspace ID and session ID.
- **No duplicate finals**: Duplicate final events suppressed by `TranscriptProcessor` cannot create duplicate timeline records.
- **Final-only persistence**: Partial transcript events are not durably recorded by the realtime service.
- **Gap continuity**: `audio.gap` messages create timeline gap records so downstream consumers do not infer continuous capture.
- **Closed-session suppression**: Transcript callbacks after session close cannot write timeline records.
- **Content-safe telemetry**: Timeline telemetry excludes transcript text, raw audio, prompts, documents, suggestions, and provider payloads.
- **Recoverable sink failure**: Sink write failures emit recoverable realtime errors and do not close the WebSocket session by default.

## Minimal Test Topology

- In-process realtime WebSocket server.
- One test WebSocket client.
- Fake STT adapter returning synthetic transcript events.
- Fake transcript timeline sink that records writes or injects failures.

## Workloads

- Emit partial then final transcript events and assert only the final is recorded.
- Emit duplicate final transcript events and assert one record.
- Send an `audio.gap` message and assert one gap record.
- Inject sink write failure and assert recoverable `transcript_persistence_failed`.
- Close a session, then emit delayed STT callbacks and assert no timeline writes.

## Faults to Inject

- Transcript sink write failure.
- Duplicate final events.
- Partial-after-final events.
- Provider callback after session close.
- Audio gap during active session.

## Observability Needed

- Timeline segment write count by workspace/session.
- Timeline gap write count by workspace/session.
- Timeline write failure count.
- Transcript processor suppression count by reason.
- No content-bearing telemetry fields.

## Open Risks

- The current sink is in-memory; PostgreSQL persistence must preserve the same workspace-scope and idempotency properties.
- Retention/no-storage policy enforcement is only represented by the sink boundary in this slice and needs a dedicated policy slice.
- Reconnect/resume replay semantics need durable timeline pagination before desktop reconnect can replay missed transcript messages.
