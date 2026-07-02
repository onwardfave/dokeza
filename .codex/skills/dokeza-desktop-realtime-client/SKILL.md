---
name: dokeza-desktop-realtime-client
description: Implement or modify the Dokeza desktop realtime client, synthetic audio source, reconnect state machine, transcript handling, or live session UI wiring. Use when work touches apps/desktop realtime protocol code, React session state, Tauri realtime commands, synthetic PCM streaming, desktop connection status, or desktop-side resume/audio.gap behavior.
---

# Dokeza Desktop Realtime Client

## Workflow

1. Read the current implementation plan and `docs/architecture/realtime_protocol.md`.
2. Inspect `apps/desktop/src/protocol/` before adding new client abstractions.
3. Keep protocol sequencing explicit:
   - `auth.hello` starts at client `seq = 1`.
   - After `auth.accepted`, use the returned `session_id`, `connection_id`, and workspace policy.
   - Send `session.start` before audio.
   - Send each `audio.chunk_meta` JSON frame immediately before its binary PCM frame.
   - Track last client and server sequence for resume.
4. Model connection state in the client, not scattered React booleans. Use stable states such as `idle`, `connecting`, `connected`, `streaming`, `reconnecting`, `degraded`, `closed`, and `failed`.
5. Treat transcript text as user content:
   - Display it only in product UI or test assertions.
   - Do not add it to diagnostics, telemetry, thrown error messages, or logs.
6. Keep synthetic audio deterministic. Prefer generated PCM byte arrays with fixed duration, sample rate, and chunk indexes over random data.
7. For reconnect work, preserve original session identity and send `resume.request` with the previous connection ID plus last client/server sequence.
8. Keep Tauri/native changes separate from webview TypeScript when possible; run Rust verification if `src-tauri` changes.

## Tests

- Pure protocol builders: unit tests in `apps/desktop/src/protocol`.
- Client state machine: unit tests with fake WebSocket transport.
- React UI: component/state tests where practical; avoid requiring a live backend for unit tests.
- Full native/Tauri paths: add Rust tests or diagnostics probes only when native code changes.

## Documentation

Update these when behavior changes:

- `docs/development/plans/2026-06-25-production-vertical-roadmap.md`
- The slice-specific implementation plan.
- `docs/architecture/realtime_protocol.md` for protocol semantics.
- `docs/architecture/failure_modes.md` for new failure or degraded states.
- `docs/security/data_flows.md` only if a new external data flow is introduced.
