# Realtime Transcript Timeline Property Catalog

## System Under Test

Realtime transcript timeline persistence from accepted transcript processor output and `audio.gap` messages into workspace-scoped meeting timeline records.

## State and Concurrency Model

- One realtime session belongs to exactly one workspace.
- `TranscriptProcessor` decides whether transcript events are emitted or suppressed.
- The transcript timeline sink records emitted final transcript segments and audio gaps.
- Partial transcript events remain live-only in this slice.
- Transcript retention policy is evaluated before cloud timeline persistence.
- Provider callbacks, binary audio handling, and WebSocket control messages can interleave.

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

## Minimal Test Topology

- In-process realtime WebSocket server.
- One test WebSocket client.
- Fake STT adapter returning synthetic transcript events.
- Fake transcript timeline sink that records writes or injects failures.

## Workloads

- Emit partial then final transcript events and assert only the final is recorded.
- Emit duplicate final transcript events and assert one record.
- Send an `audio.gap` message and assert one gap record.
- Run the same final segment and audio gap workloads under `live_only` or `local_only` and assert no timeline sink writes.
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
- Retention policy skip count by workspace/session and retention mode.
- Timeline write failure count.
- Transcript processor suppression count by reason.
- No content-bearing telemetry fields.

## Open Risks

- The current sink is in-memory; PostgreSQL persistence must preserve the same workspace-scope and idempotency properties.
- Workspace policy resolution is still configured at the realtime server boundary; future work should load policy from the workspace policy service.
- Reconnect/resume replay semantics need durable timeline pagination before desktop reconnect can replay missed transcript messages.
