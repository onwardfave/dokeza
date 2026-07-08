# Alpha.1 Desktop Secure Token Storage Plan

## Goal

Add a platform-secure desktop token storage foundation so Dokeza API tokens can survive app restarts without being written to browser storage, diagnostics, telemetry, or plain files.

## Requirements and Milestone

- Alpha.1 production auth and onboarding.
- FR-020, NFR-042, NFR-047, NFR-080.
- MVP acceptance: authenticated onboarding and platform-secure token storage.

## Affected Architecture

- `apps/desktop/src-tauri`: native credential-store commands backed by the OS keychain/credential manager.
- `apps/desktop/src/protocol`: TypeScript token-vault wrapper.
- `apps/desktop/src/ui`: first app wiring to load, save, and clear API session tokens.

## Contracts and Data Model

- No REST API, realtime protocol, or cloud database changes.
- New desktop-only Tauri command payload for API token session storage.

## Security and Privacy

- Store only the Dokeza API token and minimal auth metadata needed to restore workspace/user context.
- Do not store realtime session tokens; they remain short-lived and are requested from the API as needed.
- Do not write token values to localStorage/sessionStorage, diagnostics, logs, telemetry, or errors.

## Implementation Tasks

1. Add native secure token vault commands: save, load, clear.
2. Add TypeScript wrapper with injectable invoke for tests.
3. Wire the meeting review API token flow to load/save/clear through the vault.
4. Add Rust and TypeScript tests proving redaction and wrapper behavior.
5. Update auth/failure/progress docs.

## Tests and Verification

- `pnpm --filter @dokeza/desktop test`
- `pnpm --filter @dokeza/desktop typecheck`
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
- Final gate: `pnpm check`

## Documentation Updates

- `docs/architecture/authentication.md`
- `docs/architecture/failure_modes.md`
- `docs/development/progress.md`

## Rollback or Degraded Behavior

If secure storage is unavailable, the app continues with in-memory auth for the current run and surfaces a sanitized unavailable state. Live sessions must not start without a valid token.

## Open Questions

- Hosted IdP refresh-token handling remains open until the IdP and desktop redirect/SDK strategy are selected.
