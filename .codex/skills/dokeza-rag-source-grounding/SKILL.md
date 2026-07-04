---
name: dokeza-rag-source-grounding
description: Plan, implement, or review Dokeza source-grounded retrieval and RAG behavior. Use when work touches embeddings, hybrid or keyword retrieval, source injection into prompts, live suggestion citations, retrieval evals, document/chunk authorization, prompt-injection handling for retrieved sources, or source-grounded answer quality.
---

# Dokeza RAG Source Grounding

## Overview

Use this skill to keep retrieval quality, authorization, prompt safety, and citation behavior coupled in the same slice. It complements `dokeza-provider-integration` and `dokeza-data-governance`; use those too when a provider call, storage policy, deletion, export, retention, or telemetry behavior changes.

## Workflow

Announce: "I'm using the Dokeza RAG source-grounding skill."

1. Read the active roadmap or slice plan, plus:
   - `docs/srs/traceability_matrix.md`
   - `docs/srs/realtime_meeting_copilot_srs.md`
   - `docs/architecture/code_architecture.md`
   - `docs/architecture/multi_tenancy.md`
   - `docs/security/data_flows.md`
   - `docs/security/threat_model.md`
   - `docs/testing/testing_strategy.md`
   - `docs/testing/property-catalogs/knowledge-retrieval.md`
2. Identify the requirement IDs, usually FR-120 to FR-127, FR-140 to FR-146, FR-160 to FR-169, FR-180 to FR-186, and NFR-110 to NFR-113.
3. Identify the retrieval path:
   - Deterministic keyword retrieval.
   - Vector retrieval through pgvector.
   - Hybrid retrieval.
   - Reranking.
   - Source injection into live suggestions.
4. Identify every trust boundary:
   - API workspace authorization.
   - Repository workspace filters and RLS.
   - Document-level permission tags or policy evaluation.
   - Provider submission of document chunks, transcript excerpts, or prompt context.
   - Desktop display of source citations.
5. Define the source contract before coding:
   - What fields identify a source.
   - Whether chunk text is sent to the model, returned to clients, or both.
   - Whether scores are internal-only or API-visible.
   - What happens when no authorized source is available.
6. Define eval and test coverage before implementation.
7. Update docs in the same slice when contracts, provider data flows, failure behavior, retention behavior, or source display behavior changes.

## Required Tests

- Unit tests for query construction, scoring, prompt assembly, and source formatting.
- Contract tests and generated JSON Schema updates for any REST or realtime payload changes.
- Workspace isolation tests proving retrieval cannot return another workspace's chunks.
- Document-permission tests for `allowedDocumentIds`, permission tags, or policy checks.
- Prompt-injection tests proving retrieved source text is treated as untrusted content.
- No-source tests proving the assistant avoids unsupported factual claims.
- Provider tests with fake transports only; default CI must not call live embedding, reranking, or LLM providers.
- Telemetry redaction tests when logging or metrics are touched.

## Guardrails

- Do not let the desktop or client submit arbitrary chunks for model context. Resolve source IDs server-side.
- Do not bypass `workspace_id` predicates, RLS-scoped transactions, or authorization middleware for vector searches.
- Do not send document chunks, transcript excerpts, prompts, or generated suggestions to a provider unless workspace policy allows that processing path.
- Keep retrieved source text delimited and labeled as untrusted source material in prompts.
- Do not cite a document unless that exact source was authorized and included in the retrieval/prompt path.
- Do not store embeddings when the source document is blocked by `live_only` or `local_only` policy.
- Delete or make inaccessible derived embeddings when source documents are deleted or disabled.
- Keep telemetry metadata-only by default. Never emit query text, chunk text, prompt text, transcript text, or suggestion content in logs or traces.

## Documentation Gates

- Update `docs/security/data_flows.md` when embedding, reranking, or LLM source-context provider flows become active or materially change.
- Update `docs/architecture/realtime_protocol.md` when `suggestion.*` payloads change.
- Update `docs/architecture/failure_modes.md` when retrieval fallback, no-source behavior, provider timeout, or rate-limit behavior changes.
- Update `docs/testing/property-catalogs/knowledge-retrieval.md` when new retrieval properties, source citation guarantees, or fault cases are added.
- Update the roadmap and active slice plan with honest status: keyword-only, vector-enabled, hybrid, reranked, source-grounded, or eval-backed.
