# Desktop Microphone Stream Property Catalog

## System Under Test

The Tauri CPAL capture worker, bounded native queue, typed Tauri channel, TypeScript capture controller, and realtime audio/gap boundary.

## State and Concurrency Model

- One native microphone stream may be active per desktop process.
- CPAL's realtime callback downmixes audio and attempts a non-blocking enqueue without DSP or mutex work.
- A native worker drains the bounded sample queue, owns FFT resampling/chunk assembly, accepts pause/resume/stop commands, and sends typed events to the main WebView.
- The TypeScript controller owns protocol sequence/timeline metadata and converts pause, overflow, and device errors into `audio.gap` messages.
- Stop and app shutdown are terminal for the active native worker; stale start completions must not resurrect capture.

## Properties

1. Delivered audio is mono 16 kHz `pcm_s16le` in 100 ms / 3,200-byte chunks.
2. Chunk IDs, indexes, and timestamps are strictly monotonic across pause/resume.
3. The audio timeline advances across every reported gap; a later chunk never overlaps a gap.
4. Once the native pause acknowledgement arrives, no audio is delivered until the resume acknowledgement. Discarded pre-pause partial/queued samples and elapsed native pause time are represented by non-overlapping gap events before later audio.
5. Native queue capacity is fixed; the audio callback never blocks waiting for the WebView.
6. Every queue overflow becomes a `local_buffer_full` gap with a positive dropped-chunk count.
7. A device/stream error produces a sanitized code, a `device_unavailable` gap, and a failed state without crashing the process.
8. Start/start is idempotent at the controller and native boundary; stop is safe before or after asynchronous start completion.
9. Device identifiers are deterministic fingerprints of device names plus duplicate ordinal, rather than transient enumeration indexes.
10. Raw PCM and native provider/device error strings never enter logs, telemetry, or serialized error events.

## Minimal Test Topology

- Rust unit tests for downmixing, stable IDs, streaming resampler rate/chunk behavior, bounded overflow accounting, and lifecycle state helpers.
- TypeScript unit tests with an in-memory native stream handle and deterministic clock.
- Installed Windows build for physical permission/device lifecycle and long-duration soak evidence.

## Workloads

- Multiple callback batch sizes at 44.1 kHz and 48 kHz.
- Pause/resume after partial native and protocol chunks.
- More completed chunks than the native queue can hold.
- Stop while native start is unresolved.
- Duplicate-name device enumeration.

## Faults to Inject

- Start failure / permission denial.
- Runtime CPAL stream error or device unplug.
- WebView consumer stall causing bounded queue overflow.
- Repeated pause/resume and duplicate lifecycle commands.
- App teardown with active capture.

## Observability Needed

Only state, input/output format metadata, chunk counts, overflow counts, and sanitized failure codes. Never raw audio bytes, device error strings, transcript, or tokens.

## Open Risks

- Automated CI has no physical microphone and cannot prove OS permission UX, driver behavior, unplug/replug recovery, or 30/60-minute stability.
- CPAL device names are the most stable portable identifier currently exposed; duplicate-name ordinal can change if the OS reorders indistinguishable devices.
- Windows system-audio loopback remains a separate alpha scope decision.
