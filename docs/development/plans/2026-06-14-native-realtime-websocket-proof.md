# Native Realtime WebSocket Proof Implementation Plan

## Goal

Prove that the Tauri native layer can open a WebSocket connection, send the existing realtime protocol control frames, send a synthetic binary PCM audio payload immediately after `audio.chunk_meta`, receive server responses, and return metadata-only diagnostics. This completes the next Tauri capability-spike blocker without introducing production realtime service behavior.

## Requirements and Milestone

- FR-006: audio and transcription tasks must run outside the UI thread.
- FR-060 to FR-067: realtime transcription transport prerequisites.
- FR-100 to FR-105: session lifecycle transport prerequisites.
- NFR-020 to NFR-026: recovery, buffering, and realtime protocol behavior.
- NFR-100 to NFR-104: independently testable desktop and protocol modules.
- Full-system Milestone 0: validate the Tauri desktop shell decision.
- Full-system Milestone 1: prepare the core desktop and realtime backbone.
- Product verticals: Desktop Client Platform and Audio and Realtime Transcription Platform.

## Affected Architecture

- `apps/desktop/src-tauri`: add a Rust realtime WebSocket capability probe.
- `apps/desktop/src/ui`: add a diagnostics action for the probe.
- `docs/development/tauri_capability_spike_results.md`: record evidence for the WebSocket acceptance criterion.
- `docs/development/windows_audio_diagnostics_manual_qa.md`: add local manual QA steps for the realtime probe.
- No production backend service behavior changes in this slice.

## Contracts and Data Model

- Reuse the existing realtime protocol version `2026-06-12`.
- Reuse existing message types:
  - `auth.hello`
  - `auth.accepted`
  - `session.start`
  - `audio.chunk_meta`
  - binary PCM payload frame
  - `audio.gap`
  - `session.end`
  - `session.closed`
- Do not change `docs/architecture/realtime_protocol.md` or generated TypeScript schemas.
- Add a Tauri command named `probe_realtime_websocket`.
- The command response is diagnostic metadata only: frame counts, message counts, protocol version, byte counts, sequence numbers, and redaction status.

## Security and Privacy

- The proof uses a local loopback WebSocket endpoint started only for the probe.
- The audio payload is synthetic silence-like PCM bytes, not captured microphone or system audio.
- No transcript, prompt, document, suggestion, screen, or real audio content may be returned or logged.
- No new external data flow is introduced; the existing device-to-realtime flow is already documented in `docs/security/data_flows.md`.
- Workspace isolation is represented only by a synthetic `workspace_id` in protocol messages. No workspace data is read.
- The synthetic token is not a real credential and must not be persisted.

## Implementation Tasks

1. Commit this plan before code changes.
2. Add Rust tests for protocol message ordering, metadata-only reporting, and synthetic payload byte-length matching.
3. Add a local loopback WebSocket server inside the Rust probe.
4. Add a native client path that sends the protocol frames in strict order.
5. Return a metadata-only `RealtimeWebSocketProbeReport`.
6. Wire the Tauri command into `lib.rs`.
7. Add TypeScript wrapper, formatter, and diagnostics UI action.
8. Add frontend tests for command dispatch and metadata-only formatting.
9. Update spike results, manual QA, and testing strategy docs.
10. Run targeted and broad verification, commit, push, and watch CI.

## Tests and Verification

- Rust unit/component tests:
  - client message plan has the expected message types and monotonic sequences.
  - `audio.chunk_meta.payload.byte_length` matches the synthetic binary frame length.
  - serialized outbound messages do not contain synthetic sensitive markers.
  - in-process local WebSocket probe completes and reports frame counts.
- Frontend tests:
  - `realtimeWebSocket` invokes `probe_realtime_websocket`.
  - formatter renders safe realtime probe metadata.
- Local verification:
  - `pnpm format:check`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm --filter @dokeza/desktop test`
  - `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml -- --check`
  - `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings`
  - `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
  - `pnpm --filter @dokeza/desktop build`
  - `pnpm --filter @dokeza/desktop tauri build --debug --no-bundle`

## Documentation Updates

- `docs/development/tauri_capability_spike_results.md`: mark WebSocket streaming as build viability pass after verification.
- `docs/development/windows_audio_diagnostics_manual_qa.md`: add `Realtime WS` manual QA steps.
- `docs/testing/testing_strategy.md`: include native realtime WebSocket diagnostics under desktop tests.

## Rollback or Degraded Behavior

The proof is isolated behind a diagnostics command and can be removed without affecting production contracts. If local loopback binding or WebSocket connection fails, the diagnostics command returns a safe error and no production session state is affected.

## Open Questions

- Should the production desktop realtime client live entirely in Rust, or should only capture/buffering live in Rust while session orchestration remains in TypeScript?
- Which reconnect and backpressure tests should be promoted from unit/component tests into reliability workloads?
- When should this local proof evolve into a production client abstraction with authenticated backend endpoints?
