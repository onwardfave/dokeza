# Local Crash Diagnostics Implementation Plan

## Goal

Add a first local crash diagnostics capability to the Tauri desktop spike so the app can prove it can create a redacted diagnostic artifact without exposing meeting content. This is a local-only proof: it writes safe crash metadata on the user device and exposes a manual diagnostic probe in the existing desktop diagnostics panel.

## Requirements and Milestone

- SRS FR-008: provide local diagnostic logs that exclude sensitive transcript content by default.
- Reliability REL-001: support future desktop crash-free session measurement.
- Security NFR-049: maintain and test against the threat model, especially sensitive telemetry leakage.
- Full-system Milestone 0: validate Tauri desktop shell viability before feature implementation.
- Full-system Milestone 1: prepare basic diagnostic logging for the desktop client.
- Product vertical: Desktop Client Platform.

## Affected Architecture

- Desktop native layer: add a Rust crash diagnostics module and install a panic hook during Tauri setup.
- Desktop UI: add a diagnostics action that invokes a synthetic crash diagnostics probe.
- Local storage: write JSON report files under the app data directory in a local crash report folder.
- Backend, realtime protocol, and cloud telemetry are not affected in this slice.

## Contracts and Data Model

- New Tauri command: `probe_crash_diagnostics`.
- New local report schema, versioned as `local_crash_report.v1`.
- Report fields are limited to operational metadata such as schema version, app version, platform, timestamp, process id, panic payload kind, source file name, line, column, and redaction markers.
- The command response returns only safe metadata such as report file name, byte count, redaction status, and sensitive marker count.
- No REST API, realtime message, AI structured output, audit event, or external telemetry event changes.

## Security and Privacy

- The report must not include raw transcript, prompt, document, suggestion, screen, or audio content.
- The panic payload text must not be persisted; only a payload kind may be recorded.
- The command response must not return an absolute local filesystem path.
- Workspace isolation is not involved because the slice does not read workspace data or meeting state.
- This adds no external data flow. If a future release uploads crash reports, `docs/security/data_flows.md` must be updated before implementation.

## Implementation Tasks

1. Add this implementation plan and commit it before code changes.
2. Add Rust unit tests for redacted report shape, local write metadata, and file-name-only command output.
3. Implement the Rust crash diagnostics module and install the panic hook during Tauri setup.
4. Add the `probe_crash_diagnostics` Tauri command to write a synthetic redacted report.
5. Extend the desktop diagnostics TypeScript wrapper, UI action, and formatter.
6. Add frontend tests for the crash diagnostics command dispatch and formatted output.
7. Update manual QA, testing strategy, failure-mode, and Tauri spike documentation.
8. Run focused and broad verification, commit the implementation, push, and watch CI.

## Tests and Verification

- Rust unit tests:
  - synthetic sensitive markers do not appear in serialized report JSON.
  - report writes create a local file and return file-name-only metadata.
  - probe response marks panic message redaction and avoids full path disclosure.
- Frontend unit tests:
  - `crashDiagnostics` invokes `probe_crash_diagnostics`.
  - formatter renders safe crash diagnostics metadata.
- Local verification:
  - `pnpm format:check`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm --filter @dokeza/desktop test`
  - `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml -- --check`
  - `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings`
  - `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
  - `pnpm --filter @dokeza/desktop build`
  - `pnpm --filter @dokeza/desktop tauri build --debug --no-bundle`

## Documentation Updates

- `docs/development/tauri_capability_spike_results.md`: record the crash diagnostics proof and remaining production gaps.
- `docs/development/windows_audio_diagnostics_manual_qa.md`: add manual QA steps for the crash diagnostics probe.
- `docs/testing/testing_strategy.md`: list redacted local crash diagnostics under desktop tests.
- `docs/architecture/failure_modes.md`: document local crash report write failure behavior.

## Rollback or Degraded Behavior

If the local crash report cannot be written, the panic hook must not panic recursively. It should ignore the local write failure and continue default panic handling. The user-visible effect is that the local crash report may be unavailable while the app still follows normal platform crash behavior.

## Open Questions

- Which external crash reporting provider, if any, should be adopted for production after local-only behavior is proven?
- What retention limit should apply to local crash reports before public beta?
- Should users get an explicit export/delete UI for crash reports, or should this remain inside a broader diagnostic bundle workflow?
