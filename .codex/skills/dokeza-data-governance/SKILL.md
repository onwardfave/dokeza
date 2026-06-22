---
name: dokeza-data-governance
description: Implement Dokeza retention, deletion, export, no-storage, and sensitive-content persistence changes safely. Use when changing transcript, suggestion, artifact, embedding, local cache, telemetry, audit, or workspace policy behavior that controls whether customer content is stored, retained, deleted, or exposed.
---

# Dokeza Data Governance

## Workflow

Announce: "I'm using the Dokeza data-governance skill."

1. Read the relevant policy and architecture docs:
   - `docs/security/data_flows.md`
   - `docs/security/threat_model.md`
   - `docs/architecture/multi_tenancy.md`
   - `docs/architecture/failure_modes.md`
   - `docs/testing/testing_strategy.md`
   - Any affected protocol, database, or service-specific docs.
2. Identify the governed content classes:
   - Raw audio.
   - Transcript segments and gaps.
   - Suggestions and prompts.
   - Post-call artifacts.
   - Documents, chunks, embeddings, and derived indexes.
   - Local cache, telemetry, audit records, and exports.
3. Identify the workspace policy input before designing storage behavior.
4. Enforce policy before persistence, provider submission, indexing, export, or telemetry emission.
5. Keep workspace isolation explicit on every customer-owned record and query.
6. Update docs when a retention rule, deletion rule, data flow, or failure behavior changes.

## Guardrails

- Treat `live_only` and no-storage policies as a hard block on cloud content persistence.
- Treat `local_only` as a hard block on cloud content persistence unless a later policy explicitly separates local encrypted storage from cloud sync.
- Do not log raw transcript, prompt, document, audio, suggestion, or artifact content by default.
- Do not send customer content to a third-party provider unless the governing workspace policy allows that provider path.
- Do not persist derived data if the source content is not allowed to be retained.
- Make deletion and retention idempotent; repeated jobs must not resurrect or duplicate records.
- Keep telemetry metadata-only unless a documented debug mode explicitly changes that behavior.
- Prefer deny-by-default behavior when policy is unavailable.

## Tests

For each governed path, add the narrowest useful test for:

- Allowed retention mode persists or processes the expected record.
- `live_only` and `local_only` skip cloud persistence.
- Workspace IDs are required and cannot cross between tenants.
- Delete or retention jobs remove derived artifacts with their source records.
- Failures degrade according to `docs/architecture/failure_modes.md`.
- Logs and telemetry do not contain sensitive content.
