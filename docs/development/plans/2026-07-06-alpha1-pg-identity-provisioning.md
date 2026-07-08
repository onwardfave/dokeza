# Alpha.1 PostgreSQL Identity Provisioning Plan

## Goal

Add durable PostgreSQL-backed hosted identity resolution for the API provider-token exchange path, replacing the local/test in-memory identity repository when PostgreSQL persistence is configured.

## Requirements and Milestone

- Alpha.1 production auth and onboarding.
- FR-020, FR-260, NFR-042, NFR-047, NFR-103.
- Milestone 1 account onboarding and workspace selection foundation.

## Affected Architecture

- `services/api`: provider-token exchange resolves Dokeza-owned users and memberships from durable storage.
- `packages/db`: schema gains hosted provider identity mapping.
- `infra/db`: migration adds the provider identity table.

## Contracts and Data Model

- No REST contract change.
- Add `user_provider_identities` table keyed by provider issuer and provider subject, linked to `users`.
- Existing `users`, `workspaces`, and `workspace_memberships` remain authoritative for Dokeza membership.

## Security and Privacy

- Provider tokens remain accepted only at `/v1/auth/provider/exchange`.
- Provider subject and issuer are identity metadata, not meeting content.
- Workspace authorization remains enforced through memberships in Dokeza-owned tables.
- No raw token, transcript, prompt, document, suggestion, or audio content is logged.

## Implementation Tasks

1. Add SQL migration and Drizzle schema for hosted provider identities.
2. Implement `PgIdentityRepository` with:
   - lookup by provider issuer and subject,
   - user creation/update,
   - default first workspace provisioning when no identity exists,
   - membership loading from `workspace_memberships`.
3. Wire API default identity repository from config: memory for in-memory persistence, PostgreSQL for PostgreSQL persistence.
4. Add unit and PostgreSQL integration tests.
5. Update progress and architecture docs.

## Tests and Verification

- `pnpm --filter @dokeza/api test -- identity-repository`
- `pnpm --filter @dokeza/api test`
- Optional PostgreSQL integration with `DOKEZA_PG_INTEGRATION=1`.
- Final gate: `pnpm check`.

## Documentation Updates

- `docs/architecture/authentication.md`
- `docs/architecture/multi_tenancy.md`
- `docs/development/progress.md`

## Rollback or Degraded Behavior

If PostgreSQL identity resolution fails, provider exchange fails closed with sanitized auth failure. Local/test memory identity remains available only for memory persistence and injected tests.

## Open Questions

- Hosted IdP vendor remains unselected.
- Desktop redirect/SDK strategy remains open.
