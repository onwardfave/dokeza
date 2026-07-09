<!--
Alpha.5a real-provider smoke-test QA note template.

Copy this file to docs/development/qa/<YYYY-MM-DD>-alpha5a-smoke.md and fill it in
while running docs/testing/alpha5a-smoke-test-checklist.md.

CONTENT-FREE RULE: record latencies, counts, error categories, and deviations only.
Never paste transcript, prompt, suggestion, document, token, or credential content.
Do not commit this template with real values under the TEMPLATE- name — commit the dated copy.
-->

# Alpha.5a Real-Provider Smoke Test — <YYYY-MM-DD>

Concrete run of [`../../testing/alpha5a-smoke-test-checklist.md`](../../testing/alpha5a-smoke-test-checklist.md) (see [`testing_strategy.md` §7.1](../../testing/testing_strategy.md)).

## Run metadata

| Field                 | Value                                    |
| --------------------- | ---------------------------------------- |
| Date                  | <YYYY-MM-DD>                             |
| Commit SHA under test | <sha>                                    |
| Operator              | <name>                                   |
| Host OS / build       | <e.g. Windows 10 19045 / signed alpha?>  |
| Auth0 tenant          | <tenant name, not secrets>               |
| Deepgram model        | <model>                                  |
| OpenAI model(s)       | <suggestion model / embedding model>     |
| Workspace policy      | <cloud_llm_allowed? retention mode>      |

## Measured latencies (vs. NFR-001 = 3s)

| Metric                        | Observed | Target | Pass? |
| ----------------------------- | -------- | ------ | ----- |
| Hosted sign-in wall-clock     | <ms/s>   | —      | —     |
| Transcript first-partial      | <ms>     | —      | —     |
| Suggestion request→first-token| <ms>     | —      | —     |
| Suggestion request→complete   | <ms>     | 3000ms | <y/n> |
| Suggestion (with sources)     | <ms>     | 3000ms | <y/n> |

## Checklist outcome

Mark each phase pass/fail. Keep notes content-free (counts and categories only).

- [ ] Auth (sign-in → PKCE → loopback → stored session)
- [ ] Workspace selection (authorized only, no pasted token)
- [ ] Capture consent gate
- [ ] Real-mic capture
- [ ] Transcript partial→final — dropped/garbled segment count: <n>
- [ ] Suggestion (no sources)
- [ ] Knowledge upload + real embeddings
- [ ] Suggestion (with sources) — citation resolved? <y/n>
- [ ] Stop
- [ ] Meeting review (transcript/gaps/suggestions per retention)
- [ ] Export (Markdown + JSON)
- [ ] Delete

## Degraded-path spot checks (≥2 exercised)

- [ ] Mic unplug/disable → explicit failure + `audio.gap`, no crash
- [ ] Network drop → reconnect/backoff, no silent loss
- [ ] LLM timeout → session live, suggestion degraded
- [ ] Retrieval failure → transcript-only fallback with clear cue

## Deviations from fake-backed assumptions

Enumerate every behavior that differed from what the deterministic/synthetic paths implied.
One row per deviation; file a follow-up for each before resuming feature work.

| # | Area (auth/stt/llm/retrieval/audio/persist) | Deviation (content-free) | Follow-up issue/plan |
| - | ------------------------------------------- | ------------------------ | -------------------- |
| 1 |                                             |                          |                      |

## Defects found

| # | Severity | Symptom (content-free) | Follow-up |
| - | -------- | ---------------------- | --------- |
| 1 |          |                        |           |

## Leakage check

- [ ] No credential, transcript, prompt, suggestion, or document content in logs, telemetry, diagnostics, screenshots, or this note.

## Verdict

<PASS (path completed with real providers, latencies recorded) | PASS-WITH-FOLLOWUPS (failures documented) | did-not-run>

## Tracker updates made

- [ ] Dated entry added to [`../progress.md`](../progress.md) "Latest Broad Verification".
- [ ] Alpha.5a boxes checked/split honestly; `‡` caveats updated where reality was proven.
