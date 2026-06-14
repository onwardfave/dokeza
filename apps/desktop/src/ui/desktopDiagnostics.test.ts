import { describe, expect, it, vi } from "vitest";
import {
  formatDiagnosticDetails,
  isTauriRuntime,
  runDesktopDiagnostic,
  type SystemAudioLoopbackProbeReport,
} from "./desktopDiagnostics.js";

describe("desktop diagnostics", () => {
  it("detects when the diagnostics panel is running outside Tauri", () => {
    expect(isTauriRuntime({})).toBe(false);
    expect(isTauriRuntime({ __TAURI_INTERNALS__: {} })).toBe(true);
  });

  it("does not call native probes from a browser preview", async () => {
    const invoke = vi.fn();

    const outcome = await runDesktopDiagnostic("systemLoopback", invoke, {});

    expect(invoke).not.toHaveBeenCalled();
    expect(outcome.status).toBe("unavailable");
    expect(outcome.message).toBe("native_runtime_unavailable");
  });

  it("runs the Windows loopback probe through the registered Tauri command", async () => {
    const report: SystemAudioLoopbackProbeReport = {
      backend: "wasapi_loopback",
      device_name: "Synthetic speakers",
      sample_rate_hz: 48_000,
      channels: 2,
      sample_format: "Float",
      captured_frames: 24_000,
      captured_bytes: 192_000,
      silent_packets: 1,
      duration_ms: 500,
    };
    const invoke = vi.fn().mockResolvedValue(report);

    const outcome = await runDesktopDiagnostic("systemLoopback", invoke, {
      __TAURI_INTERNALS__: {},
    });

    expect(invoke).toHaveBeenCalledWith("probe_system_audio_loopback");
    expect(outcome).toEqual({
      action: "systemLoopback",
      status: "passed",
      message: "system_loopback_probe_completed",
      details: report,
    });
  });

  it("formats loopback probe output as metadata-only rows", () => {
    const rows = formatDiagnosticDetails({
      backend: "wasapi_loopback",
      device_name: "Synthetic speakers",
      sample_rate_hz: 48_000,
      channels: 2,
      sample_format: "Float",
      captured_frames: 24_000,
      captured_bytes: 192_000,
      silent_packets: 1,
      duration_ms: 500,
    });

    expect(rows).toEqual([
      ["Backend", "wasapi_loopback"],
      ["Device", "Synthetic speakers"],
      ["Sample rate", "48000 Hz"],
      ["Channels", "2"],
      ["Sample format", "Float"],
      ["Captured frames", "24000"],
      ["Captured bytes", "192000"],
      ["Silent packets", "1"],
      ["Duration", "500 ms"],
    ]);
  });
});
