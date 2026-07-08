# M2 Retrieval Bridge Implementation Plan

## Goal

Wire the existing M3 keyword retrieval foundation into manual live suggestions so a suggestion can use authorized source chunks and return citations without changing the realtime contract.

## Requirements and Milestone

- Milestone 2: live AI suggestions.
- Milestone 3: retrieval and source grounding.
- FR-125: source metadata is tracked for retrieved chunks.
- FR-140: retrieve relevant knowledge from live transcript events and manual requests.
- FR-143: include source metadata when source material is used.
- FR-144: exclude unauthorized content.
- FR-146: avoid sending unnecessary sensitive context to external services.
- FR-160, FR-165, FR-166, FR-183, FR-186: prompt routing, streaming suggestions, source validation, manual request flow, and source cues.

## Affected Architecture

- `services/realtime`: add an injected source retriever to the manual `suggestion.request` path.
- `services/knowledge`: provide the retrieval implementation through its existing repository interface.
- `services/ai-orchestrator`: accept retrieved source chunks as server-side inputs, delimit them as untrusted material, and propagate citations.
- `apps/desktop`: retain source metadata from `suggestion.complete` and render citation cues.

## Contracts and Data Model

- Realtime protocol remains backward-compatible. `suggestion.complete.payload.sources` already exists.
- No database migration in this slice.
- No REST contract change in this slice.
- Source chunk text is used only for prompt assembly and is not added to realtime payloads.

## Security and Privacy

- The client cannot provide source chunks.
- Retrieval runs with the authenticated session workspace only.
- The knowledge repository remains responsible for workspace filtering and RLS.
- Retrieved chunks are labeled as untrusted source material before provider submission.
- `include_sources=false` must skip retrieval and provider source context.
- Retrieval failure falls back to transcript-only suggestion behavior without leaking query or chunk text in errors.
- Telemetry must stay metadata-only and exclude transcript, prompt, query, chunk, and suggestion content.

## Implementation Tasks

1. Add source input types and prompt assembly tests in `@dokeza/ai-orchestrator`.
2. Add a realtime `LiveSuggestionSourceRetriever` interface and pass source results into the live suggestion service when requested.
3. Wire configured realtime startup to the existing knowledge persistence from config.
4. Preserve citation sources in the desktop protocol client and render them in the live suggestion cards.
5. Update roadmap, realtime protocol note, data-flow note, failure/property docs, and active review docs.

## Tests and Verification

- `pnpm --filter @dokeza/ai-orchestrator test`
- `pnpm --filter @dokeza/realtime test`
- `pnpm --filter @dokeza/desktop test`
- `pnpm --filter @dokeza/realtime typecheck`
- `pnpm --filter @dokeza/desktop typecheck`
- `pnpm check`

## Documentation Updates

- Update `docs/development/plans/2026-06-25-production-vertical-roadmap.md`.
- Update `docs/architecture/realtime_protocol.md`.
- Update `docs/security/data_flows.md`.
- Update `docs/testing/property-catalogs/knowledge-retrieval.md`.

## Rollback or Degraded Behavior

- If retrieval is unavailable, manual live suggestions remain available with transcript-only context and empty sources.
- If no authorized chunks match, suggestions remain transcript-only with empty sources.
- If cloud LLM is disabled by workspace policy, existing fail-closed behavior still blocks external model calls before prompt submission.

## Open Questions

- The first bridge uses deterministic query synthesis from user prompt plus recent transcript. Embedding-backed query expansion remains for the next slice.
- Source persistence is intentionally deferred to `M2.Persistence`.
