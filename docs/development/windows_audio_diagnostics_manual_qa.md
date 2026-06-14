# Windows Audio Diagnostics Manual QA

## Purpose

Use this checklist to validate the Tauri desktop capability diagnostics panel on Windows. The panel is a local capability-spike surface for Milestone 1 desktop work. It returns metadata only and must not log, save, display, or transmit raw microphone audio, system audio, transcripts, prompts, documents, or suggestions.

## Prerequisites

- Windows 10 version 2004 or later, or Windows 11.
- Latest `main` checked out.
- Node, pnpm, Rust, Cargo, and Tauri prerequisites installed.
- At least one microphone input device.
- At least one system output device.
- Audible system audio available for the loopback test.

## Start The App

```powershell
git pull
pnpm install
pnpm --filter @dokeza/desktop tauri dev
```

The desktop main window should show the `Capability QA` diagnostics panel. Browser preview can render the UI, but it cannot run native probes because normal browser tabs cannot call Tauri commands or Windows WASAPI.

## Browser Preview Check

1. Start only the Vite dev server:

   ```powershell
   pnpm --filter @dokeza/desktop dev
   ```

2. Open `http://localhost:1420`.
3. Confirm the diagnostics status reads `Browser preview`.
4. Confirm the probe buttons are disabled.

Expected result: browser preview is useful for layout inspection only. It is not valid WASAPI QA.

## Native Runtime Check

1. Start the Tauri app:

   ```powershell
   pnpm --filter @dokeza/desktop tauri dev
   ```

2. Confirm the diagnostics status reads `Native runtime`.
3. Confirm the `Microphone`, `Outputs`, and `Loopback` buttons are enabled.

Expected result: the panel is available only inside the Tauri runtime.

## Microphone Probe

1. Select the main Dokeza window.
2. Click `Microphone`.
3. If Windows prompts for microphone access, allow it for this QA pass.
4. Speak or generate sound near the default microphone during the short probe.

Pass criteria:

- The probe completes without crashing the app.
- The result message is `microphone_probe_completed`.
- The result shows a device, sample rate, channel count, sample format, captured frames, and duration.
- `captured_frames` is greater than `0` when the microphone receives input.
- No raw audio bytes or transcript text appear in the UI or terminal output.

## Output Device Enumeration

1. Click `Outputs`.

Pass criteria:

- The result message is `output_devices_listed`.
- The result shows `Device count`.
- At least one output device is listed on a machine with available speakers, headphones, HDMI audio, or virtual output devices.
- Device names are shown as local metadata only.

## Windows WASAPI Loopback Probe

1. Start audible system audio from a non-Dokeza app, such as a browser video, media player, meeting app test sound, or music app.
2. Confirm the selected Windows default output device is not muted.
3. Click `Loopback`.

Pass criteria:

- The probe completes without crashing the app.
- The result message is `system_loopback_probe_completed`.
- `Backend` is `wasapi_loopback`.
- `Device` matches or plausibly maps to the active default Windows output device.
- `Sample rate` is greater than `0`.
- `Channels` is greater than `0`.
- `Captured frames` is greater than `0` while system audio is playing.
- `Captured bytes` is greater than `0` while system audio is playing.
- `Duration` is approximately `500 ms`.
- No raw system audio bytes are displayed, logged, saved, or transmitted.

## Silence And Device Switching

1. Stop all audible system audio.
2. Click `Loopback` again.
3. Change the Windows default output device.
4. Play audible system audio through the new default output.
5. Click `Outputs`, then `Loopback`.

Pass criteria:

- Silence does not crash the app.
- Loopback may report silent packets or low captured activity during silence.
- Output enumeration reflects the available devices.
- The loopback device name follows the new default render device where Windows exposes it.

## Local SQLite Cache Probe

1. Click `Local cache`.

Pass criteria:

- The result message is `local_sqlite_cache_probe_completed`.
- `Backend` is `sqlite`.
- `Database file` is `capability-probe.sqlite3`.
- `Schema version` is `1`.
- `Inserted rows` is `1`.
- `Read rows` is `1`.
- `Deleted rows` is `1`.
- `Remaining probe rows` is `0`.
- The result does not show the full local filesystem path.
- The result does not show transcript, prompt, document, suggestion, meeting, or raw audio content.

## Failure Notes

Record the following for failures:

- Windows version.
- Physical or virtual audio device names.
- Whether system audio was audible before the loopback probe.
- Exact result message or error code.
- Whether the app crashed, froze, or stayed responsive.

Do not attach recordings, transcripts, meeting content, or raw audio dumps to QA notes.
