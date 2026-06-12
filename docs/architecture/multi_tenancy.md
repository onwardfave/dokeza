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

## 4. Relational Data Isolation

Baseline:

- PostgreSQL with `workspace_id` on every tenant-owned table.
- Application authorization middleware required on every request.
- PostgreSQL row-level security should be enabled for high-risk tables.
- All queries must be scoped by workspace through repository-level APIs.

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

Preferred options, in order:

1. Separate collection or namespace per workspace.
2. Shared collection with mandatory `workspace_id` and document permission filters enforced by the retrieval service.

For early implementation, a shared vector index is acceptable only if:

- The retrieval service is the only code path allowed to query it.
- Every query includes a workspace filter.
- Every result is revalidated against document permissions before prompt assembly.
- Automated tests cover cross-workspace retrieval attempts.

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

- User from workspace A cannot fetch workspace B meeting.
- User from workspace A cannot retrieve workspace B document chunks.
- User without document permission cannot retrieve restricted document chunks.
- Integration credential for workspace A cannot be used for workspace B.
- Signed object URLs cannot be generated without workspace authorization.
- Admin role boundaries are enforced.

