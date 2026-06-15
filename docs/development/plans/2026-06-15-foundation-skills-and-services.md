# Foundation Skills and Services Implementation Plan

## Goal

Close Milestone 0 and Milestone 1 foundation gaps by:

1. Adding two missing agent skills adapted from obra/superpowers.
2. Creating the `@dokeza/test-fixtures` package referenced in code_architecture.md.
3. Building a WebSocket server skeleton in `services/realtime`.
4. Adding an HTTP router with health endpoint to `services/api`.

## Requirements and Milestone

| SRS Area | Requirement IDs | Milestone |
| --- | --- | --- |
| Agent workflow and skills | NFR-100 to NFR-104 (maintainability) | Milestone 0 |
| Test infrastructure | NFR-100 (modular), NFR-104 (telemetry) | Milestone 0 |
| Realtime WebSocket service | FR-100 to FR-103 (session lifecycle) | Milestone 1 |
| REST API gateway | FR-001 (desktop shell), FR-020 (onboarding) | Milestone 1 |

## Affected Architecture

- `.codex/skills/` — two new skill files.
- `packages/test-fixtures/` — new shared package.
- `services/realtime/` — WebSocket server added alongside existing frame assembler.
- `services/api/` — HTTP server wrapping existing health and context functions.
- `vitest.config.ts` — alias for new test-fixtures package.
- `tsconfig.base.json` — path for new test-fixtures package.

## Contracts and Data Model

- **Realtime protocol**: No changes. The WS server uses existing message schemas from `@dokeza/contracts`.
- **REST API**: New `/health` endpoint. No schema change needed — uses existing `HealthResponse`.
- **Data model**: No database changes.
- **AI structured output**: None.
- **Telemetry events**: `realtime.auth_accepted`, `realtime.session_ended`, `realtime.audio_chunk_received`, and `realtime.audio_gap` are created via `@dokeza/telemetry`; connection open/close and auth rejection emission remain future work.

## Security and Privacy

- WebSocket server validates auth.hello token before accepting sessions.
- Workspace isolation enforced via `@dokeza/authz` for the authenticated workspace and rechecked against `session.start.payload.workspace_id`.
- No new external data flows — all local TypeScript services.
- No content logging in telemetry events.

## Implementation Tasks

### Part 1: Agent Skills (no code changes, markdown only)

1. Create `.codex/skills/dokeza-systematic-debugging/SKILL.md`.
2. Create `.codex/skills/dokeza-verification-before-completion/SKILL.md`.
3. Update `AGENTS.md` to register the two new skills.
4. Update `docs/development/agent_workflow.md` to document the new skills.

### Part 2: Test Fixtures Package

5. Create `packages/test-fixtures/package.json`.
6. Create `packages/test-fixtures/tsconfig.json`.
7. Create `packages/test-fixtures/src/index.ts` with factory functions for actors, sessions, and protocol messages.
8. Update `vitest.config.ts` to add `@dokeza/test-fixtures` alias.
9. Update `tsconfig.base.json` to add `@dokeza/test-fixtures` path.

### Part 3: WebSocket Server

10. Add `ws` dependency to `services/realtime/package.json`.
11. Add `@dokeza/authz` and `@dokeza/config` dependencies.
12. Create `services/realtime/src/session-manager.ts` — session lifecycle tracking.
13. Create `services/realtime/src/ws-server.ts` — WebSocket server with auth, frame dispatch, and session management.
14. Update `services/realtime/src/index.ts` to export server factory.
15. Create `services/realtime/src/session-manager.test.ts`.
16. Create `services/realtime/src/ws-server.test.ts`.
17. Update `services/realtime/tsconfig.json` references.

### Part 4: API HTTP Server

18. Create `services/api/src/http-server.ts` — lightweight HTTP server with health endpoint.
19. Create `services/api/src/http-server.test.ts`.

## Tests and Verification

- `pnpm test` must pass across all packages including new ones.
- `pnpm typecheck` must pass.
- `pnpm lint` must pass.
- New WebSocket server tests verify auth.hello → auth.accepted flow, invalid auth rejection, and session lifecycle.
- New API HTTP server tests verify `/health` endpoint returns valid JSON.
- Test fixtures used in new tests to prove the package works.

## Documentation Updates

- `AGENTS.md` — add two new skills.
- `docs/development/agent_workflow.md` — document new skills.
- This plan file.

## Rollback or Degraded Behavior

- Skills are additive markdown files; removing them has no code impact.
- Test fixtures package is additive; existing tests remain unchanged.
- WebSocket server is additive; removing it doesn't affect the existing frame assembler.
- API HTTP server is additive; existing factory functions remain unchanged.

## Open Questions

None — all decisions are covered by existing ADRs and architecture docs.
