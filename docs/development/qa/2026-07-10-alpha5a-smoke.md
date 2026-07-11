# Alpha.5a Real-Provider Smoke Test — 2026-07-10

Partial run via the automated harness
[`services/realtime/scripts/alpha5a-provider-smoke.ts`](../../../services/realtime/scripts/alpha5a-provider-smoke.ts).
Covers the provider-adapter boundaries only. The Auth0 browser sign-in and
physical-microphone desktop capture were **not** exercised (require a human)
and remain open in [`../../testing/alpha5a-smoke-test-checklist.md`](../../testing/alpha5a-smoke-test-checklist.md).

## Run metadata

| Field                 | Value                                             |
| --------------------- | ------------------------------------------------- |
| Date                  | 2026-07-10                                        |
| Commit SHA under test | 6b69e40 (harness); services at 8d9bb0c            |
| Host OS               | Windows 10 19045 (local, non-hosted)              |
| Deepgram model        | nova-3 (default)                                  |
| OpenAI models         | gpt-4.1-mini (suggestion), text-embedding-3-small |
| Auth                  | dev issuer (Auth0 not exercised)                  |
| Persistence           | memory                                            |

## Result summary

| Boundary                        | Result | Detail (content-free)                                                              |
| ------------------------------- | ------ | --------------------------------------------------------------------------------- |
| Deepgram connectivity/framing   | PASS   | Connected + authed; synthetic PCM accepted; 0 transcript events (tone, expected). ~0.9–1.0s. |
| OpenAI embeddings               | FAIL   | `embedding_provider_unavailable` — HTTP 429 `insufficient_quota`.                  |
| OpenAI live suggestion          | FAIL   | Stream reached `response.failed` / `error` with `insufficient_quota`.             |

Measured latency vs. NFR-001 (3s): **not obtained** — the OpenAI suggestion
never produced a completion because the account has no quota.

## Root cause

Both OpenAI failures share one cause: the **OpenAI API key has no available
quota** (HTTP 429 `insufficient_quota` on both `/v1/responses` and
`/v1/embeddings`). This is an account/billing state, not a Dokeza defect. The
Deepgram key is funded and works.

## Deviations from fake-backed assumptions

| # | Area      | Deviation (content-free)                                                                                                                                                                                                 | Follow-up |
| - | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1 | llm       | `OpenAiResponsesLiveSuggestionProvider` ignores `error` and `response.failed` SSE events. A real provider failure (here `insufficient_quota`) surfaces only as the generic `ModelGatewayError: OpenAI response stream did not complete`, discarding the provider's actual code. | **fixed** — both suggestion providers now detect `error`/`response.failed` (Responses) and error frames (chat) and throw `ModelGatewayError` code `llm_provider_error` carrying `providerCode`; verified against the real API (surfaces `insufficient_quota`). |
| 2 | retrieval | `createChunkEmbeddings` / `createSearchEmbedding` swallow embedding-provider errors (`catch → empty`) and silently degrade to keyword-only retrieval with no telemetry/signal. A workspace can believe it has semantic retrieval when it does not. | filed     |
| 3 | harness   | The original embeddings check ran through the repository and reported PASS via keyword fallback even though the real embedding call 429'd. Fixed in commit 6b69e40 to call `embed()` directly and assert a real vector. | fixed     |

## Defects found

Covered by deviations #1 and #2 above (product code) and #3 (harness, fixed).

## Leakage check

- [x] No credential, transcript, prompt, suggestion, or document content in the harness output, this note, or logs. API keys referenced by masked length only.

## Verdict

**PARTIAL / PASS-WITH-FOLLOWUPS.** Deepgram real-provider integration proven.
OpenAI suggestion and embedding paths could not be validated because the test
key is unfunded; re-run both with a quota-enabled OpenAI key. Two real product
defects in provider error handling were surfaced and filed. Auth0 + live-mic
remain manual and open.

## Second run (2026-07-10) — NVIDIA OpenAI-compatible provider

Re-ran the suggestion path against a free NVIDIA endpoint
(`build.nvidia.com`) using the `openai_chat` provider, to obtain real
latency without a funded OpenAI account.

| Field           | Value                                                            |
| --------------- | ---------------------------------------------------------------- |
| LLM provider    | `openai_chat` → `https://integrate.api.nvidia.com/v1`            |
| Model           | `meta/llama-3.1-8b-instruct`                                     |
| Embeddings      | deterministic (NVIDIA embed models need different model/dims)    |

| Boundary               | Result | Detail (content-free)                                                        |
| ---------------------- | ------ | ---------------------------------------------------------------------------- |
| Live suggestion        | PASS   | first token **860ms**, complete **1292ms** — within the 3s NFR-001 target; 35 tokens, 167-char output. |
| Deepgram               | PASS   | Connected + authed; synthetic PCM accepted; 0 transcript events (~0.75s).    |

**Outcome:** the core suggestion path is proven end-to-end against a real
OpenAI-compatible LLM and **meets NFR-001** (1292ms << 3000ms). This confirms
the first OpenAI failure was purely account quota, not a happy-path defect. The
`openai_chat` provider plus `OPENAI_BASE_URL`/`OPENAI_MODEL` also satisfy
production model/endpoint selection. Deviation #1 (error-event handling) remains
valid and open; embeddings against a real OpenAI-compatible endpoint still need
a run with a valid embed model.

## Next actions

1. ~~Obtain real suggestion latency vs. NFR-001~~ — done via NVIDIA
   `openai_chat` (1292ms, within target). Still confirm real **embeddings**
   against a funded OpenAI key or a valid NVIDIA embed model + dimensions.
2. ~~Address deviation #1 (surface provider error codes)~~ — done; providers
   now emit `llm_provider_error` with the provider code.
3. Address deviation #2 (signal/telemetry on embedding-provider failure instead
   of silent keyword-only degradation).
4. Run the manual checklist for Auth0 sign-in and a real microphone session.
