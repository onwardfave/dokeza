# Dokeza Multi-Tenancy and Workspace Isolation

## 1. Purpose

This document defines how Dokeza isolates customer workspaces across relational data, vector data, object storage, credentials, prompts, telemetry, and integrations.

## 2. Isolation Principles

- Every customer-owned resource must belong to a workspace.
- Every request must be authorized against workspace membership and role.
- Retrieval must never return content outside the user's authorized workspace and document permissions.
- Integration credentials must be isolated from application data.
- Cross-workspace operations must be impossible by default and explicit when required for internal operations.

## 3. Workspace Identity

Every resource that contains customer data shall include:

- `workspace_id`
- `created_by`
- `created_at`
- `updated_at`

For user-private data, resources shall also include `owner_user_id`.

Hosted identity metadata is stored separately from customer-owned workspace resources. `user_provider_identities` maps a configured provider issuer and provider subject to a Dokeza `users.id`; it does not contain tokens or meeting content and does not grant workspace access by itself. Workspace access remains authoritative in `workspace_memberships`.

Workspace admins and owners manage durable memberships through `/v1/workspaces/{workspace_id}/memberships`. These routes require an authenticated Dokeza API token and an `admin` or `owner` role in the target workspace before repository access. Upserts create or update Dokeza-owned user rows and membership rows; deletes remove only the workspace membership row. Provider claims do not bypass these role checks.

Meeting deletion revalidates durable membership inside the workspace-scoped database transaction. Owners and admins may delete any workspace meeting; members may delete only a meeting whose `created_by` matches their Dokeza user ID. A successful manual deletion cascades dependent meeting content and writes a metadata-only audit record atomically.

## 4. Relational Data Isolation

Baseline:

- PostgreSQL with `workspace_id` on every tenant-owned table.
- Application authorization middleware required on every request.
- PostgreSQL row-level security is enabled and forced on high-risk tenant tables.
- API, realtime, and knowledge services connect as the restricted `dokeza_app` role. The migration/owner connection string must not be used by a running service.
- All queries must be scoped by workspace through repository-level APIs.
- Repository methods set `app.current_workspace_id` with `SET LOCAL` inside a transaction. An unscoped application-role query sees no tenant rows and cannot insert tenant rows.
- RLS policy bypass is allowed only for documented internal maintenance jobs that run under a distinct `BYPASSRLS` operations role and emit audit events where customer data may be affected. `dokeza_app` must never receive `BYPASSRLS`, ownership, or superuser privileges.

High-risk tables:

- `meeting_sessions`
- `transcript_segments`
- `suggestions`
- `documents`
- `document_chunks`
- `integration_connections`
- `audit_logs`
- `workspace_policies`

## 5. Vector Store Isolation

Initial implementation:

- Use pgvector in PostgreSQL with shared embedding tables.
- Store `workspace_id`, `document_id`, and document permission metadata alongside each embedding row.
- Apply RLS to tenant-owned vector tables where PostgreSQL owns the vector data.
- Permit vector queries only through the knowledge or retrieval service.

Future options, in order:

1. Separate collection or namespace per workspace.
2. Shared collection with mandatory `workspace_id` and document permission filters enforced by the retrieval service.

For early implementation, a shared vector index is acceptable only if:

- The retrieval service is the only code path allowed to query it.
- Every query includes a workspace filter.
- Every result is revalidated against document permissions before prompt assembly.
- Automated tests cover cross-workspace retrieval attempts.

Production-alpha permission-tag semantics are fail closed:

- Untagged chunks are visible to authorized workspace members.
- Workspace owners/admins and the document creator may access restricted chunks.
- Other callers require an exact trusted effective-tag match. The API derives `role:<role>` and `user:<dokeza_user_id>`; arbitrary provider claims are not trusted as document groups.
- Documents with no accessible chunks are omitted from list responses, return not-found for detail, and contribute no keyword/vector search results. Accessible chunk counts never include hidden chunks.
- Business-group tags such as `sales` remain inaccessible through the public API until a Dokeza-owned group/directory mapping is implemented; server-side callers may provide trusted evaluated tags.

## 6. Object Storage Isolation

Object storage keys must include workspace namespace:

```text
workspaces/{workspace_id}/documents/{document_id}/source
workspaces/{workspace_id}/meetings/{meeting_id}/artifacts/{artifact_id}
```

Storage access must be mediated by backend services. Clients should receive short-lived signed URLs only after authorization.

## 7. Credential Isolation

Integration credentials must be stored in a secrets manager or encrypted credential store, not as plaintext in the primary database.

Credential records must include:

- `workspace_id`
- `provider`
- `scopes`
- `created_by`
- `rotated_at`
- `status`

Only integration services may request decrypted credentials.

## 8. Prompt and Context Isolation

Prompt assembly must enforce:

- Workspace membership.
- Role permissions.
- Document permissions.
- Workspace policy constraints.
- Model-provider policy constraints.

The AI orchestrator must not accept arbitrary document chunks from the client. It should only accept source IDs or retrieval requests that are resolved server-side.

Realtime provider and retention policy is resolved server-side after token validation and before `auth.accepted`. The realtime token does not carry mutable workspace policy as authority. PostgreSQL-backed resolution runs in a workspace-scoped transaction, rejects ambiguous or invalid policy state, and supplies the retention mode used for transcript, gap, and suggestion persistence for that connection.

Live-suggestion usage is stored in `usage_events` with explicit workspace and meeting-session ownership. Reads and idempotent writes run through `withWorkspaceTransaction`; forced RLS applies to the restricted `dokeza_app` role, and an unscoped connection cannot read or insert rows. The unique workspace/session/request/feature key prevents retries from double-counting. Meeting or workspace deletion cascades to usage metadata.

## 9. Telemetry Isolation

Telemetry should avoid raw customer content by default.

Allowed default telemetry:

- Latency metrics.
- Error codes.
- Model names.
- Token counts.
- Feature usage events.
- Provider status.

Restricted telemetry:

- Transcript text.
- Prompt text.
- Document text.
- Generated suggestion content.

Restricted telemetry requires explicit debug mode, customer approval, or internal policy exception.

## 10. Internal Access Controls

Internal staff access to customer data must be:

- Denied by default.
- Granted through time-bound access where necessary.
- Audited.
- Visible in customer-facing audit logs where contractually required.

## 11. Verification

Required tests:

- An unscoped `dokeza_app` connection cannot read or insert tenant rows.
- A deliberately workspace-unfiltered query inside a workspace-A transaction cannot see workspace-B rows.
- An unscoped restricted-role connection cannot read or insert usage events, and a workspace-A cost total cannot include workspace-B rows.
- User from workspace A cannot fetch workspace B meeting.
- User from workspace A cannot retrieve workspace B document chunks.
- User without document permission cannot retrieve restricted document chunks.
- Integration credential for workspace A cannot be used for workspace B.
- Signed object URLs cannot be generated without workspace authorization.
- Admin role boundaries are enforced.
- Workspace members without admin/owner role cannot list or mutate memberships.
