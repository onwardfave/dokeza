# ADR 0001: Desktop Shell Framework

## Status

Accepted, pending implementation spike.

## Context

Dokeza needs a cross-platform desktop client for Windows and macOS. The client must support:

- A main application window.
- A live overlay or side panel.
- Global hotkeys.
- Microphone and system audio capture.
- Screen and active-window context.
- Local cache.
- WebSocket realtime protocol.
- Auto-update and rollback.
- Native OS permission flows.

The main candidates are Tauri v2 and Electron.

## Decision

Use Tauri v2 as the default desktop shell for Dokeza.

Electron remains the fallback if the desktop spike exposes blocker-level issues in overlay behavior, audio capture, WebView consistency, packaging, or update safety.

## Rationale

Tauri v2 is the better default for Dokeza because:

- Rust is a strong fit for native audio capture, VAD, chunking, local cache, and protocol handling.
- The memory footprint is materially smaller than Electron for an always-running assistant.
- The security model is tighter by default.
- Native OS integration is a first-class part of the application model.
- The desktop backend can share Rust patterns with future local-first processing components.

Electron remains viable because:

- It has a more mature ecosystem.
- It has more examples for transparent windows and desktop utilities.
- It can be easier for a JS-heavy team to staff quickly.

## Spike Acceptance Criteria

Before full implementation commits to Tauri, build a 1-2 week spike that proves:

- Transparent overlay window on Windows and macOS.
- Always-on-top behavior.
- Global hotkeys.
- Microphone capture.
- System audio capture or a documented platform fallback.
- WebSocket streaming using the realtime protocol.
- Local SQLite cache access.
- Auto-update path.
- Signed installer path.
- Basic crash diagnostics.

## Reversal Conditions

Switch to Electron if any of the following are true after the spike:

- Overlay behavior is unreliable across supported OS versions.
- Audio capture requires excessive unsafe native workarounds.
- Auto-update or rollback is not production-viable.
- WebView behavior creates unacceptable UI inconsistency.
- The team cannot maintain the Rust/native boundary safely.

## Consequences

- Desktop-native work should be planned around Rust capabilities.
- Frontend UI can still use React and TypeScript inside the WebView.
- Native plugin boundaries must be carefully documented.
- The desktop architecture should keep platform-specific code isolated behind adapters.

