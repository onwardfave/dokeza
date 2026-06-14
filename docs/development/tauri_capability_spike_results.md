# Tauri Capability Spike Results

## Purpose

This document records evidence for the ADR 0001 Tauri capability spike. Each capability should end as `pass`, `pass with caveat`, `fail`, or `pending`, with enough evidence to support the final ADR decision.

## Summary

| Capability | Status | Evidence | Follow-Up |
| --- | --- | --- | --- |
| Transparent overlay window | Pending manual QA | `apps/desktop/src-tauri/tauri.conf.json` defines an `overlay` window with `transparent: true`, `decorations: false`, compact dimensions, and `index.html#/overlay`; `pnpm --filter @dokeza/desktop tauri build --debug --no-bundle` passes on Windows. | Verify visual transparency on Windows and macOS against browser, Zoom, Meet, Teams, and native windows. |
| Always-on-top overlay behavior | Pending manual QA | The overlay window is configured with `alwaysOnTop: true` and `skipTaskbar: true`; Tauri debug build accepts the configuration. | Verify stacking behavior on Windows and macOS, including full-screen spaces and presentation workflows. |
| Global hotkeys | Pending manual QA | Official Tauri v2 global shortcut plugin is installed and a Rust setup handler registers `ctrl+alt+d` to toggle the overlay window; Rust tests verify the shortcut parses. | Verify registration and conflicts across meeting apps and browsers on Windows and macOS. |
| Microphone capture | Pass on Windows, pending macOS | Native `cpal 0.16.0` probe added behind Tauri commands to enumerate input devices and capture a short default-input sample in memory; report returns metadata only; native checks and Tauri debug build pass on Windows; manual QA captured 9,261 frames from `Microphone (DroidCam Audio)`. | Verify permission prompts and allowed/denied/device-missing behavior on macOS; add denied/device-missing Windows cases later. |
| System audio capture or fallback | Pass on Windows, pending macOS | Output-device enumeration is available and a Windows-only `wasapi 0.23.0` loopback probe is implemented behind a metadata-only Tauri command; manual QA listed 9 output devices and captured 24,480 loopback frames / 195,840 bytes from `Speakers (Realtek High Definition Audio)`. | Validate macOS authorized capture/fallback separately; add unavailable-output and route-switching Windows cases later. |
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

### 2026-06-14: Development Overlay Hotkey

- Added `tauri-plugin-global-shortcut` and `@tauri-apps/plugin-global-shortcut` at `2.3.2`.
- Registered `ctrl+alt+d` in native Tauri setup as a development shortcut for toggling the overlay window.
- Kept the overlay hidden at startup so the hotkey can drive manual verification without forcing the overlay into every launch.
- Verification:
  - Rust unit test for shortcut parsing.
  - `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml -- --check`
  - `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings`
  - `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
  - `pnpm --filter @dokeza/desktop tauri build --debug --no-bundle`
- Result: build viability for the global shortcut integration passes on Windows. Runtime shortcut registration, conflicts, and overlay toggle behavior remain pending manual QA on Windows and macOS.

### 2026-06-14: Metadata-Only Microphone Probe

- Added `cpal 0.16.0` for native input-device access.
- Tried `cpal 0.18.1` first, but it failed to compile on Windows because its broad `windows-core` dependency range resolved incompatibly with its `windows 0.61.x` dependency. The spike uses `cpal 0.16.0` because it pins `windows 0.54.0` and passes the native build.
- Added Tauri commands:
  - `list_microphone_devices`
  - `probe_default_microphone`
- The probe counts frames from a short in-memory input stream and returns metadata only: device name, sample rate, channels, sample format, captured frame count, and probe duration.
- Verification:
  - Rust unit tests for metadata-only result structs.
  - `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml -- --check`
  - `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings`
  - `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
  - `pnpm --filter @dokeza/desktop test`
  - `pnpm --filter @dokeza/desktop build`
  - `pnpm --filter @dokeza/desktop tauri build --debug --no-bundle`
- Result: build viability for the metadata-only microphone probe passes on Windows. Runtime permission prompts and real device behavior remain pending manual QA on Windows and macOS.

### 2026-06-14: System Audio Output Enumeration

- Added `list_system_audio_output_devices` as a metadata-only Tauri command.
- The command enumerates output device names through `cpal` without capturing or persisting audio.
- This proves the desktop can inspect output-device metadata, but it does not prove system audio capture.
- Verification:
  - `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml -- --check`
  - `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings`
  - `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
  - `pnpm format:check`
  - `pnpm --filter @dokeza/desktop tauri build --debug --no-bundle`
- Result: build viability for output-device enumeration passes on Windows. Windows WASAPI loopback and macOS authorized capture/fallback remain separate spike items.

### 2026-06-14: Windows WASAPI Loopback Probe

- Added `wasapi 0.23.0` as a Windows-only dependency.
- Added `probe_system_audio_loopback` as a Tauri command.
- The command starts a bounded loopback capture on the default Windows render device and returns metadata only:
  - backend name
  - output device name
  - sample rate
  - channel count
  - sample format
  - captured frame count
  - captured byte count
  - silent packet count
  - probe duration
- The command does not return, log, write, or persist raw system audio bytes.
- Verification:
  - Rust unit test for metadata-only loopback report shape.
  - `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml -- --check`
  - `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings`
  - `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
  - `pnpm format:check`
  - `pnpm --filter @dokeza/desktop test`
  - `pnpm --filter @dokeza/desktop build`
  - `pnpm --filter @dokeza/desktop tauri build --debug --no-bundle`
- Result: build viability for Windows WASAPI loopback passes. Runtime validation with active system audio, permission behavior, and silence/no-output behavior remain pending manual QA on Windows. macOS system audio remains unresolved and must be validated through a separate ScreenCaptureKit or fallback slice.

### 2026-06-14: Audio Diagnostics Panel

- Added a main-window `Audio QA` diagnostics panel for local manual testing.
- The panel calls the existing metadata-only Tauri commands:
  - `probe_default_microphone`
  - `list_system_audio_output_devices`
  - `probe_system_audio_loopback`
- Browser preview renders the panel but disables native probes because normal browser tabs cannot call Tauri commands or Windows WASAPI.
- Added `docs/development/windows_audio_diagnostics_manual_qa.md` with Windows manual QA steps and pass criteria.
- Verification:
  - Frontend unit tests for native-runtime detection, command dispatch, and metadata-only result formatting.
  - `pnpm --filter @dokeza/desktop test`
- Result: manual QA now has a repeatable in-app control surface. Runtime validation on Windows remains pending until the checklist is executed on a machine with active system audio.

### 2026-06-14: Windows Audio Manual QA Pass

- Ran `docs/development/windows_audio_diagnostics_manual_qa.md` on Windows through the Tauri native runtime.
- Microphone probe result:
  - device: `Microphone (DroidCam Audio)`
  - sample rate: `44100 Hz`
  - channels: `1`
  - sample format: `F32`
  - captured frames: `9261`
  - duration: `250 ms`
- Output enumeration result:
  - device count: `9`
  - included `Speakers (Realtek High Definition Audio)` and several Voicemeeter render devices.
- Windows WASAPI loopback result after routing active system audio to the default render device:
  - backend: `wasapi_loopback`
  - device: `Speakers (Realtek High Definition Audio)`
  - sample rate: `48000 Hz`
  - channels: `2`
  - sample format: `Int`
  - captured frames: `24480`
  - captured bytes: `195840`
  - silent packets: `0`
  - duration: `500 ms`
- Result: microphone capture, output-device enumeration, and Windows WASAPI loopback are validated on Windows with metadata-only diagnostics. macOS capture and fallback behavior remain pending.
