# Dokeza Realtime Session Protocol

## 1. Purpose

This document defines the first version of the desktop-to-backend realtime protocol for live sessions. It gives desktop, backend, and AI teams a shared contract for audio, transcript, suggestion, and session events.

## 2. Transport

| Property | Value |
| --- | --- |
| Protocol | WebSocket over TLS |
| URL | `wss://api.dokeza.com/v1/realtime` |
| Control encoding | JSON text frames |
| Audio encoding | Binary PCM payload frames paired with preceding `audio.chunk_meta` JSON frames |
| Auth | Short-lived session token sent in `auth.hello` |
| Heartbeat | Client sends ping every 30 seconds; server times out after 90 seconds |
| Versioning | Every JSON message includes `protocol_version` |

## 3. Connection Lifecycle

```text
desktop creates meeting session
desktop opens WSS connection
desktop sends auth.hello
server sends auth.accepted
desktop sends session.start
desktop streams audio.chunk_meta + binary audio frame pairs and context.update messages
server streams transcript, suggestion, and status messages
desktop sends session.end
server sends session.closed
desktop closes connection
```

The client should open the WebSocket on session start and close it after session end. Long-lived idle connections between meetings are not required for the first implementation.

## 4. Message Envelope

All JSON messages must use this envelope:

```json
{
  "protocol_version": "2026-06-12",
  "type": "session.start",
  "seq": 12,
  "session_id": "sess_123",
  "sent_at": "2026-06-12T17:10:00.000Z",
  "payload": {}
}
```

| Field | Required | Description |
| --- | --- | --- |
| `protocol_version` | Yes | Protocol version date. |
| `type` | Yes | Message type. |
| `seq` | Yes | Monotonic client or server sequence number per connection direction. |
| `session_id` | Yes after auth | Meeting session ID. |
| `sent_at` | Yes | ISO 8601 timestamp. |
| `payload` | Yes | Type-specific body. |

## 5. Client-to-Server Messages

### 5.1 `auth.hello`

```json
{
  "type": "auth.hello",
  "payload": {
    "token": "short_lived_session_token",
    "client_version": "0.1.0",
    "platform": "windows",
    "device_id": "dev_123"
  }
}
```

### 5.2 `session.start`

```json
{
  "type": "session.start",
  "payload": {
    "workspace_id": "ws_123",
    "meeting_source": "zoom",
    "capture": {
      "microphone": true,
      "system_audio": true,
      "screen_context": false
    },
    "processing": {
      "stt": "cloud",
      "llm": "cloud",
      "retrieval": "cloud"
    }
  }
}
```

### 5.3 `audio.chunk_meta` + binary payload

For protocol version `2026-06-12`, audio chunks use a two-frame pair:

1. A JSON `audio.chunk_meta` message using the standard envelope.
2. Exactly one binary WebSocket frame immediately after that metadata message.

No other JSON or binary frame may appear between the metadata frame and its binary payload. The binary payload is raw audio bytes for the declared `chunk_id`; it has no nested JSON envelope and does not increment the JSON `seq` counter.

```json
{
  "type": "audio.chunk_meta",
  "payload": {
    "chunk_id": "aud_123",
    "chunk_index": 42,
    "stream": "microphone",
    "format": "pcm_s16le",
    "sample_rate_hz": 16000,
    "channels": 1,
    "duration_ms": 100,
    "timestamp_ms": 4500,
    "byte_length": 3200
  }
}
```

The server must reject or recoverably error on missing payload frames, extra payload frames, unsupported formats, out-of-order `chunk_index` values within a stream, or binary payloads whose byte length does not match `byte_length`.

### 5.4 `audio.gap`

When local buffering overflows or the desktop intentionally drops unsent audio, the client must send an `audio.gap` message after reconnect or when the session is still connected.

```json
{
  "type": "audio.gap",
  "payload": {
    "stream": "microphone",
    "start_ms": 120000,
    "end_ms": 138000,
    "dropped_chunks": 180,
    "reason": "local_buffer_full"
  }
}
```

The backend must persist the gap in the session timeline so downstream transcript, summary, and diagnostics views do not imply continuous capture.

For native microphone capture, the desktop advances its local stream timeline across discarded partial/queued samples at the native pause boundary and across the measured acknowledged pause interval. It uses `local_buffer_full` for each aggregate of samples rejected by the bounded native callback queue. A device/stream failure uses `device_unavailable`. The first later audio chunk must start at or after the gap end; chunk timestamps must not overlap a reported gap.

### 5.5 `context.update`

Context updates are accepted by the protocol for forward compatibility. Until screen context processing is enabled, the server returns a recoverable `feature_unavailable` error and must not log the context title or text.

```json
{
  "type": "context.update",
  "payload": {
    "source": "active_window",
    "title": "Quarterly Business Review - Google Slides",
    "app": "Chrome",
    "text": "Q3 renewal risk and implementation blockers",
    "captured_at": "2026-06-12T17:10:15.000Z"
  }
}
```

### 5.6 `suggestion.request`

Suggestion requests are implemented for manual Milestone 2 live assistance. The server uses the authenticated session workspace, recent final transcript context, workspace cloud LLM policy, and AI orchestrator prompt routing; the client cannot provide a workspace override. If configured live suggestions require an external model provider and `cloud_llm_allowed` is false, the server returns a recoverable `feature_unavailable` error before provider submission. When `include_sources` is true, the server may retrieve authorized source chunks through the knowledge service, pass them to the AI orchestrator as delimited untrusted source material, and return citation metadata in `suggestion.complete.payload.sources`. If retrieval is unavailable or no authorized chunks match, the server falls back to transcript-only suggestion behavior with an empty `sources` array.

```json
{
  "type": "suggestion.request",
  "payload": {
    "request_id": "sreq_123",
    "kind": "answer_question",
    "user_prompt": "Suggest an answer",
    "include_sources": true
  }
}
```

### 5.7 `session.end`

```json
{
  "type": "session.end",
  "payload": {
    "reason": "user_stopped",
    "last_client_seq": 3821
  }
}
```

Valid client end reasons:

- `user_stopped`: the user manually stopped the session.
- `app_shutdown`: the desktop app is shutting down gracefully.
- `policy_stopped`: workspace or admin policy stopped the session.

The server maps these client reasons to `session.closed` reasons:

- `user_stopped` -> `user_stopped`
- `app_shutdown` -> `user_stopped`
- `policy_stopped` -> `policy_violation`

## 6. Server-to-Client Messages

### 6.1 `auth.accepted`

Before sending `auth.accepted`, the realtime service resolves the authenticated workspace's current policy through the workspace-policy repository. PostgreSQL-backed environments read `workspace_policies` inside a workspace-scoped transaction. A missing policy row uses the documented plan defaults; an unavailable, invalid, or ambiguous policy fails closed and the server does not accept the realtime session.

```json
{
  "type": "auth.accepted",
  "payload": {
    "connection_id": "conn_123",
    "workspace_id": "ws_123",
    "policy": {
      "screen_context_allowed": true,
      "cloud_stt_allowed": true,
      "cloud_llm_allowed": true,
      "direct_provider_stt_allowed": false,
      "retention_mode": "30_days",
      "max_local_audio_buffer_ms": 300000
    }
  }
}
```

### 6.2 `transcript.partial`

```json
{
  "type": "transcript.partial",
  "payload": {
    "segment_id": "seg_123",
    "speaker": "remote",
    "text": "Can you explain your onboarding process",
    "start_ms": 4200,
    "end_ms": 7000,
    "confidence": 0.86
  }
}
```

### 6.3 `transcript.final`

```json
{
  "type": "transcript.final",
  "payload": {
    "segment_id": "seg_123",
    "speaker": "remote",
    "text": "Can you explain your onboarding process?",
    "start_ms": 4200,
    "end_ms": 7100,
    "confidence": 0.91
  }
}
```

### 6.4 `suggestion.stream_token`

```json
{
  "type": "suggestion.stream_token",
  "payload": {
    "suggestion_id": "sug_123",
    "request_id": "sreq_123",
    "token": "We",
    "index": 1
  }
}
```

### 6.5 `suggestion.complete`

```json
{
  "type": "suggestion.complete",
  "payload": {
    "suggestion_id": "sug_123",
    "request_id": "sreq_123",
    "kind": "answer_question",
    "content": "We typically run a two-week onboarding plan with a dedicated CSM, migration checklist, and weekly implementation checkpoints.",
    "sources": [
      {
        "document_id": "doc_123",
        "title": "Enterprise Onboarding Guide",
        "chunk_id": "chunk_456"
      }
    ],
    "confidence": "medium",
    "prompt_version": "sales.answer.v3",
    "model": "live-fast-1"
  }
}
```

### 6.6 `session.status`

```json
{
  "type": "session.status",
  "payload": {
    "mode": "degraded_network",
    "message": "Transcription is delayed. Audio is being buffered locally.",
    "recoverable": true
  }
}
```

### 6.7 `error`

```json
{
  "type": "error",
  "payload": {
    "code": "stt_provider_timeout",
    "message": "Transcription provider timed out.",
    "recoverable": true,
    "retry_after_ms": 2000
  }
}
```

Initial server error codes include:

- `auth_failed`
- `invalid_message`
- `missing_binary_payload`
- `unexpected_binary_payload`
- `audio_byte_length_mismatch`
- `audio_chunk_out_of_order`
- `unsupported_audio_format`
- `stt_provider_timeout`
- `session_persistence_failed`
- `transcript_persistence_failed`
- `suggestion_persistence_failed`
- `session_not_resumable`
- `feature_unavailable`
- `llm_provider_timeout`
- `suggestion_rate_limited`

Before opening an external STT stream or submitting an external live-suggestion request, the server checks the resolved `cloud_stt_allowed` or `cloud_llm_allowed` value respectively. These checks apply to every external provider route, including OpenAI-compatible endpoints. Disabled provider paths return recoverable `feature_unavailable` errors while keeping the authenticated session available for permitted capabilities.

`suggestion_rate_limited` is recoverable. The server emits it for a `suggestion.request` that is either faster than the per-session debounce interval (with `retry_after_ms` indicating when the next request may be accepted) or beyond the per-session request cap (no `retry_after_ms`; further manual suggestions are unavailable for the rest of the session). The live session, capture, and transcript flow remain active; error messages exclude prompt content. Server defaults are a 2000 ms debounce and 30 accepted requests per session; invalid configuration falls back to these defaults rather than disabling limits. Accepted requests consume budget even if the provider call later fails, so retry storms cannot multiply provider spend.

`suggestion_persistence_failed` is recoverable. The server may emit it after a `suggestion.complete` has already been delivered when durable meeting-review storage fails; clients should keep the live suggestion visible and allow normal session continuation.

### 6.8 `session.closed`

```json
{
  "type": "session.closed",
  "payload": {
    "reason": "user_stopped",
    "final_server_seq": 1042
  }
}
```

Valid closed reasons:

- `user_stopped`
- `server_closed`
- `policy_violation`
- `unrecoverable_error`

## 7. Reconnection

The client shall:

- Retry with exponential backoff: 1s, 2s, 4s, 8s, up to 30s.
- Preserve unsent audio chunks up to the active workspace policy limit.
- Use a default local buffer cap of five minutes per active audio stream or 25 MB per active audio stream, whichever is lower, unless workspace policy sets a stricter value.
- Send `audio.gap` for any dropped buffered audio range.
- Send `resume.request` after reconnect.
- Use the original meeting `session_id` in the `resume.request` envelope, even though the new authenticated WebSocket receives its own temporary `auth.accepted.session_id`.

```json
{
  "type": "resume.request",
  "payload": {
    "previous_connection_id": "conn_123",
    "last_client_seq": 3821,
    "last_server_seq": 991
  }
}
```

The server shall:

- Validate the session token and workspace access.
- Resume the existing session if it is active or disconnected, the authenticated user matches the original session user, the workspace matches, and `previous_connection_id` matches the resumable session.
- Reattach the new connection to the original session ID and preserve the original server sequence.
- Replay missed final transcript messages with server `seq` greater than `last_server_seq` where replay state is available.
- Return a clear unrecoverable `session_not_resumable` error if the session is unknown, ended, belongs to another workspace or user, has a mismatched previous connection, or cannot be safely resumed.

M1A.2 replay is backed by bounded in-process final-transcript replay state plus idempotent durable transcript writes. Durable replay after realtime process restart requires persisted server-sequence metadata on timeline records and is tracked as follow-up work.

## 8. Backpressure

The server may send:

```json
{
  "type": "flow_control",
  "payload": {
    "audio_paused": true,
    "reason": "server_backpressure",
    "retry_after_ms": 500
  }
}
```

The client shall pause sending audio frames temporarily, continue local capture where buffer capacity allows, and show degraded status if backpressure persists.

## 9. Versioning Rules

- Additive fields are allowed within a protocol version.
- Removing or changing field meaning requires a new protocol version.
- The backend must support at least the current stable desktop version and one previous stable version.
- The desktop must include client version and protocol version in every session.

## 10. Initial Routing and Encoding Decisions

- The desktop sends audio only to the Dokeza realtime service for the initial implementation.
- The Dokeza realtime service routes cloud STT through an internal STT adapter using Dokeza-managed provider credentials and workspace policy checks.
- Direct client-to-provider STT is not allowed in the initial implementation. Any future exception requires a new ADR, updated data-flow documentation, token-broker design, and workspace policy controls.
- JSON remains the control and event encoding for protocol version `2026-06-12`.
- Audio uses the `audio.chunk_meta` JSON frame plus immediate binary payload frame pair defined in this document.
- MessagePack or a single custom binary envelope may be reconsidered only after measured protocol overhead threatens latency or cost targets.
