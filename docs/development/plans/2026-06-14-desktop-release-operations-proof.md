# Desktop Release Operations Proof Implementation Plan

## Goal

Prove the next Tauri release-operation blockers without introducing production signing credentials: update deferral during active sessions, updater configuration shape, and signed-installer pipeline validation. The slice should provide executable policy checks and deterministic CI validation while keeping real certificates, private keys, and release endpoints out of the repository.

## Requirements and Milestone

- FR-007: support automatic updates.
- FR-009: do not apply desktop updates during an active meeting session.
- FR-010: support rollback to the previous desktop version after a failed or unstable update.
- FR-011: support stable and beta update channels.
- REL-001: support crash-free desktop release monitoring by version.
- Full-system Milestone 0: close remaining Tauri desktop shell spike acceptance criteria.
- Full-system Milestone 1: prepare desktop release operations before feature implementation expands.
- Product vertical: Desktop Client Platform.

## Affected Architecture

- `apps/desktop/src-tauri`: add update installation policy logic and a diagnostics command.
- `apps/desktop/src/ui`: add a diagnostics action for update deferral policy.
- `scripts/desktop-release`: add a deterministic release configuration validator.
- `.github/workflows/ci.yml`: add release configuration validation to CI.
- `docs/devops`: document updater/signing path and credential boundaries.
- `docs/development/tauri_capability_spike_results.md`: update evidence for auto-update and signed installer paths.

## Contracts and Data Model

- New Tauri command: `probe_update_installation_policy`.
- New local TypeScript-free release metadata config: `apps/desktop/release.desktop.json`.
- No realtime protocol, REST API, persisted data model, telemetry event, or AI output contract changes.
- Release metadata must stay non-secret and synthetic where endpoints or public keys are placeholders.

## Security and Privacy

- Do not commit private signing keys, certificate files, certificate passwords, Apple credentials, Windows certificate material, or updater private keys.
- Public updater keys and endpoint templates may be committed only when non-secret.
- The diagnostics command must not log or expose meeting content.
- Workspace isolation is not directly involved, but active-session update deferral represents a future workspace/session lifecycle guard.
- No new external data flow is introduced by this proof. Actual update downloads remain future release infrastructure.

## Implementation Tasks

1. Commit this plan before code changes.
2. Add Rust update policy types and tests for active-session deferral, idle install allowance, channel validation, and rollback metadata.
3. Add `probe_update_installation_policy` as a Tauri diagnostics command returning metadata only.
4. Add desktop UI wrapper, formatting, and diagnostics button.
5. Add frontend tests for command dispatch and metadata-only formatting.
6. Add `apps/desktop/release.desktop.json` with non-secret updater/signing channel metadata.
7. Add `scripts/desktop-release/validate-release-config.mjs`.
8. Add `pnpm desktop:release:check` and wire it into CI.
9. Update DevOps, testing, manual QA, and spike evidence docs.
10. Run full verification, commit, push, and watch CI.

## Tests and Verification

- Rust tests:
  - active meeting sessions defer update installation.
  - idle sessions allow update installation.
  - stable and beta channels are accepted.
  - invalid channels are rejected.
  - rollback metadata is represented without certificate or key material.
- Frontend tests:
  - update policy diagnostics command dispatch.
  - formatter renders safe update policy metadata.
- Release config tests:
  - release metadata has stable and beta channels.
  - updater endpoint templates use HTTPS.
  - required signing environment variable names are present.
  - no private key, certificate password, or certificate file content is committed.
- Local verification:
  - `pnpm desktop:release:check`
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

- `docs/devops/desktop_release_operations.md`: describe updater, signing, rollback, and credential handling path.
- `docs/devops/ci_cd_release.md`: record release config validation in CI.
- `docs/testing/testing_strategy.md`: include update deferral and release config checks.
- `docs/development/windows_audio_diagnostics_manual_qa.md`: add update policy diagnostics QA.
- `docs/development/tauri_capability_spike_results.md`: record auto-update and signed installer proof status.

## Rollback or Degraded Behavior

If an update is available during an active meeting session, installation must be deferred and surfaced as safe metadata. If release configuration validation fails, CI must block the release path before any artifacts are produced. Production rollback remains a future release-channel operation, but the config must identify previous-version rollback as an explicit supported mode.

## Open Questions

- Which updater host will be used for production: static JSON on object storage/GitHub Releases, a dynamic update service, or a managed release provider?
- Which code signing certificate provider will be used for Windows?
- Which Apple Developer Team ID and notarization workflow will be used for macOS?
- Should beta and stable be separate Tauri identifiers or separate updater channels for the same identifier?
