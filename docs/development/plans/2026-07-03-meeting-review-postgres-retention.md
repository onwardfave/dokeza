# Meeting Review PostgreSQL and Retention Implementation Plan

## Goal

Move the M1B meeting review slice from local/test-only repository behavior toward production by adding PostgreSQL-backed meeting history, detail, export, deletion, transcript search, and retention cleanup primitives behind the existing API seam.

## Requirements and Milestone

- Milestone: M1B - Meeting Record and Post-Session Review.
- Requirement IDs: FR-100 to FR-105, FR-220, FR-224 to FR-225, NFR-020 to NFR-025, NFR-040 to NFR-049, NFR-060 to NFR-063.
- Product vertical: Milestone 1 production vertical, supporting durable transcript review before live AI suggestions.

## Affected Architecture

- API service meeting review routes.
- PostgreSQL meeting sessions, transcript segments, and transcript gaps.
- Desktop meeting review API client and review panel.
- Existing realtime protocol is not changed.

## Contracts and Data Model

- REST response schemas remain stable.
- The meeting list route gains an additive `q` query parameter for transcript search without changing response shape.
- PostgreSQL repository reads from existing `meeting_sessions`, `transcript_segments`, and `transcript_gaps`.
- Deletion relies on existing foreign-key cascade from `meeting_sessions` to transcript rows and future derived artifacts.

## Security and Privacy

- Every repository operation is scoped by `workspace_id` and uses `withWorkspaceTransaction`.
- Meeting history responses continue to exclude transcript content.
- Search query text is request input only and must not be logged.
- Export and detail endpoints may return transcript content only after API authentication and workspace authorization.
- Retention cleanup is idempotent and workspace-scoped.

## Implementation Tasks

1. Extend the meeting review repository interface with optional transcript search and retention cleanup.
2. Add in-memory repository coverage for search and retention behavior.
3. Add a PostgreSQL meeting review repository using workspace-scoped DB transactions.
4. Wire the API default repository to PostgreSQL when the existing database persistence config selects postgres.
5. Add PostgreSQL integration test coverage for meeting review storage and cleanup. Done for opt-in local execution and CI.
6. Add desktop client/query UI support for transcript search.
7. Update roadmap status after targeted verification.

## Tests and Verification

- `pnpm --filter @dokeza/api test`
- `pnpm --filter @dokeza/desktop test`
- `pnpm --filter @dokeza/api typecheck`
- `pnpm --filter @dokeza/desktop typecheck`
- Local PostgreSQL: `DOKEZA_PG_INTEGRATION=1 pnpm --filter @dokeza/api test -- meeting-review-postgres.integration.test.ts`
- CI PostgreSQL: `.github/workflows/ci.yml` runs the API meeting-review integration suite against `pgvector/pgvector:pg17` after applying SQL migrations.
- Final gate: `pnpm check`

## Documentation Updates

- Update `docs/development/plans/2026-06-25-production-vertical-roadmap.md` with the new M1B status.
- Update `docs/development/local_environment.md` and `docs/devops/ci_cd_release.md` with the PostgreSQL integration path.
- No realtime protocol update is expected.
- No new external data flow is expected.

## Rollback or Degraded Behavior

- API remains injectable and can fall back to the in-memory repository in local/test configuration.
- If PostgreSQL repository initialization or queries fail, API returns `service_unavailable` without transcript content in the error body.
- Retention cleanup can be rerun safely.

## Open Questions

- User-vs-admin delete policy remains a later governance slice because the workspace policy model does not yet encode per-role deletion rules.
- Audit logging for meeting deletion remains a later enterprise governance slice.
