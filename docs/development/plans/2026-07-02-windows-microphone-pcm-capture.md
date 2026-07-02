# Windows Microphone PCM Capture Implementation Plan

## Goal

Implement the first native microphone capture slice for M1A.4 by producing protocol-compatible `pcm_s16le`, mono, 16 kHz chunks from the default desktop microphone and wiring the desktop webview to stream those chunks through the existing realtime client.

## Requirements and Milestone

- Milestone: M1A.4 - Desktop Audio Capture, Windows First.
- Requirements: FR-040 to FR-047 microphone capture, chunking, device handling, buffering; FR-060 to FR-067 realtime STT path; FR-200 to FR-208 visible live session state; NFR-020 to NFR-024 degraded recovery; NFR-040 to NFR-049 privacy and secure data flow.
- Acceptance:
  - Default microphone capture can produce protocol-compatible PCM chunks.
  - Chunks can feed the existing desktop realtime client.
  - The UI can start a bounded microphone capture session for local vertical testing.
  - Audio bytes are not logged, persisted, or returned in diagnostics.

## Affected Architecture

- Tauri native Rust layer:
  - bounded default microphone capture command.
  - sample conversion/downmix/resampling/chunking helpers.
- Desktop webview TypeScript:
  - Tauri command bridge for microphone PCM chunks.
  - live-session UI start action for native microphone capture.
- Existing realtime service and protocol are unchanged.

## Contracts and Data Model

- No realtime schema change.
- Native IPC command returns in-process audio chunk payloads:
  - chunk metadata compatible with `audio.chunk_meta`.
  - PCM bytes for the immediately following binary WebSocket frame.
- Capture output is transient in process memory only.

## Security and Privacy

- Do not log raw audio bytes.
- Do not persist captured audio.
- Keep returned native report focused on protocol chunks required for immediate streaming.
- Device names are metadata and already appear in existing diagnostics; raw content remains excluded.

## Implementation Tasks

1. Add Rust conversion helpers for common CPAL sample formats into mono 16 kHz `pcm_s16le`.
2. Add Rust chunking helpers that produce 100 ms protocol chunks.
3. Add a bounded `capture_default_microphone_chunks` Tauri command.
4. Register the command in the Tauri invoke handler.
5. Add a TypeScript native audio source bridge that maps the command result into `SyntheticPcmChunk`-compatible chunks.
6. Add a desktop UI action to start a bounded microphone realtime session.
7. Update the roadmap status.

## Tests and Verification

- Rust unit tests:
  - f32/i16/u16 conversion clamps and normalizes correctly.
  - stereo input downmixes to mono.
  - chunking produces valid 16 kHz mono metadata and byte lengths.
- TypeScript unit tests:
  - native command bridge dispatches the expected Tauri command.
  - native chunks are mapped to realtime client chunks without content logging.
- Verification:
  - `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
  - `pnpm --filter @dokeza/desktop test`
  - `pnpm --filter @dokeza/desktop build`
  - `pnpm check`

## Documentation Updates

- `docs/development/plans/2026-06-25-production-vertical-roadmap.md`
- This implementation plan if scope changes.
- `docs/development/tauri_capability_spike_results.md` only if manual QA is performed.

## Rollback or Degraded Behavior

- If no default microphone exists, return `microphone_default_device_missing`.
- If capture produces no frames, return an empty chunk list and visible failed/degraded UI state.
- If the realtime connection drops, existing desktop buffering/reconnect behavior handles queued chunks.

## Open Questions

- Continuous microphone streaming should replace the bounded command once the vertical is validated.
- Higher-quality resampling can replace the initial deterministic nearest-neighbor resampler if latency or accuracy requires it.
