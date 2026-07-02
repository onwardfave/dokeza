# Reconnect Resume Implementation Plan

## Goal

Implement the M1A.2 reconnect/resume slice so a WebSocket reconnect can reattach to the original realtime session, preserve sequence state, and replay missed final transcript messages without duplicating durable transcript records.

## Requirements and Milestone

- Milestone: M1A.2 - Reconnect and Resume.
- Requirements: FR-100 to FR-105 session lifecycle and rolling state; NFR-020 to NFR-024 recovery and reliability; NFR-040 to NFR-049 workspace isolation and authz.
- Roadmap acceptance:
  - Reconnect keeps the original session ID.
  - Missed final transcripts can be replayed or recovered from durable timeline state.
  - Repeated resume attempts do not duplicate transcript records.
  - Invalid or cross-workspace resume attempts fail safely.

## Affected Architecture

- Realtime WebSocket server: add `resume.request` handling after reconnect auth.
- Session state manager: introduce disconnected-but-resumable state and reattach logic.
- Transcript replay path: keep sequence-addressable final transcript messages available for replay.
- Optional session persistence: update sequence and connection state around resume where a `SessionStore` is configured.

## Contracts and Data Model

- No new realtime message type is required; `resume.request` already exists in the protocol contract.
- `resume.request.session_id` is interpreted as the original session ID to resume, while the newly authenticated connection may initially receive a temporary session ID from `auth.accepted`.
- Replay window uses `payload.last_server_seq`; replayable final transcript messages with server sequence greater than that value are sent on the reattached connection.
- Durable transcript persistence remains idempotent by `workspace_id`, `session_id`, and `segment_id`.

## Security and Privacy

- Resume must validate the new token before reattaching.
- The original session workspace must match the newly authenticated workspace.
- The authenticated user must match the original session user for this first implementation.
- Cross-workspace or cross-user resume attempts return `session_not_resumable` without exposing transcript content.
- No raw transcript, audio, prompts, document text, or suggestion content should appear in error messages or telemetry.

## Implementation Tasks

1. Extend `SessionManager` with a disconnected resumable state and a `resumeSession` operation.
2. Replace unsupported `resume.request` handling in the realtime server with validated reattachment.
3. Keep a bounded in-process replay log of emitted final transcript messages keyed by session ID and server sequence.
4. Replay final transcript messages newer than `last_server_seq` after successful resume.
5. Update session sequence and connection state through `SessionStore` when configured.
6. Preserve current explicit errors for invalid, ended, cross-workspace, cross-user, or stale-connection resume attempts.
7. Update protocol, failure-mode, and reliability/property docs.

## Tests and Verification

- Unit tests for `SessionManager`:
  - Connection removal marks sessions disconnected and resumable.
  - Resume reattaches the same session ID to a new connection.
  - Ended sessions cannot resume.
  - Workspace, user, and previous-connection mismatches fail.
- Realtime WebSocket tests:
  - Reconnect authenticates a new socket, resumes the original session, and replays missed final transcripts by server sequence.
  - Repeated resume attempts do not create duplicate transcript timeline writes.
  - Invalid or cross-workspace resume requests fail with unrecoverable `session_not_resumable`.
- Verification:
  - Targeted realtime tests during implementation.
  - `pnpm check` before completion.
  - `pnpm generate:schemas` only if contract schemas change.

## Documentation Updates

- `docs/architecture/realtime_protocol.md`: update server resume behavior from milestone-gated unavailable to M1A.2 behavior.
- `docs/architecture/failure_modes.md`: clarify resume failure and duplicate prevention expectations.
- `docs/testing/property-catalogs/realtime-transcript-timeline.md`: replace replay open risk with tested resume properties, or add a focused reconnect catalog if the behavior becomes broad enough.
- `docs/development/plans/2026-06-25-production-vertical-roadmap.md`: mark M1A.2 as implemented or partially implemented after verification.

## Rollback or Degraded Behavior

- If resume validation fails, keep failure explicit with `session_not_resumable`.
- If replay state is unavailable, the server can reattach only when safe and must not fabricate transcript content.
- If session persistence update fails, the live connection remains open and receives recoverable `session_persistence_failed`.

## Open Questions

- Durable replay across realtime process restart needs persisted server-sequence metadata on timeline records; this slice starts with in-process replay plus existing durable transcript idempotency.
- Desktop retry buffering and `audio.gap` emission are client-side M1A.3/M1A.4 work; this slice continues to persist `audio.gap` when the client sends it.
