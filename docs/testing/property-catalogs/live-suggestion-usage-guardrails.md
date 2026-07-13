# Live Suggestion Usage Guardrails Property Catalog

## System Under Test

The boundary spans AI-orchestrator context assembly/provider adapters, realtime session admission, the usage ledger, configuration, and PostgreSQL `usage_events` storage.

## State and Concurrency Model

- Admission is scoped to the authenticated workspace and session.
- At most one live-suggestion request may be in flight per session.
- The durable key is workspace/session/request/feature; replaying the same request updates rather than double-counts.
- Priced admission reads the committed session total and reserves one worst-case bounded request.
- PostgreSQL reads and writes run under a workspace-scoped transaction with forced RLS.

## Properties

- Transcript, source, user-instruction, total-input, and output limits are positive and independently enforced.
- Input that remains over the total limit after component truncation is rejected before provider submission.
- Provider output parameters and locally accepted streaming output share the configured output ceiling.
- Only source chunks admitted to bounded source context can be cited.
- A second concurrent request cannot pass cost or request admission while one is in flight.
- A completed, provider-error, or token-budget-rejected attempt produces at most one usage row.
- A priced request cannot start when current session cost plus its worst-case cost exceeds the hard limit.
- Missing reviewed prices produce `unpriced` rows and do not pretend to enforce a monetary threshold.
- Usage-ledger read/write failure blocks further provider work for the session but does not stop capture or transcript delivery.
- Usage rows and telemetry contain no transcript, prompt, source, suggestion, raw audio, credential, or provider response body.
- Unscoped or cross-workspace restricted-role access cannot observe or create usage rows.
- Meeting/workspace deletion removes dependent usage rows.

## Minimal Test Topology

- AI-orchestrator component tests use deterministic/fake transports and assert provider inputs.
- Realtime WebSocket tests inject in-memory or failing ledgers and stub providers.
- PostgreSQL integration runs migrations and uses `dokeza_app` for repository and adversarial raw queries.

## Workloads and Faults

- Boundary values for every component and total budget.
- Multi-byte UTF-8 input near each limit.
- Provider stream that exceeds output budget.
- Immediate concurrent requests for the same session.
- Idempotent replay of a completed request ID.
- Ledger failure before admission and after provider completion.
- Session just below the hard limit with a worst-case request that crosses it.
- Matching request IDs in different workspaces.

## Observability Needed

Metadata-only events include workspace/session/request IDs, feature, provider, model, prompt version, component token estimates, source count, status, price status, and optional estimated micro-USD. Operational alerts should distinguish budget rejection, provider failure, and accounting outage without content.

## Open Risks

- STT, embedding, and retrieval routes do not yet write the shared durable ledger.
- Provider-specific tokenizer reconciliation is not implemented; UTF-8 byte estimates intentionally favor safety over utilization.
- Reviewed production provider/model prices and a warning surface remain manual prerequisites.
- Distributed multi-instance admission will require a transactional reservation or quota service; the current single-in-flight guard is process-local.
