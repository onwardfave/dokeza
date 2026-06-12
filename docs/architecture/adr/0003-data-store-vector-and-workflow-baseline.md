# ADR 0003: Data Store, Vector, and Workflow Baseline

## Status

Accepted for initial implementation.

## Context

Dokeza needs relational storage, vector retrieval, object storage, and background workflow execution. Early implementation should minimize operational surface area while preserving a clean path to dedicated infrastructure when scale, compliance, or workflow complexity requires it.

Workspace isolation is a hard requirement across relational rows, vector results, object storage, credentials, telemetry, and prompts.

## Decision

Use managed PostgreSQL as the primary database.

Use pgvector in the primary PostgreSQL environment for the initial vector store. Embedding rows must include `workspace_id`, `document_id`, and permission metadata, and all retrieval must go through the knowledge or retrieval service.

Use a PostgreSQL-backed job queue for early workflow execution, such as `pg-boss`, for Milestones 1-4. Reassess Temporal or a managed workflow engine when workflows require long-running state machines, cross-service compensation, high-volume scheduling, or stronger operational visibility than the PostgreSQL-backed queue provides.

Use S3-compatible object storage for source documents, generated artifacts, and any raw audio explicitly enabled by policy.

## Rationale

PostgreSQL plus pgvector keeps local development, backups, migrations, and tenant isolation simpler during early implementation. It also keeps vector access close to relational document permissions, which reduces the risk of retrieval paths bypassing workspace checks.

A PostgreSQL-backed job queue avoids adding Redis, Temporal, or a cloud-specific queue before post-call workflows and integration writeback prove they need that complexity.

## Consequences

- Migrations must include workspace-scoped RLS policies for high-risk tenant tables before non-synthetic data is stored.
- Retrieval tests must cover cross-workspace and unauthorized-document attempts.
- Queue jobs must include idempotency keys for externally visible side effects.
- Moving to Qdrant, another vector database, Temporal, or a managed workflow engine requires a follow-up ADR and migration plan.
