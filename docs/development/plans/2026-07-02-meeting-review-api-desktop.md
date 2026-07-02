# Meeting Review API and Desktop Plan

## Goal

Start M1B by making completed meeting records visible and manageable through a workspace-scoped REST contract and a first desktop review surface.

## Requirements and Milestone

- Milestone: M1B - Meeting Record and Post-Session Review.
- Requirements: FR-002, FR-063, FR-104, FR-105, FR-224, FR-225, NFR-043, NFR-045, NFR-062, NFR-063.

## Affected Architecture

- REST API service gains meeting history, meeting detail, export, and delete routes.
- Desktop UI gains a meeting review panel that consumes those routes.
- Realtime protocol is unchanged.
- Initial API implementation uses an injectable meeting repository with an in-memory default for local/test. PostgreSQL repository wiring remains a follow-up because `services/api` does not yet own database pool lifecycle.

## Contracts and Data Model

- Add REST contracts under `@dokeza/contracts` for:
  - meeting history response,
  - meeting detail response with transcript segments and gaps,
  - meeting export response for Markdown or JSON,
  - delete response,
  - meeting API error response.
- Do not add new database tables in this slice; shapes map to existing `meeting_sessions`, `transcript_segments`, and `transcript_gaps`.

## Security and Privacy

- Every route must require an API bearer token.
- Every route must authorize the requested workspace through the actor memberships embedded in the token.
- Meeting and transcript reads must be scoped by workspace id.
- Export returns transcript content only to authorized users and must not log transcript text.
- Delete is implemented as a workspace-scoped repository operation.

## Implementation Tasks

1. Add contract schemas and validators for M1B meeting review APIs.
2. Add an API `MeetingReviewRepository` interface and in-memory implementation for local/test.
3. Add authenticated REST routes:
   - `GET /v1/workspaces/:workspaceId/meetings`
   - `GET /v1/workspaces/:workspaceId/meetings/:meetingId`
   - `GET /v1/workspaces/:workspaceId/meetings/:meetingId/export?format=markdown|json`
   - `DELETE /v1/workspaces/:workspaceId/meetings/:meetingId`
4. Add desktop API client methods and a first meeting review panel.
5. Update roadmap status after the slice lands.

## Tests and Verification

- Contract tests for accepted/rejected meeting review payloads.
- API tests for authorized history/detail/export/delete, cross-workspace denial, and content-safe error bodies.
- Desktop API client tests for route construction and auth headers.
- Desktop typecheck/tests, API tests, contract schema generation, and `pnpm check`.

## Documentation Updates

- Update the production vertical roadmap M1B status after implementation.
- No realtime protocol update is required.
- No data-flow update is required because this exposes existing Dokeza Cloud to desktop/API meeting-record flow already documented in the data-flow table.

## Rollback or Degraded Behavior

- If the API repository is unavailable, routes return explicit server errors without transcript content.
- Desktop review UI shows an unavailable state and keeps live-session features independent.

## Open Questions

- Whether the PostgreSQL-backed API repository should share code with realtime session/timeline persistence or move common meeting repositories into a package.
- Whether delete should become soft-delete once post-call artifacts and audit requirements land.
