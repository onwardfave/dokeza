# ADR 0005: Initial Provider and Retention Defaults

## Status

Accepted for initial implementation.

## Context

The SRS and delivery plan require provider choices and retention defaults before implementation can begin without repeated architecture churn. The system still needs provider abstraction, but Milestone 1 and Milestone 2 need concrete defaults for STT, LLM generation, embeddings, and sensitive-content retention.

## Decision

Use Deepgram as the first cloud STT provider for beta implementation, routed through the Dokeza realtime service and internal STT adapter.

Use OpenAI as the first hosted LLM provider for live suggestions, post-call generation, and initial embeddings through the model gateway. Model identifiers must remain environment/config values, not hard-coded domain assumptions.

Keep provider adapters for STT, LLM, and embeddings mandatory. AssemblyAI, Anthropic, Google, local STT, and local LLM paths remain future or policy-driven alternatives, not first-slice implementation requirements.

Use these initial retention defaults:

- Raw audio is transient by default and is not stored in Dokeza Cloud after STT processing unless explicitly enabled by workspace policy.
- Individual workspaces default to 7-day cloud retention for transcripts, suggestions, and post-call artifacts.
- Team and business workspaces default to 30-day cloud retention.
- Enterprise workspaces default to 30-day cloud retention until contract or admin policy sets a different period.
- Indefinite retention requires explicit workspace admin configuration and is never the default.

## Rationale

Deepgram is already identified in the Dokeza architecture as a candidate STT provider, and its public documentation supports real-time streaming STT use cases.

OpenAI gives the initial implementation one hosted provider surface for generation, streaming, structured outputs, and embeddings while the model gateway and evaluation harness mature.

Short default retention periods reduce privacy risk during early product validation while preserving enough session history for users to review transcripts, suggestions, and post-call artifacts.

## Consequences

- Provider credentials must remain server-side and workspace policy must be checked before provider calls.
- Provider-specific request and response shapes must be hidden behind internal adapters.
- AI evals must record provider and model identifiers for every scored output.
- Retention jobs must cover transcripts, suggestions, post-call artifacts, raw audio if stored, and derived embeddings where source data is deleted.
- Changing default providers or retention defaults requires a follow-up ADR and updates to data-flow documentation.

## References

- Deepgram STT documentation: `https://developers.deepgram.com/docs/stt/getting-started`
- OpenAI text generation documentation: `https://developers.openai.com/api/docs/guides/text`
- OpenAI streaming response documentation: `https://developers.openai.com/api/docs/guides/streaming-responses`
