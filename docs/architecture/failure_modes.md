# Dokeza Failure Modes and Recovery

## 1. Purpose

This document defines expected behavior when Dokeza subsystems fail. Every failure mode should have a detection method, user-visible state, recovery behavior, and data-loss expectation.

## 2. System Modes

```text
FULL
  -> DEGRADED_NETWORK
  -> OFFLINE
  -> RECONNECTING
  -> FULL

FULL
  -> DEGRADED_PROVIDER
  -> FULL

FULL
  -> DEGRADED_PERMISSION
  -> FULL
```

| Mode | Meaning | Live Transcript | Suggestions | Post-Call |
| --- | --- | --- | --- | --- |
| `FULL` | All required services available. | Available | Available | Available |
| `DEGRADED_NETWORK` | Network unstable. | Delayed or local only | Delayed or unavailable | Queued |
| `OFFLINE` | No backend access. | Local only if configured | Unavailable unless local LLM configured | Queued |
| `RECONNECTING` | Client is restoring session. | Buffered or paused | Paused | Queued |
| `DEGRADED_PROVIDER` | STT, LLM, or integration provider degraded. | Depends on provider | Depends on provider | Retry |
| `DEGRADED_PERMISSION` | OS or workspace permission missing. | Partial | Partial | Available for captured data |

## 3. Failure Mode Matrix

| Component | Failure Mode | Detection | User Impact | Required Behavior | Data Loss |
| --- | --- | --- | --- | --- | --- |
| WebSocket | Connection drop | Missed heartbeat or socket close | Live updates stop | Reconnect with exponential backoff; send resume request | Possible loss of unbuffered audio |
| WebSocket | Server backpressure | `flow_control` message | Transcript delayed | Pause sends, buffer locally within limit, show degraded state, emit `audio.gap` if buffered audio is dropped | Possible loss if buffer fills |
| Microphone | Permission denied | OS permission response | No user audio | Show permission guidance; allow retry | No audio captured |
| Microphone | Device unplugged | Device change event | User audio stops | Pause mic capture; prompt device selection | Audio missing while unplugged |
| System audio | Loopback unavailable | Platform capture error | Remote speaker audio missing | Continue mic-only; show setup guidance | Remote audio unavailable |
| STT provider | Timeout or 503 | Provider error | Transcript delayed | Retry; buffer audio; switch provider if configured | Possible loss beyond buffer limit |
| STT provider | Low confidence output | STT confidence threshold | Poor transcript | Mark low confidence; avoid triggering high-stakes suggestions | No data loss |
| LLM provider | Timeout or 503 | Provider error | Suggestions unavailable | Show unavailable state; retry manual request if safe | No data loss |
| LLM provider | Invalid structured output | Schema validation failure | Missing output | Retry with repair prompt; log validation error | No data loss |
| Retrieval | Timeout | Service timeout | Generic answer or no grounded answer | Fall back to transcript-only; label as not source-grounded | No data loss |
| Retrieval | Authz failure | Permission check failure | No source answer | Block retrieval; show safe error | No data loss |
| Screen capture | Permission revoked | OS permission event | No screen context | Continue without screen context; hide screen-dependent suggestions | Screen context unavailable |
| Browser extension | Disconnected | Extension heartbeat missing | No structured browser context | Fall back to active window or OCR if allowed | Browser context unavailable |
| Local cache | Disk full | Write error | Cannot persist local state | Warn user; continue in memory where possible | Possible local state loss |
| Crash diagnostics | Local report write fails | Filesystem write error in panic hook or diagnostics probe | Local crash report may be unavailable | Do not panic recursively; continue default panic handling; return a safe diagnostics error for manual probes | Diagnostic metadata missing |
| Backend DB | Write failure | DB error | Session persistence delayed | Queue writes if possible; show degraded service | Possible loss if queue unavailable |
| Integration | OAuth expired | API 401 | Writeback fails | Prompt reconnect; keep draft | No generated content loss |
| Integration | Rate limited | API 429 | Writeback delayed | Retry according to provider policy | No generated content loss |
| Update manager | Update fails | Installer error | App remains old version | Keep previous version; report diagnostic | No data loss |

## 4. User-Visible Indicators

The desktop client shall show a concise status indicator for:

- Capturing.
- Paused.
- Reconnecting.
- Transcription delayed.
- Suggestions unavailable.
- Screen context disabled.
- Local-only mode.
- Integration writeback failed.

The UI should avoid alarming copy during meetings. Detailed errors belong in diagnostics or post-session review.

## 5. Local Buffering Requirements

- The client should buffer unsent audio during short network interruptions.
- The default buffer cap is five minutes per active audio stream or 25 MB per active audio stream, whichever is lower.
- Buffer limits must be configurable by platform and workspace policy.
- When the buffer is near capacity, the client must show a degraded indicator.
- If audio must be dropped, the client must send `audio.gap` so the backend records a gap marker in the transcript timeline.

## 6. Recovery Requirements

- Recovery must not duplicate transcript segments or suggestions.
- Reconnected sessions must preserve the original session ID.
- Provider retries must use bounded exponential backoff.
- Manual user actions should not be retried automatically if they could cause duplicate writeback.
- Post-call workflows should retry safely through the workflow engine.

## 7. Verification

Each release candidate should run failure injection tests for:

- Network drop during live session.
- STT timeout.
- LLM timeout.
- Audio device unplug.
- Screen permission revocation.
- OAuth expiration.
- Local disk write failure.
- Local crash report write failure.
- Backend restart during active session.
