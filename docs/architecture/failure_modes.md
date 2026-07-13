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
| Authentication provider | System browser cannot open or authorize URL violates the native capability | Supported opener failure or rejected non-HTTPS/out-of-scope URL | User cannot begin sign-in | Return a sanitized retryable sign-in state; do not expose the URL/error details or fall back to embedded WebView auth | No customer content loss; sign-in blocked |
| Authentication provider | Desktop callback rejected | Loopback callback timeout, user cancellation, mismatched `state`, mismatched `nonce`, PKCE verifier failure, or unexpected local callback request | User cannot complete sign-in | Close the local listener, discard the pending auth transaction, show sanitized sign-in failed or canceled state, and allow retry; do not log callback query values or fall back to development auth | No customer content loss; sign-in blocked |
| Authentication provider | Token verification key unavailable | API/realtime cannot refresh JWKS or provider metadata and has no valid cached key | API or realtime auth may fail | Fail closed for unverified tokens; use bounded cached provider keys only within configured TTL; expose recoverable unavailable state to clients | No customer content loss |
| Workspace policy | Policy lookup unavailable, invalid, or ambiguous | Realtime cannot establish authoritative provider/retention controls | New realtime session cannot be accepted safely | Emit sanitized recoverable `feature_unavailable`, close the unauthenticated connection with a retryable service code, and do not open STT/LLM providers or persist customer content | No customer content loss; session start blocked |
| Workspace policy | Cloud STT or cloud LLM disabled | Authenticated workspace prohibits an external provider path | Transcript or suggestions unavailable for that route | Do not open or call the external provider; keep permitted session capabilities active and return a recoverable `feature_unavailable` state | No provider disclosure; no data loss from permitted paths |
| API auth | Hosted provider token exchange rejected | Invalid issuer, audience, expiration, signature, unknown JWKS key ID, or Dokeza membership resolution failure | User cannot complete sign-in or refresh API token | Fail closed with sanitized `auth_invalid` or unavailable state; do not expose provider token, provider payload, or workspace internals; do not fall back to development auth | No customer content loss; live session blocked |
| API auth | Realtime token issuance failure | API error while exchanging valid user auth for a Dokeza realtime token | User cannot start or resume live session | Keep desktop signed in; mark live session unavailable; allow retry; do not fall back to hardcoded or unsigned tokens | No meeting data loss; live session delayed |
| API perimeter | Origin is not explicitly allowed | Browser/WebView sends an unmatched `Origin` | Request is blocked before authentication or handler work | Return sanitized `origin_not_allowed` (403); do not reflect the origin or use wildcard credentials | No data loss |
| API perimeter | JSON body exceeds configured bytes | Declared or streamed byte count crosses limit | Mutation/auth request is rejected | Stop parsing/handler work and return `request_body_too_large` (413); never include body content in errors/telemetry | No data loss |
| API perimeter | Credential/IP fixed-window budget exhausted | Request count exceeds configured window | API calls temporarily rejected | Return `rate_limited` (429) with `Retry-After`; retain only hashed limiter keys | No data loss |
| API readiness | Runtime dependency probe fails | Config invalid or PostgreSQL cannot be reached/selected as restricted role | Instance must not receive traffic | `/ready` returns sanitized 503 while `/health` remains the basic service/config signal | No customer content loss; traffic delayed or shifted |
| Workspace membership | Owner boundary rejected | Admin attempts an owner-role mutation, or an owner mutation would leave zero owners | Membership change is not applied | Return sanitized `membership_owner_required` (403) or `last_workspace_owner` (409); keep the membership set unchanged; require ownership transfer before the final owner steps down | No data loss; workspace remains administrable |
| Meeting deletion | Actor is neither owner/admin nor meeting creator | Current durable membership and `meeting_sessions.created_by` do not authorize deletion | Meeting remains available | Return sanitized `meeting_delete_forbidden` (403); do not delete dependent transcript/suggestion rows or emit a success audit | No data loss |
| Microphone | Permission denied | Sanitized native start error `microphone_permission_denied` | No user audio | Enter failed capture state, emit a bounded `device_unavailable` gap, show permission guidance, and allow retry | No audio captured |
| Microphone | Device unplugged or CPAL stream error | Native stream error callback emits `microphone_stream_failed` without backend/device details | User audio stops | Stop the active native stream, emit `device_unavailable`, retain the realtime session, refresh device selection, and allow retry | Audio missing while unavailable |
| Microphone | Native-to-WebView consumer stalls | Fixed 32-entry native sample queue rejects callback enqueue without blocking | Audio samples are dropped | Aggregate rejected sample duration into `audio.gap` with `local_buffer_full`; keep callback and process alive | Explicitly marked dropped interval |
| System audio | Loopback unavailable | Platform capture error | Remote speaker audio missing | Continue mic-only; show setup guidance | Remote audio unavailable |
| STT provider | Timeout or 503 | Provider error | Transcript delayed | Retry; buffer audio; switch provider if configured | Possible loss beyond buffer limit |
| STT provider | Low confidence output | STT confidence threshold | Poor transcript | Mark low confidence; avoid triggering high-stakes suggestions | No data loss |
| LLM provider | Timeout or 503 | Provider error or recoverable `llm_provider_timeout` realtime error | Suggestions unavailable | Show unavailable state; keep session active; retry manual request if safe | No data loss |
| LLM provider | Invalid structured output | Schema validation failure | Missing output | Retry with repair prompt; log validation error | No data loss |
| Live suggestion guardrails | Manual request exceeds per-session debounce or request cap | Recoverable `suggestion_rate_limited` realtime error, with `retry_after_ms` for debounce rejections | New suggestion unavailable until the interval elapses, or for the rest of the session when capped | Keep session, capture, and transcript active; show suggestions temporarily unavailable; exclude prompt content from errors; accepted-but-failed provider calls still consume budget | No data loss |
| Live suggestion budget | Bounded context exceeds token ceiling or worst-case priced request would cross the session hard limit | Recoverable `suggestion_budget_exceeded` realtime error | New suggestion is unavailable; transcript continues | Truncate component context conservatively, reject before provider submission when the total/cost ceiling still fails, and emit metadata-only status | No customer content loss; provider work is avoided |
| Usage accounting | Usage ledger read or write fails | Recoverable `usage_persistence_failed` realtime error | Suggestions become unavailable for the rest of the session | Fail closed for later provider submissions; keep capture/transcript active; never place prompt, transcript, source, or output content in the error or ledger | A usage event may be absent; no meeting content loss |
| Embedding provider | Timeout or 503 during upload indexing | Provider error mapped inside knowledge service | Semantic retrieval for that document may be unavailable | Store authorized document chunks without embeddings and keep keyword retrieval available; retry/reindex in a later indexing job | No source document loss; derived embedding missing until reindex |
| Embedding provider | Timeout or 503 during search | Provider error mapped inside knowledge service | Semantic matches may be less relevant | Fall back to keyword-only retrieval without exposing query or document text in errors | No data loss |
| Embedding provider | Invalid embedding shape | Adapter response validation failure | Semantic retrieval disabled for affected request | Reject the provider response, skip embedding persistence for upload or fall back to keyword-only search | No source document loss; derived embedding missing until reindex |
| Retrieval | Timeout | Service timeout | Generic answer or no grounded answer | Fall back to transcript-only; label as not source-grounded | No data loss |
| Retrieval | Authz failure | Permission check failure | No source answer | Block retrieval; show safe error | No data loss |
| Knowledge permission | Document has no chunks authorized for actor | Permission-tag evaluation after workspace auth | Restricted document appears absent | Omit from lists and search, return `document_not_found` for detail, and do not disclose title, chunk count, tags, or existence | No data loss |
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
