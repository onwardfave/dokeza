# Alpha.5a Real-Provider Smoke Test Checklist

Concrete, runnable form of [`testing_strategy.md` §7.1](testing_strategy.md) and the Alpha.5a slice in [`../development/plans/2026-07-06-production-alpha-gate.md`](../development/plans/2026-07-06-production-alpha-gate.md).

**Objective:** prove the synthetically-verified pipeline works once, end to end, against real Auth0 + Deepgram + OpenAI. This is not a load test and not a polish pass. The deliverable is one clean run plus one honest, content-free QA note.

## Rules of Engagement

- Credentials come from local untracked config only. Never repo, CI, telemetry, screenshots, or the QA note.
- The QA note is **content-free**: latencies, counts, error categories, and deviations only — no transcript, prompt, suggestion, or document text.
- Speak scripted, non-sensitive test phrases. Assume everything spoken reaches Deepgram and OpenAI.
- On failure, **stop, record it, file a follow-up** — do not patch-and-continue. A documented failure is a passing smoke test; only "we did not run it" is a failure.

## Pre-flight (credentials & config)

- [ ] Auth0 tenant reachable; test user exists; loopback callback (`127.0.0.1:<port>`) registered.
- [ ] `DEEPGRAM_API_KEY`, `OPENAI_API_KEY`, and Auth0 client/domain present in local untracked env.
- [ ] Realtime workspace policy is cloud-allowed (`cloud_llm_allowed`, cloud retention) so persistence and providers actually engage.
- [ ] `pnpm dev:infra` up and `pnpm db:migrate` applied.
- [ ] Real microphone connected; device name known.
- [ ] `git status` clean; record the commit SHA under test.

## The Run (single continuous session)

- [ ] **Auth:** hosted sign-in via OS browser → PKCE → loopback callback → API session stored in OS credential store. _Record: sign-in wall-clock._
- [ ] **Workspace:** only authorized workspace(s) listed; select one; realtime token issued with no pasted token.
- [ ] **Consent:** capture-consent gate shown and accepted before the mic starts.
- [ ] **Capture:** start real mic; speak ~2–3 min of scripted phrases including one clear question.
- [ ] **Transcript:** partials render and promote to finals; ordering is sane. _Record: rough first-partial latency; any dropped/garbled segments (count only)._
- [ ] **Suggestion (no sources):** trigger manual "answer question." _Record: request→first-token and request→complete latency vs. the 3s NFR-001 target._
- [ ] **Knowledge:** upload one text/Markdown doc via API; confirm chunk/embed succeeds against real OpenAI embeddings.
- [ ] **Suggestion (with sources):** trigger again with sources on; confirm `suggestion.complete.sources` cites the uploaded doc and the citation resolves. _Record: latency; whether retrieval fired._
- [ ] **Stop:** end the session cleanly.
- [ ] **Review:** meeting appears in history; transcript, gaps, and persisted suggestions present per retention.
- [ ] **Export:** Markdown and JSON export succeed.
- [ ] **Delete:** delete the meeting via the workspace-scoped route; confirm it is gone.

## Degraded-path spot checks (at least 2 in the same session)

- [ ] Unplug/disable mic mid-capture → explicit device-failure state and `audio.gap`, **no crash**.
- [ ] Kill network briefly → reconnect/backoff visible; resume or explicit failure, no silent data loss.
- [ ] Force an LLM timeout (bad key / tiny timeout) → session stays live, suggestion shows unavailable/degraded.
- [ ] Retrieval failure → suggestion falls back to transcript-only with empty sources and a clear source cue.

## Evidence & follow-up (the actual deliverable)

- [ ] Write `docs/development/qa/<date>-alpha5a-smoke.md`: commit SHA, date, provider versions, **measured latencies**, deviation list, defects — **content-free**.
- [ ] Add a dated entry to [`../development/progress.md`](../development/progress.md) "Latest Broad Verification" and check/split the Alpha.5a boxes honestly.
- [ ] File a follow-up plan/issue for **every** deviation before resuming feature work.
- [ ] Confirm no secret or customer content leaked into logs, telemetry, diagnostics, the QA note, or screenshots.

## Pass Criteria

The path completed with real providers **and** latency is recorded against the 3s target (NFR-001), **or** every failure is documented with a follow-up. Both outcomes are a successful smoke test.

Re-run this checklist after any change to provider adapters, the auth token flow, or the realtime protocol.
