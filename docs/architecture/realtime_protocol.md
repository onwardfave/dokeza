# Dokeza Realtime Session Protocol

## 1. Purpose

This document defines the first version of the desktop-to-backend realtime protocol for live sessions. It gives desktop, backend, and AI teams a shared contract for audio, transcript, suggestion, and session events.

## 2. Transport

| Property | Value |
| --- | --- |
| Protocol | WebSocket over TLS |
| URL | `wss://api.dokeza.com/v1/realtime` |
| Control encoding | JSON text frames |
| Audio encoding | Binary frames |
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
desktop streams audio.chunk frames and context.update messages
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

### 5.3 `audio.chunk`

Audio chunks should be sent as binary frames. The binary frame must be preceded by or associated with metadata:

```json
{
  "type": "audio.chunk_meta",
  "payload": {
    "chunk_id": "aud_123",
    "stream": "microphone",
    "format": "pcm_s16le",
    "sample_rate_hz": 16000,
    "channels": 1,
    "duration_ms": 100,
    "timestamp_ms": 4500
  }
}
```

The next binary frame contains the PCM payload for `chunk_id`.

### 5.4 `context.update`

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

### 5.5 `suggestion.request`

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

### 5.6 `session.end`

```json
{
  "type": "session.end",
  "payload": {
    "reason": "user_stopped",
    "last_client_seq": 3821
  }
}
```

## 6. Server-to-Client Messages

### 6.1 `auth.accepted`

```json
{
  "type": "auth.accepted",
  "payload": {
    "connection_id": "conn_123",
    "workspace_id": "ws_123",
    "policy": {
      "screen_context_allowed": true,
      "cloud_stt_allowed": true,
      "retention_mode": "30_days"
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

## 7. Reconnection

The client shall:

- Retry with exponential backoff: 1s, 2s, 4s, 8s, up to 30s.
- Preserve unsent audio chunks according to local buffer limits.
- Send `resume.request` after reconnect.

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
- Resume the existing session if still active.
- Replay missed non-audio server messages where available.
- Return a clear unrecoverable error if the session cannot be resumed.

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

## 10. Open Decisions

- Whether audio metadata and binary payload should be merged into a single binary envelope.
- Whether MessagePack should replace JSON for high-volume event streams.
- Whether client-to-provider direct STT is allowed for selected enterprise policies.
- Maximum local audio buffer size during network loss.

