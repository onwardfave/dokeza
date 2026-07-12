# Realtime Workspace Policy Property Catalog

## System Under Test

Realtime authentication through workspace-policy resolution, `auth.accepted`, external STT/LLM submission gates, and transcript/gap/suggestion persistence.

## State and Concurrency Model

- A realtime token identifies a user and selected workspace but is not the authority for mutable workspace policy.
- Policy is resolved after token/device validation and before the connection is authenticated.
- Each accepted connection holds one resolved policy snapshot for provider and persistence decisions.
- A resumed connection resolves policy again before it can reattach.

## Properties

- Policy lookup failure never defaults to cloud provider submission or cloud persistence.
- `auth.accepted.policy` exactly reflects the resolved server-side policy.
- `cloud_stt_allowed=false` prevents opening or sending audio to every external STT provider.
- `cloud_llm_allowed=false` prevents transcript, prompt, and source submission to every external LLM route, including OpenAI-compatible chat endpoints.
- `live_only` and `local_only` prevent transcript, gap, and suggestion cloud persistence even when process defaults allow retention.
- One workspace's policy cannot govern another workspace's connection.
- Policy errors and telemetry never include transcript, prompt, document, suggestion, audio, credential, or policy payload content.

## Minimal Test Topology

- In-process realtime WebSocket server with injected token validator, policy resolver, provider adapters, and recording sinks.
- PostgreSQL integration topology with migrations, two workspaces, and workspace-scoped policy rows.

## Workloads

- Authenticate with a fully disabled/no-storage policy and inspect `auth.accepted`.
- Send audio with cloud STT disabled and assert the provider adapter is untouched.
- Request a suggestion with cloud LLM disabled and assert the model gateway is untouched.
- Deliver transcript/gap/suggestion events under a no-storage policy and assert no sink write.
- Resolve distinct policies for two workspaces.

## Faults to Inject

- Database unavailable during policy lookup.
- Invalid retention value.
- Multiple policy rows for one workspace.
- External provider configured through an alternate OpenAI-compatible base URL.
- Policy changes between initial connection and resume.

## Observability Needed

- Metadata-only policy resolution success/failure counts.
- Provider calls blocked by policy, keyed by workspace ID, provider route, and feature.
- Persistence decisions keyed by workspace/session, record kind, and retention mode.

## Open Risks

- Policy changes do not yet terminate or reconfigure an already accepted connection; resume resolves a fresh snapshot.
- The schema still needs a unique workspace-policy invariant and restricted application-role RLS verification.
- A separate cloud-embedding permission should be considered instead of inferring it from retention/provider defaults.
