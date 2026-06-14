# Tauri Capability Spike Results

## Purpose

This document records evidence for the ADR 0001 Tauri capability spike. Each capability should end as `pass`, `pass with caveat`, `fail`, or `pending`, with enough evidence to support the final ADR decision.

## Summary

| Capability | Status | Evidence | Follow-Up |
| --- | --- | --- | --- |
| Transparent overlay window | Pending manual QA | `apps/desktop/src-tauri/tauri.conf.json` defines an `overlay` window with `transparent: true`, `decorations: false`, compact dimensions, and `index.html#/overlay`; `pnpm --filter @dokeza/desktop tauri build --debug --no-bundle` passes on Windows. | Verify visual transparency on Windows and macOS against browser, Zoom, Meet, Teams, and native windows. |
| Always-on-top overlay behavior | Pending manual QA | The overlay window is configured with `alwaysOnTop: true` and `skipTaskbar: true`; Tauri debug build accepts the configuration. | Verify stacking behavior on Windows and macOS, including full-screen spaces and presentation workflows. |
| Global hotkeys | Pending | Not implemented. | Add official Tauri v2 global shortcut plugin and a development-only overlay toggle. |
| Microphone capture | Pending | Not implemented. | Add native audio probe that reports metadata only. |
| System audio capture or fallback | Pending | Not implemented. | Validate Windows loopback and macOS authorized capture/fallback. |
| WebSocket streaming using realtime protocol | Pending | Not implemented. | Add native WebSocket proof with synthetic frames. |
| Local SQLite cache access | Pending | Not implemented. | Add app-data SQLite create/write/read/delete proof. |
| Auto-update path | Pending | Not implemented. | Prove update deferral and rollback path. |
| Signed installer path | Pending | Not implemented. | Prove signing/notarization pipeline path without storing credentials. |
| Basic crash diagnostics | Pending | Not implemented. | Add local redacted panic/minidump proof before external telemetry. |

## Evidence Log

### 2026-06-14: Overlay Window Build Viability

- Added a separate `overlay` Tauri window.
- Added deterministic desktop surface selection and config tests.
- Added a compact overlay UI route at `index.html#/overlay`.
- Verification:
  - `pnpm --filter @dokeza/desktop test`
  - `pnpm --filter @dokeza/desktop build`
  - `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml -- --check`
  - `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings`
  - `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
  - `pnpm --filter @dokeza/desktop tauri build --debug --no-bundle`
- Result: build viability for the overlay configuration passes on Windows. Runtime transparency and stacking behavior remain pending manual QA on Windows and macOS.
