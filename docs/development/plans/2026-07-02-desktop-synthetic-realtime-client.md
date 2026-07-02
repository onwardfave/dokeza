# Desktop Synthetic Realtime Client Implementation Plan

## Goal

Implement the M1A.3 desktop realtime client slice so the desktop webview can run a deterministic synthetic auth/session/audio/transcript lifecycle against the realtime protocol before native microphone capture is added.

## Requirements and Milestone

- Milestone: M1A.3 - Desktop Realtime Client With Synthetic Audio.
- Requirements: FR-001 to FR-008 desktop shell and diagnostics; FR-040 to FR-047 audio chunking/buffering foundation; FR-060 to FR-067 realtime STT path; FR-100 to FR-105 session lifecycle; FR-200 to FR-208 live UI/status; NFR-020 to NFR-024 recovery; NFR-040 to NFR-049 security and isolation.
- Acceptance:
  - Desktop can start a synthetic session and receive transcript messages.
  - Recoverable errors do not crash the client.
  - Connection state is visible in the UI.

## Affected Architecture

- Desktop webview TypeScript protocol client in `apps/desktop/src/protocol`.
- Desktop React UI in `apps/desktop/src/ui`.
- No new backend protocol messages, native Tauri commands, external provider flow, or data persistence path.

## Contracts and Data Model

- Reuse existing realtime messages:
  - `auth.hello`
  - `auth.accepted`
  - `session.start`
  - `audio.chunk_meta`
  - binary PCM frame
  - `resume.request`
  - `transcript.partial`
  - `transcript.final`
  - `session.status`
  - `error`
  - `session.end`
  - `session.closed`
- Add no new schemas.
- Desktop client state must track current session ID, connection ID, workspace ID, last client sequence, and last server sequence.

## Security and Privacy

- Treat transcript text as user content; show it only in the live transcript UI and test assertions.
- Do not add transcript text or raw audio bytes to diagnostics, logs, thrown error messages, or telemetry.
- Dev token input is a local development control only and must not be represented as production auth.
- Synthetic audio is generated locally and contains no user audio.

## Implementation Tasks

1. Extend desktop protocol builders for `auth.hello`, `session.end`, `resume.request`, and deterministic synthetic PCM chunk generation.
2. Add a transport abstraction so tests can use a fake WebSocket and the browser runtime can use the native `WebSocket`.
3. Implement `DesktopRealtimeSessionClient` with explicit connection states and handlers for auth, session start, audio send, transcript messages, recoverable errors, status, and close.
4. Add resume primitives and bounded reconnect backoff state; do not require a live backend in unit tests.
5. Add a compact React session panel with endpoint/token controls, synthetic start/stop actions, connection state, recoverable error display, and transcript rows.
6. Update roadmap/docs to reflect the implemented part and remaining native capture work.

## Tests and Verification

- Unit tests for message builders and synthetic PCM chunk generation.
- Unit tests for the session client using fake transport:
  - Auth and session start handshake.
  - Synthetic audio sends metadata followed by binary bytes.
  - Transcript partial/final messages update state.
  - Recoverable errors set degraded state without throwing.
  - Session close transitions to closed.
  - Resume request uses original session and previous connection data.
- Desktop package tests and typecheck.
- Full `pnpm check` before completion.

## Documentation Updates

- `docs/development/plans/2026-06-25-production-vertical-roadmap.md`
- This implementation plan as needed if scope changes.
- Realtime protocol only if semantics change; not expected.
- Failure modes only if new failure behavior is introduced; not expected beyond existing reconnect/degraded modes.

## Rollback or Degraded Behavior

- If the WebSocket cannot open, the client enters `failed`.
- If a recoverable realtime error arrives, the client enters `degraded` and keeps state available for user retry/stop.
- If the connection closes unexpectedly, the state machine can move to `reconnecting` when an active session exists; full automatic audio buffering remains for M1A.4.

## Open Questions

- The initial UI will target developer/local testing and may use a manually entered endpoint and token until production auth exists.
- Full reconnect with replay against a real backend is constrained by desktop-side buffering and is expected to deepen during M1A.4.
