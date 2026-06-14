# Tauri Capability Spike Implementation Plan

## Goal

Validate whether Tauri v2 can remain Dokeza's desktop shell before Milestone 1 feature implementation starts. The spike must produce evidence for every ADR 0001 acceptance criterion and end with a clear `pass`, `pass with caveat`, or `fail / reversal trigger` result.

This is a platform decision gate, not product feature work. Build only the smallest useful code needed to prove the desktop capabilities, keep spike code isolated, and promote validated pieces into production-shaped adapters only after the decision is made.

## Requirements and Milestone

- Milestone 0 exit gate: desktop shell ADR spike criteria accepted or assigned.
- Milestone 1 prerequisite: core desktop and realtime backbone can be built on the selected shell.
- Requirement IDs:
  - FR-001 to FR-008: desktop shell, overlay, hotkeys, updates, diagnostics.
  - FR-020 to FR-025: permission prompts and capture-state visibility.
  - FR-040 to FR-047: microphone and system audio capture behavior.
  - FR-060 to FR-067: realtime transcription transport prerequisites.
  - FR-100 to FR-105: meeting session state and local persistence prerequisites.
  - FR-200 to FR-208: overlay behavior, compact display, and display privacy boundaries.
  - NFR-001 to NFR-005: latency, responsiveness, CPU, and memory.
  - NFR-020 to NFR-026: recovery, buffering, and protocol behavior.
  - NFR-040 to NFR-049: secure transport, local token handling direction, data-flow documentation.
  - NFR-100 to NFR-104: testable modules and telemetry.

## Affected Architecture

- `apps/desktop`: Tauri native shell, window configuration, platform adapters, diagnostics, and local capability probes.
- `packages/contracts`: read-only dependency for realtime protocol validation unless the spike finds a protocol mismatch.
- `services/realtime`: local-only target for WebSocket smoke verification if needed.
- `docs/architecture/adr/0001-desktop-shell-tauri-v2.md`: final spike result and reversal decision.
- `docs/architecture/c4_architecture.md`: update only if component boundaries change.
- `docs/architecture/failure_modes.md`: update for any newly discovered platform-specific failure behavior.
- `docs/security/data_flows.md`: update before adding any new external data flow.
- `docs/devops/ci_cd_release.md`: update if CI, updater, signing, or release gates change.
- `docs/testing/testing_strategy.md`: update if new desktop QA or native test gates are added.

## Contracts and Data Model

- Realtime message shapes must stay aligned with `docs/architecture/realtime_protocol.md`.
- This spike should not introduce a new realtime protocol version.
- WebSocket proof should use the existing `auth.hello`, `session.start`, `audio.chunk_meta`, binary audio frame, `audio.gap`, and `session.end` shapes where applicable.
- Local SQLite proof may use a local-only schema for capability validation. Do not treat it as the final meeting data model.
- No REST API, AI structured output, audit event, or telemetry event contract changes are expected in Phase A.

## Security and Privacy

- Do not log raw audio, transcript, prompt, document, screen, or suggestion content by default.
- Audio capture probes must operate on synthetic or user-controlled local test audio only.
- System audio validation must respect OS permission models and must not require bypassing OS security protections.
- Overlay/display privacy checks must be framed as preventing accidental exposure of private notes, not hiding assistance from parties entitled to know.
- Any remote telemetry or crash reporting integration requires a data-flow update before implementation.
- Workspace isolation is not directly exercised by the local desktop spike, but any backend or persisted session proof must include explicit workspace IDs and use existing authz boundaries.

## Implementation Tasks

### Phase 0: Plan and Baseline

1. Add this spike plan and correct stale prior plan notes about Rust/Cargo availability.
2. Confirm the current CI baseline is green before capability work starts.
3. Create an evidence log section in ADR 0001 or a dedicated spike results document before marking the ADR final.
4. Keep each capability in a separate commit where practical.

### Phase A: Kill-Shot Capability Checks

1. Transparent overlay window:
   - Add a second Tauri window label for the overlay.
   - Configure transparent, undecorated, resizable, and initially compact dimensions.
   - Add a minimal overlay UI state that proves transparency, dragging, resizing, and readable status text.
   - Verify Windows behavior locally.
   - Record macOS verification as pending until a macOS runner or device is available.
2. Always-on-top behavior:
   - Enable always-on-top for the overlay.
   - Add a local verification checklist against browser, Zoom, Meet, Teams, and native windows.
   - Record whether behavior changes in full-screen spaces or presentation modes.
3. Global hotkeys:
   - Add the official Tauri v2 global shortcut plugin.
   - Register a development-only shortcut for toggling overlay visibility.
   - Add a deterministic Rust unit test around shortcut configuration where possible.
   - Document key conflict behavior and user override needs.
4. Microphone capture:
   - Add a native audio probe behind a dev-only command or feature flag.
   - Enumerate input devices without logging device owner content.
   - Capture short synthetic/local samples in memory and report metadata only: sample rate, channels, frame count, and duration.
   - Add tests for result serialization and error mapping.
5. System audio feasibility and fallback:
   - Validate Windows loopback feasibility separately from microphone input.
   - Validate or research macOS ScreenCaptureKit/system-audio path on macOS.
   - If capture is not viable without a virtual driver, document the fallback and its product impact.
   - Update `failure_modes.md` if a new degraded system-audio behavior is discovered.

Stop condition: if transparent overlay or authorized audio capture fails in a blocker-level way, pause feature work and evaluate Electron against the same checks.

### Phase B: Integration Capability Checks

1. Native WebSocket streaming:
   - Add a native WebSocket proof against a local realtime test endpoint.
   - Send existing protocol control messages and a synthetic binary audio frame.
   - Verify sequence handling and recoverable error behavior.
2. Local SQLite cache:
   - Add a local app-data SQLite proof with a synthetic capability table.
   - Verify create, write, read, and delete behavior.
   - Confirm disk-full and path errors map to recoverable diagnostics.
3. macOS build and permission prompts:
   - Run native build smoke on macOS.
   - Record microphone, screen, and system-audio permission behavior.
   - Document platform caveats before proceeding.

### Phase C: Release and Operations Capability Checks

1. Updater path:
   - Add a Tauri updater proof or documented release pipeline path.
   - Verify update deferral requirement for active sessions is implementable.
   - Record rollback mechanism and limitations.
2. Signed installer path:
   - Prove Windows Authenticode and macOS signing/notarization steps at the pipeline-design level, or run a dry build when credentials are available.
   - Keep signing credentials out of the repo.
3. Crash diagnostics:
   - Add a local panic hook or minidump/Sentry proof that redacts content by default.
   - Update data-flow documentation before any external crash telemetry is enabled.

## Tests and Verification

- Run after each doc-only slice:
  - `pnpm format:check`
- Run after each TypeScript desktop slice:
  - `pnpm --filter @dokeza/desktop build`
  - `pnpm test`
  - `pnpm typecheck`
- Run after each Rust desktop slice:
  - `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml -- --check`
  - `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings`
  - `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
  - `pnpm --filter @dokeza/desktop tauri build --debug --no-bundle`
- Manual QA evidence:
  - Windows overlay transparency and always-on-top checklist.
  - macOS overlay transparency and always-on-top checklist.
  - Hotkey behavior across meeting apps and browsers.
  - Microphone permission allowed, denied, and device-missing cases.
  - System-audio available, unavailable, and fallback cases.
- CI evidence:
  - Existing four required checks remain green.
  - Add new CI gates only after they are deterministic on hosted runners.

## Documentation Updates

- Update `docs/architecture/adr/0001-desktop-shell-tauri-v2.md` after the spike with the evidence table and final decision.
- Update `docs/architecture/failure_modes.md` for new platform-specific failure behavior.
- Update `docs/security/data_flows.md` before any new external telemetry, crash, or provider flow is added.
- Update `docs/devops/ci_cd_release.md` if updater, signing, or CI gates change.
- Update `docs/testing/testing_strategy.md` when manual QA checklists become release gates.
- Update `docs/srs/traceability_matrix.md` if milestone coverage changes.

## Rollback or Degraded Behavior

- Spike code should be removable without affecting shared contracts or backend services.
- If Tauri fails a blocker-level criterion, preserve reusable React UI, TypeScript contracts, protocol client logic, and backend scaffolding while evaluating Electron.
- If system audio is unavailable on a supported platform, continue mic-only and document the user-visible degraded state.
- If global shortcut registration fails or conflicts, expose a visible UI fallback and later support user-configurable shortcuts.
- If updater or signing is not production-viable in Tauri, pause before M1 and compare Electron release operations.

## Open Questions

- Which macOS device or runner will provide authoritative overlay, permissions, and audio evidence?
- Is mic-only mode acceptable for the first internal alpha if system audio remains platform-limited?
- Should the spike keep local capability probes behind `debug_assertions`, a Cargo feature, or a hidden developer settings panel?
- Which crash diagnostics vendor, if any, will be used after the local proof?
- Which shortcut defaults avoid conflicts with Zoom, Meet, Teams, Slack, and browser-level commands?
