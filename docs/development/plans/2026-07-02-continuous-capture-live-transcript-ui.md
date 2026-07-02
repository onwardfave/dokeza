# Continuous Capture and Live Transcript UI Plan

Date: 2026-07-02

## Scope

This plan closes the remaining M1A.4 desktop microphone capture gaps and implements the M1A.5 live transcript UI surface needed for the first usable realtime vertical.

## Constraints

- Keep the existing realtime protocol unchanged.
- Preserve workspace-scoped realtime auth and avoid hardcoded tokens.
- Do not persist transcript text in local browser storage, diagnostics, logs, or telemetry.
- Treat microphone failure as degraded local capture state, not an app crash.

## Implementation Slices

1. Native microphone device state
   - Add a Tauri command that returns selectable microphone device summaries with stable per-enumeration ids.
   - Extend native capture to accept an optional selected device id while preserving default-device capture compatibility.
   - Keep output chunks as mono 16 kHz `pcm_s16le` 100 ms frames.

2. Continuous capture orchestration
   - Add a webview-side capture controller that repeatedly invokes bounded native capture windows and streams returned chunks to the realtime client.
   - Re-index chunks across capture windows so chunk ids, chunk indexes, and timestamps remain monotonic.
   - Support pause, resume, and stop states.
   - Emit existing `audio.gap` metadata for user pauses and device capture failures.

3. Realtime client support
   - Expose an intentional local audio gap method on the desktop realtime client.
   - Send the gap immediately while streaming and otherwise queue it with the existing audio buffer.

4. Live transcript UI
   - Add microphone device selection, capture state controls, and compact session status metrics.
   - Preserve partial-to-final transcript replacement.
   - Add a compact overlay transcript view fed by in-memory `BroadcastChannel` updates only.

## Verification

- Unit-test native source mapping, capture controller state transitions, chunk reindexing, and explicit audio gap emission.
- Typecheck and run desktop Vitest tests.
- Run Rust tests for the Tauri native layer.

## Follow-Up

- Replace repeated bounded capture windows with a long-lived native stream when Tauri event streaming is ready.
- Add OS-level microphone permission guidance once production packaging behavior is validated.
- Add system-audio capture after the microphone vertical is stable.
