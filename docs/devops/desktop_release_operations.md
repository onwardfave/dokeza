# Desktop Release Operations

## Purpose

This document defines the current desktop updater, signing, channel, and rollback path for the Tauri desktop shell. It is a release-operations proof, not a production release runbook with live credentials.

## Current Proof Status

The repository now validates three release-operation requirements before production credentials exist:

- update installation is deferred while a meeting session is active;
- stable and beta release channels have explicit updater endpoint templates;
- updater and installer signing environment variables are named and validated without committing secret material.

The validation entry point is:

```powershell
pnpm desktop:release:check
```

CI runs this check in the `Node workspace checks` job.

## Release Metadata

Non-secret desktop release metadata lives in:

```text
apps/desktop/release.desktop.json
```

The file defines:

- `stable` and `beta` channels;
- Tauri application identifiers for each channel;
- HTTPS updater endpoint templates using `{{target}}`, `{{arch}}`, and `{{current_version}}`;
- `previous_known_good` rollback mode;
- required signing and notarization environment variable names;
- policy flags requiring signed updater artifacts and signed installers.

Do not put private keys, certificate passwords, certificate contents, Apple app-specific passwords, or certificate file contents in this file.

## Update Deferral Policy

The desktop client must not install an update during an active meeting session.

The current native proof is exposed through the diagnostics command:

```text
probe_update_installation_policy
```

The command verifies:

- active session: update installation is deferred;
- idle session: update installation is allowed;
- stable and beta channels are recognized;
- rollback support is represented as required metadata;
- signing is required;
- updater private key material is not present in the diagnostic result.

Production implementation should wire this policy to real meeting session state before calling the updater install path.

## Updater Path

Dokeza should use the Tauri v2 updater model with signed update artifacts and either:

- a static JSON file on release storage or GitHub Releases; or
- a dynamic update service.

The endpoint template shape follows the Tauri updater variables:

```text
https://releases.dokeza.com/desktop/{channel}/{{target}}/{{arch}}/{{current_version}}
```

Production updater configuration must include:

- a public updater key in Tauri configuration;
- signed updater artifacts generated with the corresponding private key;
- HTTPS release endpoints;
- no installation during active sessions;
- a rollback policy based on previous known-good release artifacts.

## Signing Requirements

Required updater environment variables:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

Required Windows environment variables:

- `WINDOWS_CERTIFICATE_PATH`
- `WINDOWS_CERTIFICATE_PASSWORD`

Required macOS environment variables:

- `APPLE_ID`
- `APPLE_ID_PASSWORD`
- `APPLE_TEAM_ID`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_NOTARIZATION_KEYCHAIN_PROFILE`

The variable names may be committed because they are not secrets. Their values must be injected by CI or the release environment.

## CI Gate

The validator at `scripts/desktop-release/validate-release-config.mjs` checks:

- both stable and beta channels exist;
- updater endpoints use HTTPS;
- updater endpoints include Tauri target, architecture, and current-version tokens;
- rollback mode is `previous_known_good`;
- required signing environment variable names are present;
- release policy requires signed updater artifacts and installers;
- known private-key and password markers are absent.

## Remaining Production Work

Before a real release:

- choose the updater hosting model;
- generate and store the updater key pair outside the repository;
- provision Windows signing certificate access;
- configure Apple signing and notarization access;
- add a release workflow that builds immutable artifacts and signs them;
- produce signed updater artifacts;
- run install, update, rollback, and active-session deferral QA on Windows and macOS.
