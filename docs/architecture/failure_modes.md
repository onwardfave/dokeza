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
| WebSocket | Resume rejected | `session_not_resumable` realtime error | Live session cannot reattach | Keep failure explicit; start a new session only by user/client policy; emit `audio.gap` for dropped buffered audio when applicable | Possible loss of unbuffered audio and missed live messages |
| WebSocket | Server backpressure | `flow_control` message | Transcript delayed | Pause sends, buffer locally within limit, show degraded state, emit `audio.gap` if buffered audio is dropped | Possible loss if buffer fills |
| Authentication provider | Sign-in outage | Hosted IdP timeout, 5xx, DNS failure, or SDK error | New sign-ins and token refresh unavailable | Show sign-in unavailable; keep already authenticated local state only until existing tokens expire; do not start new realtime sessions without valid tokens | No meeting data loss; new sessions blocked |
| Authentication provider | Desktop callback rejected | Loopback callback timeout, user cancellation, mismatched `state`, mismatched `nonce`, PKCE verifier failure, or unexpected local callback request | User cannot complete sign-in | Close the local listener, discard the pending auth transaction, show sanitized sign-in failed or canceled state, and allow retry; do not log callback query values or fall back to development auth | No customer content loss; sign-in blocked |
| Authentication provider | Token verification key unavailable | API/realtime cannot refresh JWKS or provider metadata and has no valid cached key | API or realtime auth may fail | Fail closed for unverified tokens; use bounded cached provider keys only within configured TTL; expose recoverable unavailable state to clients | No customer content loss |
| API auth | Hosted provider token exchange rejected | Invalid issuer, audience, expiration, signature, unknown JWKS key ID, or Dokeza membership resolution failure | User cannot complete sign-in or refresh API token | Fail closed with sanitized `auth_invalid` or unavailable state; do not expose provider token, provider payload, or workspace internals; do not fall back to development auth | No customer content loss; live session blocked |
| API auth | Realtime token issuance failure | API error while exchanging valid user auth for a Dokeza realtime token | User cannot start or resume live session | Keep desktop signed in; mark live session unavailable; allow retry; do not fall back to hardcoded or unsigned tokens | No meeting data loss; live session delayed |
| Microphone | Permission denied | OS permission response | No user audio | Show permission guidance; allow retry | No audio captured |
| Microphone | Device unplugged | Device change event | User audio stops | Pause mic capture; prompt device selection | Audio missing while unplugged |
| System audio | Loopback unavailable | Platform capture error | Remote speaker audio missing | Continue mic-only; show setup guidance | Remote audio unavailable |
| STT provider | Timeout or 503 | Provider error | Transcript delayed | Retry; buffer audio; switch provider if configured | Possible loss beyond buffer limit |
| STT provider | Low confidence output | STT confidence threshold | Poor transcript | Mark low confidence; avoid triggering high-stakes suggestions | No data loss |
| LLM provider | Timeout or 503 | Provider error or recoverable `llm_provider_timeout` realtime error | Suggestions unavailable | Show unavailable state; keep session active; retry manual request if safe | No data loss |
| LLM provider | Invalid structured output | Schema validation failure | Missing output | Retry with repair prompt; log validation error | No data loss |
| Embedding provider | Timeout or 503 during upload indexing | Provider error mapped inside knowledge service | Semantic retrieval for that document may be unavailable | Store authorized document chunks without embeddings and keep keyword retrieval available; retry/reindex in a later indexing job | No source document loss; derived embedding missing until reindex |
| Embedding provider | Timeout or 503 during search | Provider error mapped inside knowledge service | Semantic matches may be less relevant | Fall back to keyword-only retrieval without exposing query or document text in errors | No data loss |
| Embedding provider | Invalid embedding shape | Adapter response validation failure | Semantic retrieval disabled for affected request | Reject the provider response, skip embedding persistence for upload or fall back to keyword-only search | No source document loss; derived embedding missing until reindex |
| Retrieval | Timeout | Service timeout | Generic answer or no grounded answer | Fall back to transcript-only; label as not source-grounded | No data loss |
| Retrieval | Authz failure | Permission check failure | No source answer | Block retrieval; show safe error | No data loss |
| Milestone-gated realtime feature | Feature unavailable | `feature_unavailable` realtime error | Context or suggestions unavailable | Keep session active; return explicit recoverable error without placeholder content | No data loss |
| Screen capture | Permission revoked | OS permission event | No screen context | Continue without screen context; hide screen-dependent suggestions | Screen context unavailable |
| Browser extension | Disconnected | Extension heartbeat missing | No structured browser context | Fall back to active window or OCR if allowed | Browser context unavailable |
| Local cache | Disk full | Write error | Cannot persist local state | Warn user; continue in memory where possible | Possible local state loss |
| Desktop secure token storage | OS credential store unavailable or denied | Native secure-token command failure | Stored sign-in cannot be restored or saved | Continue with in-memory token for current run; show sanitized storage-unavailable state; never fall back to localStorage, diagnostics, or plaintext files | No meeting data loss; user may need to sign in again |
| Crash diagnostics | Local report write fails | Filesystem write error in panic hook or diagnostics probe | Local crash report may be unavailable | Do not panic recursively; continue default panic handling; return a safe diagnostics error for manual probes | Diagnostic metadata missing |
| Backend DB | Session write failure | Session store error or `session_persistence_failed` realtime error | Session recovery and post-call record may be incomplete | Keep realtime session open, emit recoverable error, retry or reconcile through durable storage path when available | Possible loss of persisted session metadata |
| Transcript timeline | Segment or gap write failure | Transcript sink error or `transcript_persistence_failed` realtime error | Live transcript continues, meeting memory may be incomplete | Keep realtime session open, emit recoverable error, retry or reconcile through durable storage path when available | Possible loss of persisted transcript/gap record |
| Suggestion persistence | Completed suggestion write failure | Suggestion sink error or `suggestion_persistence_failed` realtime error after `suggestion.complete` delivery | Live suggestion remains visible, meeting review may omit it | Keep realtime session open, emit recoverable metadata-only error, retry/reconcile later when durable storage is available | Possible loss of persisted suggestion/citation record |
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
- Reconnected sessions must preserve the original session ID when resume succeeds.
- Resume attempts must validate token, workspace, user, previous connection, and session state before replaying any transcript content.
- Repeated resume attempts must not create duplicate durable transcript records.
- Provider retries must use bounded exponential backoff.
- Manual user actions should not be retried automatically if they could cause duplicate writeback.
- Post-call workflows should retry safely through the workflow engine.

## 7. Verification

Each release candidate should run failure injection tests for:

- Network drop during live session.
- Authentication provider outage during sign-in and realtime-token issuance.
- STT timeout.
- LLM timeout.
- Audio device unplug.
- Screen permission revocation.
- OAuth expiration.
- Local disk write failure.
- Local crash report write failure.
- Backend restart during active session.
