# Live AI Suggestions Implementation Plan

## Goal

Implement the first production-oriented M2 live suggestions vertical: a user can request a live suggestion from the desktop, the realtime service assembles recent transcript context, routes the request through the AI orchestrator boundary, streams suggestion tokens back over the realtime protocol, and the desktop displays the result.

## Requirements and Milestone

- Milestone: M2 - Live AI Suggestions.
- Product vertical: core realtime meeting copilot.
- Requirement IDs:
  - FR-160: route tasks to specialized prompt templates or model calls.
  - FR-161: support live answer generation for detected or requested questions.
  - FR-163: support follow-up question suggestions.
  - FR-165: stream live generation results to the desktop client.
  - FR-166: validate generated responses for format, length, and source availability.
  - FR-167: prefer short, speakable responses for live suggestions.
  - FR-169 / NFR-112: debounce/rate-limit automatic LLM calls; this slice only implements manual requests.
  - NFR-001 / PERF-001: preserve the live suggestion latency measurement path.
  - NFR-040 to NFR-049: keep workspace isolation and data-flow discipline.
  - NFR-100 to NFR-104: keep orchestration modular and telemetry metadata-only.

## Affected Architecture

- `services/ai-orchestrator`: prompt registry, context assembler, provider gateway, response validation, metadata telemetry.
- `services/realtime`: handles `suggestion.request`, stores bounded in-memory transcript context, streams `suggestion.stream_token` and `suggestion.complete`.
- `apps/desktop`: can send manual suggestion requests and render streaming/completed suggestions in the live session panel.
- `packages/contracts`: existing realtime suggestion schemas are reused without a protocol version change.

## Contracts and Data Model

- Reuses existing realtime messages:
  - `suggestion.request`
  - `suggestion.stream_token`
  - `suggestion.complete`
  - `error`
- No database schema change in this slice.
- Suggestion content remains transient in realtime memory and desktop UI only. Durable suggestion persistence is a later governed slice.
- Sources are emitted as an empty list until M3 source grounding is implemented.

## Security and Privacy

- Governed content classes: transcript segments, prompt context, generated suggestions, telemetry.
- Workspace isolation: request routing uses the authenticated realtime session workspace; clients cannot provide arbitrary workspace IDs in suggestion requests.
- Provider boundary: the OpenAI path is behind an internal adapter interface with server-side credentials only. Default local/test execution uses a deterministic fake provider and makes no external calls.
- Production OpenAI routing is wired through typed config: `DOKEZA_LLM_PROVIDER=openai`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`, and `OPENAI_TIMEOUT_MS`. Production fails closed if OpenAI is selected without credentials.
- Realtime advertises `cloud_llm_allowed` and blocks external live suggestion calls before provider submission when workspace policy disables cloud LLM.
- Telemetry is metadata-only: workspace ID, session ID, request kind, prompt version, provider/model route, latency, token counts, and failure category. It must not include transcript, prompt, generated suggestion, token text, document text, or raw audio.
- `live_only` and `local_only` retention modes do not persist suggestions in this slice.
- New external data-flow documentation covers Dokeza Cloud to OpenAI LLM provider for prompt/transcript excerpts when enabled by production configuration and policy.

## Implementation Tasks

1. Add prompt registry and live suggestion prompt selection in `@dokeza/ai-orchestrator`.
2. Add rolling transcript context assembly with a bounded window and prompt-size guard.
3. Add model gateway/provider interface with deterministic fake streaming implementation and OpenAI-compatible adapter boundary.
4. Wire production OpenAI live suggestion config into realtime startup while keeping local/test deterministic.
5. Wire `suggestion.request` in realtime to stream tokens and completion messages.
6. Add desktop protocol helpers, session-client state, and UI controls for manual suggestion requests.

## Tests and Verification

- AI orchestrator unit tests:
  - prompt version is selected per suggestion kind,
  - transcript context is bounded and ordered,
  - fake provider streams tokens and completion metadata without external calls,
  - telemetry events exclude restricted content,
  - provider failure maps to a recoverable suggestion failure.
- Realtime component tests:
  - `suggestion.request` emits `suggestion.stream_token` and `suggestion.complete`,
  - request uses authenticated workspace/session context,
  - provider failure emits recoverable `llm_provider_timeout`,
  - cloud provider submission is blocked when workspace policy disables cloud LLM,
  - no transcript text appears in telemetry/error payloads.
- Desktop tests:
  - client creates valid `suggestion.request`,
  - streamed tokens accumulate into a suggestion,
  - completed suggestion records prompt version/model/confidence,
  - UI/manual request state is exposed without storing content in local storage.
- Final verification:
  - targeted package tests while iterating,
  - `pnpm generate:schemas` if contracts change,
  - `pnpm check` before completion.

## Documentation Updates

- `docs/architecture/realtime_protocol.md`: mark `suggestion.request` as implemented for M2 and document `llm_provider_timeout`.
- `docs/architecture/failure_modes.md`: confirm LLM provider failure maps to recoverable suggestions-unavailable behavior.
- `docs/security/data_flows.md`: document Dokeza Cloud to OpenAI LLM prompt/suggestion flow when enabled.
- `docs/development/plans/2026-06-25-production-vertical-roadmap.md`: update M2 status after implementation.

## Rollback or Degraded Behavior

- If AI orchestration is unavailable, realtime returns a recoverable `llm_provider_timeout` or `feature_unavailable` error and keeps the live session active.
- If streaming fails after partial tokens, the desktop keeps the partial draft visible with degraded/error status.
- If provider configuration is unavailable, production fails closed for external provider use while local/test can use the fake provider.

## Open Questions

- Durable suggestion persistence and deletion/export behavior are intentionally deferred to a later governed slice.
- Source-grounded suggestions and retrieval are deferred to M3.
- Automatic suggestions and debounce enforcement are deferred until manual suggestions prove the live path.
