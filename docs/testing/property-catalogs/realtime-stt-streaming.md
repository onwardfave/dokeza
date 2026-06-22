# Realtime STT Streaming Property Catalog

## System Under Test

Realtime session STT lifecycle from authenticated WebSocket connection through provider stream creation, audio chunk forwarding, provider transcript callback handling, and provider stream closure.

## State and Concurrency Model

- One authenticated realtime connection owns one active Dokeza session.
- One Dokeza realtime session may own one active STT provider session when the adapter supports session-scoped STT.
- Audio chunk processing and provider transcript callbacks can occur asynchronously.
- `TranscriptProcessor` remains the ordering and duplicate-suppression boundary before client emission.
- Session end or connection close transitions the session to closed/ended and must suppress later provider callbacks.

## Properties

- **Single provider stream**: Multiple audio chunks for one realtime session create at most one provider stream.
- **Session isolation**: Provider callbacks carry only the owning session/workspace context and cannot emit into another session.
- **Closed-session suppression**: Transcript callbacks after `session.end`, socket close, or socket error do not emit client transcript messages.
- **Content-safe telemetry**: Telemetry excludes raw audio, transcript text, provider payload bodies, prompts, documents, suggestions, and credentials.
- **Recoverable provider failure**: Provider stream errors emit recoverable STT errors and do not crash or close the realtime WebSocket by default.
- **Bounded provider lifecycle**: Provider streams close on `session.end`, socket close, and socket error.

## Minimal Test Topology

- One in-process realtime WebSocket server.
- One test WebSocket client.
- A fake session-scoped STT adapter or fake Deepgram streaming transport.
- Synthetic PCM byte chunks and synthetic provider result messages.

## Workloads

- Authenticate, send two audio chunks, assert one STT session and two chunk forwards.
- Emit asynchronous provider partial/final callbacks and assert client transcript messages.
- End the session, then emit a delayed provider callback and assert no client message.
- Trigger provider error callback and assert recoverable `error` message while the session remains usable.

## Faults to Inject

- Provider open timeout.
- Provider stream error after open.
- Provider callback after session close.
- Provider invalid JSON payload.
- WebSocket client close during active provider stream.

## Observability Needed

- STT stream open/close counters.
- STT chunk sent count.
- STT provider error count by provider/model.
- Transcript event emission and suppression counts.
- Session close reason metadata.

## Open Risks

- Separate microphone and system-audio provider streams may be needed for stronger speaker attribution.
- Live Deepgram keepalive timing needs soak testing with real provider behavior.
- Server currently tolerates audio before an explicit `session.start`; stricter protocol ordering should be addressed in a later protocol-hardening slice.
