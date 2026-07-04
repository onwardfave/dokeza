# Next Slices Roadmap Review

## Goal

Review the proposed next implementation slices at `C:\Users\SAM\.gemini\antigravity-ide\brain\3f1fb366-bf03-4538-8e24-1489dc9be13f\next_slices.md` against the current repository state, requirements, architecture, security, testing docs, and project workflow.

## Current Repo Baseline

- Branch: `main`.
- Baseline commit reviewed: `5968ee4`.
- Worktree before this review was clean.
- The proposed plan is directionally aligned with the roadmap: the main product bottleneck is the M2/M3 value loop from uploaded knowledge to grounded live suggestions to durable meeting review.

## Findings

### 1. Adjust the Critical Path

Recommended critical path:

1. `M2.RetrievalBridge` - wire the existing keyword retrieval path into live suggestions with source prompt assembly and citation display.
2. `M3.Embeddings` - add provider-backed embedding generation plus pgvector similarity search and indexing.
3. `M2.Persistence` - persist complete suggestions, citations, prompt metadata, and replay/order metadata into meeting review.
4. `M2.Guardrails` - enforce debounce/rate/cost limits before broader demos.

Reason: keyword retrieval already exists with source metadata and scores. Proving the source-grounding contract first reduces risk before adding semantic retrieval complexity. Embeddings still matter, but they should improve retrieval quality after the prompt/citation/security path is proven.

### 2. Correct Stale Scope Details

- `suggestion.complete` already has a `sources` array in the realtime contract. Source grounding should avoid protocol churn unless richer citation metadata is required.
- Knowledge search already returns `score`; adding a score field is not a new contract requirement unless the scoring semantics change.
- `document_chunks.embedding vector(1536)` already exists in the baseline SQL migration. The embeddings slice should add an adapter, generation workflow, query support, and vector index migration rather than treating the vector column as absent.
- The `suggestions` table already exists. Durable suggestion storage needs repository/sink wiring, retention gates, source association, and sequence/replay metadata, not a brand-new suggestion table.
- Meeting detail responses do not yet include suggestions, so `M2.Persistence` still requires a REST contract and desktop review update.

### 3. Add an Explicit Source-Grounding Slice

Add a slice before or alongside embeddings:

Scope:

- Add a server-side retrieval dependency to the realtime suggestion path.
- Query the current knowledge repository using recent transcript plus optional user prompt.
- Pass retrieved chunks to the AI orchestrator as delimited, untrusted source material.
- Return citations using already-existing `suggestion.complete.payload.sources`.
- Render citations in the desktop live suggestions panel.
- Fall back to transcript-only or explicit no-source behavior according to failure-mode docs.

Acceptance:

- A manual suggestion can cite an authorized uploaded text document using the current keyword search path.
- Cross-workspace or disallowed documents cannot be retrieved or cited.
- Prompt-injection text inside retrieved chunks cannot override system policy.

### 4. Tighten Embeddings Scope

Embeddings should include:

- `@dokeza/config` provider settings for embedding model, base URL, timeout, and production credential requirements.
- `services/knowledge` embedding adapter interface with fake test transport and OpenAI implementation behind provider integration guardrails.
- Policy gate before provider submission and before embedding persistence.
- pgvector similarity query through the knowledge service only.
- Migration for vector index and any missing operational indexes.
- Data-flow doc update because the current docs still describe embedding provider flow as not active for the M3 foundation slice.
- Failure-mode doc update for embedding provider timeout, partial indexing, retry/idempotency, and degraded keyword-only fallback.

### 5. Tighten Persistence Scope

Durable suggestions should include:

- Retention gate for `live_only` and `local_only` before writing suggestion content.
- `server_seq` or equivalent ordering metadata if suggestions need replay parity with transcripts.
- Source citation persistence, either as normalized rows or a structured metadata column, with workspace-scoped deletion.
- Meeting detail/export contract updates.
- Desktop review display.
- Audit and export implications documented before claiming M1B/M2 meeting review completeness.

### 6. Pull Guardrails Earlier

The proposed plan puts cost controls in Tier 2. Move minimal guardrails into Tier 1 before any broad demo:

- Manual request debounce.
- Per-session request cap.
- Metadata-only token/cost usage events.
- Provider failure/rate-limit mapping.

This is not just commercial polish. It is required by FR-169 and NFR-110 to NFR-113, and it protects demos from runaway provider calls.

### 7. Keep Native Streaming Parallel, Not on the M2/M3 Critical Path

Long-lived native microphone streaming remains important for M1 production quality, but it should run in parallel after the source-grounded value loop begins. The current bounded-window approach is sufficient for proving grounded suggestions, while the native stream is a reliability/hardening slice with Rust-specific verification.

### 8. Documentation and Skill Additions

Added project skill:

- `.codex/skills/dokeza-rag-source-grounding/SKILL.md`

Use it with:

- `dokeza-provider-integration` for embedding, reranking, or LLM provider changes.
- `dokeza-data-governance` for suggestion, document, chunk, embedding, export, deletion, retention, or telemetry persistence changes.
- `dokeza-reliability-testing` for retrieval isolation, source authorization, provider fault, and prompt-injection properties.

## Recommended Updated Slice Order

1. `M2.RetrievalBridge`
2. `M3.Embeddings`
3. `M2.Persistence`
4. `M2.Guardrails`
5. `M1B.Hardening`
6. `M1.NativeStreaming`

`M2.Guardrails` can be done before `M2.Persistence` if provider spend or demo stability becomes the immediate bottleneck.

## Open Questions Before Implementation

- Should source citations persist as separate rows, JSON metadata, or both?
- What exact source fields should desktop show: title only, title plus source, or title plus chunk excerpt?
- Should the first retrieval bridge use transcript-only query synthesis, user-prompt-only query synthesis, or a deterministic combination?
- What workspace policy flag controls embedding provider submission separately from LLM provider submission?
- Should vector search return raw similarity distance, normalized score, or keep vector scores internal for now?
