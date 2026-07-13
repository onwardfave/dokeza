# Desktop Capture and Usage Bottlenecks Implementation Plan

## Goal

Close the next code-owned production-alpha bottlenecks: use the supported Tauri system browser for hosted sign-in, make desktop network policy build-environment-specific, replace repeated one-second microphone probes with a long-lived native stream, and enforce bounded suggestion context/output usage with durable metadata-only attribution.

## Requirements and Milestone

- Production Alpha.1 / FR-020 to FR-025 / NFR-040 to NFR-049: installed desktop authentication and least-privilege WebView policy.
- Production Alpha.3 / FR-040 to FR-047 / NFR-001 to NFR-005 / NFR-020 to NFR-026: reliable microphone capture lifecycle and explicit gaps.
- Production Alpha.4 / FR-160 to FR-169 / NFR-110 to NFR-113: token/context/output budgets, usage attribution, and commercial guardrails.
- Product vertical remains the production-alpha meeting copilot; design-partner-specific thresholds remain configurable/manual.

## Affected Architecture

- `apps/desktop/src/protocol` owns the hosted-browser and typed native microphone event boundaries.
- `apps/desktop/src-tauri` owns the supported system-browser plugin, continuous CPAL stream, bounded native queue, lifecycle state, and sanitized native errors.
- Desktop build scripts own generated CSP overlays derived from validated environment endpoints; generated files contain no credentials.
- `services/realtime`, `services/ai-orchestrator`, `packages/config`, and PostgreSQL own usage budgets and metadata-only ledger records.

## Contracts and Data Model

- Keep realtime wire messages backward compatible. Existing `audio.chunk_meta`, binary PCM, and `audio.gap` messages remain authoritative.
- Add an internal typed Tauri event contract for microphone chunks, capture state, and sanitized errors; it is not a public network contract.
- Preserve mono 16 kHz `pcm_s16le` 100 ms chunks.
- Add workspace/session/provider/feature usage rows only if the usage slice reaches durable storage in this pass; every row must be workspace-scoped and protected by forced RLS.
- No raw audio, transcript, prompt, source text, suggestion content, tokens, authorization codes, or bearer values enter native events, usage rows, logs, or telemetry.

## Security and Privacy

- Native installed builds open Auth0 authorization URLs through `@tauri-apps/plugin-opener`; browser preview alone may retain a normal browser fallback.
- The opener capability is limited to HTTPS Auth0 URLs and the main window.
- Production desktop security configuration requires HTTPS API/Auth0 and WSS realtime endpoints and generates exact `connect-src` origins. Invalid or missing production inputs fail the build helper.
- Microphone bytes remain in memory until framed for the authenticated realtime session. The native stream does not write audio to disk.
- Capture failure, pause, buffer overflow, and device loss emit metadata-only state/error signals that the TypeScript controller maps to explicit `audio.gap` messages.

## Implementation Tasks

### Checkpoint A - Hosted Browser and CSP

Status: **Implemented; installed-build QA remains credential/release gated.**

1. Add TDD coverage for native-vs-browser hosted-auth opening.
2. Install and register the official Tauri opener plugin with a scoped main-window capability.
3. Add a pure security-config generator with local defaults and production validation.
4. Add configured Tauri dev/build scripts and drift/config tests.
5. Update authentication, CSP, failure, data-flow, local-environment, progress, and manual-QA docs.

### Checkpoint B - Long-Lived Native Microphone

Status: **Implemented in code; physical Windows soak and permission QA remain manual.**

1. Specify typed native chunk/state/error events and TypeScript subscription tests.
2. Add a Rust stream lifecycle state machine with start, pause, resume, stop, and shutdown.
3. Use a bounded callback-to-emitter queue; report overflow/device errors without content.
4. Replace enumeration-index identity with a deterministic device descriptor fingerprint plus fallback resolution.
5. Replace nearest-neighbor batch resampling with a streaming, measured resampler.
6. Wire the live UI/controller to the event stream and preserve explicit gap behavior.
7. Add Rust lifecycle/DSP tests and TypeScript integration tests; retain physical-device soak QA in the manual ledger.

### Checkpoint C - Usage Guardrails

Status: **Implemented for live suggestions; cross-feature metering and reviewed production prices remain open.**

1. Define configurable transcript, source, instruction, output, per-session request, and provider-time budgets.
2. Reject or truncate before provider submission with stable metadata-only degraded states.
3. Record workspace/session/provider/feature usage and limit outcomes without customer content.
4. Add restricted-role migration, repository tests, failure injection, and operational threshold placeholders.

## Tests and Verification

- Targeted Vitest tests before each TypeScript behavior.
- Rust unit tests for lifecycle transitions, queue overflow accounting, DSP/chunk framing, and stable device IDs.
- `pnpm --filter @dokeza/desktop test`, desktop typecheck/build, and generated CSP config tests.
- `cargo test` and `cargo build` in `apps/desktop/src-tauri` for native checkpoints.
- Realtime/config/unit tests and restricted-role PostgreSQL integration for usage persistence.
- `pnpm check`, `pnpm security:audit`, and clean-tree verification before each checkpoint commit.

## Documentation Updates

- `docs/architecture/authentication.md`
- `docs/architecture/realtime_protocol.md` if gap semantics change
- `docs/architecture/failure_modes.md`
- `docs/security/data_flows.md` and `docs/security/threat_model.md`
- `docs/development/local_environment.md`, `progress.md`, production roadmap/gate, and manual TODO ledger
- Property catalogs for native capture and usage budgets

## Rollback or Degraded Behavior

- If the system browser cannot open, sign-in fails with a sanitized retryable state; no embedded WebView login fallback is introduced.
- Invalid production endpoint/CSP configuration stops the configured desktop build.
- Native capture failure keeps the realtime session visible, stops audio submission, and emits an explicit gap/error state; it never silently loops batch probes.
- Queue overflow drops bounded audio, reports the exact dropped duration/count as metadata, and keeps the application responsive.
- Usage budget exhaustion keeps the session/transcript active while suggestions degrade explicitly and no further provider request is submitted.

## Open Questions

- Auth0 tenant/client values, final hosted endpoints, physical microphone soak evidence, system-audio alpha scope, and commercial thresholds remain in `docs/development/manual-todos.md`.
- The initial resampler implementation will be selected from maintained Rust DSP crates after local toolchain/API validation; the choice and measured behavior will be documented in the capture checkpoint.
