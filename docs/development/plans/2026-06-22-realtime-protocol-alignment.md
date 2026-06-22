# Realtime Protocol Alignment Implementation Plan

## Goal

Resolve the architecture review findings that create protocol drift or silent runtime behavior in the realtime service.

## Requirements and Milestone

- FR-100 to FR-105: meeting session lifecycle and retention-aware session handling.
- FR-140 to FR-146, FR-160 to FR-186: future retrieval, orchestration, and suggestion flows must fail explicitly until implemented.
- NFR-020 to NFR-024: graceful recovery and clear degraded behavior.
- NFR-047 to NFR-049: contract, failure-mode, and architecture documentation stay aligned.
- Milestone 1 hardening before Milestone 2 live AI assistance.

## Affected Architecture

- Realtime WebSocket server.
- Realtime protocol contracts and generated JSON Schema.
- Session manager configuration surface.
- Code architecture repository layout documentation.

## Contracts and Data Model

- Add one non-breaking realtime error code: `feature_unavailable`.
- Keep existing message shapes and protocol version unchanged.
- Map client `session.end` reasons to valid server `session.closed` reasons:
  - `user_stopped` -> `user_stopped`
  - `app_shutdown` -> `user_stopped`
  - `policy_stopped` -> `policy_violation`
- Remove the unused `SessionManagerOptions.maxSessionsPerConnection` option instead of preserving dead configuration.

## Security and Privacy

- No new provider or data-storage path.
- Unimplemented `context.update` and `suggestion.request` handling must not log prompt, screen text, or suggestion content.
- Workspace/session validation remains before post-auth message handling.

## Implementation Tasks

1. Add tests for `session.end` to `session.closed` reason mapping.
2. Add tests for explicit handling of `resume.request`, `suggestion.request`, and `context.update`.
3. Add `feature_unavailable` to contracts and regenerate JSON Schema.
4. Implement reason mapping and explicit unimplemented-feature errors.
5. Remove `maxSessionsPerConnection` from `SessionManager`.
6. Update protocol and code architecture docs.

## Tests and Verification

- Targeted:
  - `pnpm --filter @dokeza/contracts test`
  - `pnpm --filter @dokeza/realtime test`
  - `pnpm --filter @dokeza/realtime typecheck`
- Full:
  - `pnpm generate:schemas`
  - `pnpm check`

## Documentation Updates

- `docs/architecture/realtime_protocol.md`
- `docs/architecture/code_architecture.md`
- Generated realtime JSON Schema.

## Rollback or Degraded Behavior

- If a Milestone 2 feature is not available, return `feature_unavailable` as a recoverable error and keep the session alive.
- If resume is not supported, return `session_not_resumable` without closing the socket.

## Open Questions

- Milestone 2 still needs a dedicated suggestion routing plan through knowledge retrieval and AI orchestration.
- Full reconnect/resume support still needs durable timeline replay semantics.
