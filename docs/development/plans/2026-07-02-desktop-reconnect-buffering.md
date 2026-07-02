# Desktop Reconnect Buffering Implementation Plan

## Goal

Close the remaining desktop-side reconnect gap by adding policy-aware audio buffering, exponential reconnect scheduling, resume retry behavior, and `audio.gap` emission for dropped buffered audio. This prepares the realtime client for the Windows microphone capture slice without introducing native audio capture yet.

## Requirements and Milestone

- Milestone: M1A.3 completion / M1A.4 groundwork.
- Requirements: FR-040 to FR-047 audio buffering and chunking foundation; FR-060 to FR-067 realtime STT failure behavior; FR-100 to FR-105 session lifecycle; FR-200 to FR-208 visible connection state; NFR-020 to NFR-024 recovery; NFR-040 to NFR-049 data-flow discipline.
- Acceptance:
  - Connection drop moves the client to reconnecting and schedules exponential reconnect.
  - Buffered unsent audio is preserved up to policy limits.
  - Dropped buffered audio ranges produce `audio.gap` after reconnect/resume.
  - Resume preserves original session ID and previous connection ID.
  - Recoverable errors remain visible and do not crash the client.

## Affected Architecture

- Desktop TypeScript realtime client in `apps/desktop/src/protocol`.
- Desktop UI status/detail rendering in `apps/desktop/src/ui`.
- No native Rust capture code in this slice.
- No realtime protocol schema change; uses existing `audio.gap` and `resume.request`.

## Contracts and Data Model

- Existing messages:
  - `resume.request`
  - `audio.gap`
  - `audio.chunk_meta`
  - binary PCM frame
- Client state additions:
  - reconnect attempt count and next delay.
  - pending audio queue size/count.
  - dropped audio gap records.
  - configurable buffer limits from `auth.accepted.policy.max_local_audio_buffer_ms` plus local byte cap.

## Security and Privacy

- Buffered audio stays in process memory only in this slice.
- Do not log raw audio bytes or transcript text.
- `audio.gap` contains timing/count metadata only; no raw content.
- No new external data flow is introduced because audio still goes only to the Dokeza realtime backend.

## Implementation Tasks

1. Add an `audio.gap` message builder and tests.
2. Add deterministic reconnect backoff calculation and tests.
3. Introduce a small in-memory audio buffer that tracks queued chunks, byte duration, and gap metadata when limits are exceeded.
4. Update `DesktopRealtimeSessionClient` to:
   - buffer audio chunks before sending.
   - flush queued audio only when streaming.
   - preserve queued chunks on close.
   - schedule resume reconnect after an unexpected close.
   - send `resume.request`, then queued `audio.gap` records, then buffered audio after resume.
5. Surface pending audio/gap/reconnect status in the desktop snapshot and live-session detail.
6. Update roadmap status.

## Tests and Verification

- Unit tests for `audio.gap` builder.
- Unit tests for reconnect backoff sequence.
- Unit tests for audio buffer retention and dropped-gap generation.
- Desktop realtime client tests with fake transport/timer:
  - unexpected close schedules reconnect with exponential delay.
  - resume sends original session ID and previous connection ID.
  - dropped buffered audio emits `audio.gap` after resume.
  - buffered audio flushes after resume.
- `pnpm --filter @dokeza/desktop test`
- `pnpm --filter @dokeza/desktop typecheck`
- `pnpm check`

## Documentation Updates

- `docs/development/plans/2026-06-25-production-vertical-roadmap.md`
- This implementation plan if scope changes.
- Failure modes already define the target behavior; update only if semantics change.
- Data flows do not need an update for this slice because no new external flow is added.

## Rollback or Degraded Behavior

- If resume fails, keep state `failed` or `degraded` and retain gap metadata for a user-visible retry/new-session decision.
- If buffer limits are exceeded, drop oldest audio chunks and emit gap metadata instead of pretending capture was continuous.

## Open Questions

- Native microphone capture will decide chunk production cadence and device disconnect behavior.
- Persistent local buffering is out of scope for this slice; it may be needed later for longer offline windows.
