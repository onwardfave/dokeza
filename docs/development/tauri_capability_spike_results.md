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
| WebSocket streaming using realtime protocol | Build viability pass | Native `tungstenite 0.28.0` proof opens a local loopback WebSocket, sends existing protocol control messages plus a synthetic binary PCM frame, validates strict `audio.chunk_meta` then binary ordering, and returns metadata-only diagnostics. | Run the diagnostics `Realtime WS` action manually on Windows and macOS; later promote the proof into a production client abstraction with auth, reconnect, backpressure, and buffering. |
| Local SQLite cache access | Build viability pass | `rusqlite 0.40.1` with bundled SQLite is wired behind a metadata-only Tauri command; native unit tests verify create/write/read/delete of a synthetic row; the diagnostics panel can run the local cache probe in Tauri. | Run the diagnostics `Local cache` action manually on Windows and macOS; later replace the synthetic table with production session/cache schema. |
| Auto-update path | Pipeline design pass | Native update policy proof verifies active-session deferral and idle-session install allowance; non-secret release metadata defines stable/beta updater endpoint templates and previous-known-good rollback mode; CI validates release config with `pnpm desktop:release:check`. | Wire policy to production meeting session state and Tauri updater install flow once real update hosting and signing keys exist. |
| Signed installer path | Pipeline design pass | `apps/desktop/release.desktop.json` names required updater, Windows signing, and macOS signing/notarization environment variables; CI validates that release metadata requires signed artifacts and does not contain private key or password markers. | Provision real Windows/macOS signing credentials outside the repo and add signed release workflow. |
| Basic crash diagnostics | Build viability pass | A local panic hook writes redacted JSON crash metadata under the Tauri app-data directory; diagnostics panel exposes a synthetic `Crash diagnostics` probe; Rust tests verify no synthetic sensitive markers are serialized and command output returns file-name-only metadata. | Run the diagnostics action manually on Windows and macOS; decide later whether to add external crash reporting, retention cleanup, and user-facing export/delete controls. |

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

- Added a main-window `Capability QA` diagnostics panel for local manual testing.
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

### 2026-06-14: Local SQLite Cache Proof

- Added `rusqlite 0.40.1` with bundled SQLite so the desktop native layer can use SQLite without requiring a system SQLite install.
- Added `probe_local_sqlite_cache` as a Tauri command.
- The command resolves the Tauri app-data directory, opens `capability-probe.sqlite3`, creates a synthetic `capability_probe` table, writes one synthetic row, reads it back, deletes it, and reports operation counts.
- The command returns metadata only:
  - backend name
  - database file name
  - schema version
  - whether the parent directory had to be created
  - inserted row count
  - read row count
  - deleted row count
  - remaining synthetic probe rows
- The command does not return the full local path and does not persist transcript, prompt, document, suggestion, raw audio, or meeting content.
- Added a `Local cache` action to the diagnostics panel.
- Verification:
  - Rust unit tests for create/write/read/delete behavior and metadata-only report shape.
  - Frontend unit tests for Tauri command dispatch and metadata-only formatting.
  - `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
  - `pnpm --filter @dokeza/desktop test`
- Result: build viability for local SQLite cache access passes. Manual runtime validation through the diagnostics panel remains pending on Windows and macOS.

### 2026-06-14: Local Redacted Crash Diagnostics Proof

- Added a local panic hook in the Tauri native layer.
- The hook writes JSON crash report metadata under the Tauri app-data directory in `crash-reports`.
- Report schema version: `local_crash_report.v1`.
- The report records operational metadata only:
  - app version
  - platform
  - timestamp
  - process id
  - panic payload kind
  - source file name, line, and column when available
  - redaction status
- The report does not persist the panic message text and does not include transcript, prompt, document, suggestion, screen, or audio content.
- Added `probe_crash_diagnostics` as a Tauri command for manual QA without crashing the app.
- Added a `Crash diagnostics` action to the diagnostics panel.
- Verification:
  - Rust unit tests for redacted report serialization and file-name-only command output.
  - Frontend unit tests for Tauri command dispatch and metadata-only formatting.
  - `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
  - `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings`
  - `pnpm --filter @dokeza/desktop test`
  - `pnpm --filter @dokeza/desktop typecheck`
- Result: build viability for local redacted crash diagnostics passes. Runtime validation through the diagnostics panel remains pending on Windows and macOS.

### 2026-06-14: Native Realtime WebSocket Protocol Proof

- Added `tungstenite 0.28.0` for native Rust WebSocket capability validation.
- Added `probe_realtime_websocket` as a Tauri diagnostics command.
- The command starts a local loopback WebSocket endpoint for the duration of the probe, then the native client sends:
  - `auth.hello`
  - `session.start`
  - `audio.chunk_meta`
  - one synthetic binary PCM payload frame
  - `audio.gap`
  - `session.end`
- The local endpoint responds with `auth.accepted` and `session.closed`.
- The endpoint validates that the binary frame immediately follows `audio.chunk_meta` and that its byte length matches `payload.byte_length`.
- The command returns metadata only:
  - protocol version
  - transport and endpoint class
  - outbound and inbound JSON counts
  - outbound and observed binary frame counts
  - synthetic audio byte count
  - audio gap flag
  - last client sequence number
  - synthetic sensitive marker count
  - probe duration
- The probe uses synthetic silence-like PCM bytes and does not capture, return, log, or persist real audio, transcripts, prompts, documents, suggestions, or screen content.
- Added a `Realtime WS` action to the diagnostics panel.
- Verification:
  - Rust tests for message ordering, monotonic sequences, byte-length matching, marker exclusion, and local loopback completion.
  - Frontend tests for Tauri command dispatch and metadata-only formatting.
  - `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
  - `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings`
  - `pnpm --filter @dokeza/desktop test`
  - `pnpm --filter @dokeza/desktop typecheck`
- Result: build viability for native WebSocket protocol streaming passes. Production reconnect, authenticated backend transport, backpressure handling, and local buffering remain future implementation work.

### 2026-06-14: Desktop Release Operations Proof

- Added native update installation policy logic.
- Added `probe_update_installation_policy` as a Tauri diagnostics command.
- The command verifies:
  - active meeting sessions defer update installation
  - idle sessions allow update installation
  - stable and beta channels are represented
  - rollback support is required
  - signing is required
  - updater private key material is absent from the diagnostic result
- Added a non-secret release metadata file at `apps/desktop/release.desktop.json`.
- Added `scripts/desktop-release/validate-release-config.mjs`.
- Added root script `pnpm desktop:release:check`.
- Added the release configuration validator to CI.
- Added `docs/devops/desktop_release_operations.md`.
- Verification:
  - Rust tests for active-session deferral, idle install allowance, supported channels, and metadata-only diagnostics.
  - Frontend tests for Tauri command dispatch and metadata-only formatting.
  - Release metadata validation for stable/beta channels, HTTPS endpoint templates, required signing environment variable names, rollback mode, and absence of known secret markers.
  - `pnpm desktop:release:check`
  - `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
  - `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings`
  - `pnpm --filter @dokeza/desktop test`
  - `pnpm --filter @dokeza/desktop typecheck`
- Result: pipeline design viability for auto-update deferral and signed installer path passes without committing release credentials. Production signed artifacts and live updater hosting remain future release workflow work.
