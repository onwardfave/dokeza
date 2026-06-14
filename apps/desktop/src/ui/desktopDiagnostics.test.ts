import { describe, expect, it, vi } from "vitest";
import {
  formatDiagnosticDetails,
  isTauriRuntime,
  runDesktopDiagnostic,
  type CrashDiagnosticsProbeReport,
  type LocalSqliteCacheProbeReport,
  type RealtimeWebSocketProbeReport,
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

  it("runs the local SQLite cache probe through the registered Tauri command", async () => {
    const report: LocalSqliteCacheProbeReport = {
      backend: "sqlite",
      database_file_name: "capability-probe.sqlite3",
      schema_version: 1,
      created_parent_directory: false,
      inserted_rows: 1,
      read_rows: 1,
      deleted_rows: 1,
      remaining_probe_rows: 0,
    };
    const invoke = vi.fn().mockResolvedValue(report);

    const outcome = await runDesktopDiagnostic("localCache", invoke, {
      __TAURI_INTERNALS__: {},
    });

    expect(invoke).toHaveBeenCalledWith("probe_local_sqlite_cache");
    expect(outcome).toEqual({
      action: "localCache",
      status: "passed",
      message: "local_sqlite_cache_probe_completed",
      details: report,
    });
  });

  it("runs the crash diagnostics probe through the registered Tauri command", async () => {
    const report: CrashDiagnosticsProbeReport = {
      backend: "local_redacted_crash_report",
      report_file_name: "dokeza-crash-report-1-2.json",
      schema_version: "local_crash_report.v1",
      panic_message_redacted: true,
      full_path_returned: false,
      written_bytes: 320,
      sensitive_markers_found: 0,
      redacted_field_count: 1,
    };
    const invoke = vi.fn().mockResolvedValue(report);

    const outcome = await runDesktopDiagnostic("crashDiagnostics", invoke, {
      __TAURI_INTERNALS__: {},
    });

    expect(invoke).toHaveBeenCalledWith("probe_crash_diagnostics");
    expect(outcome).toEqual({
      action: "crashDiagnostics",
      status: "passed",
      message: "crash_diagnostics_probe_completed",
      details: report,
    });
  });

  it("runs the realtime WebSocket probe through the registered Tauri command", async () => {
    const report: RealtimeWebSocketProbeReport = {
      backend: "local_realtime_websocket",
      protocol_version: "2026-06-12",
      transport: "websocket",
      endpoint: "loopback",
      outbound_json_messages: 5,
      outbound_binary_frames: 1,
      inbound_json_messages: 2,
      server_observed_json_messages: 5,
      server_observed_binary_frames: 1,
      audio_chunk_bytes_sent: 4,
      audio_gap_sent: true,
      last_client_seq: 4,
      sensitive_markers_found: 0,
      duration_ms: 10,
    };
    const invoke = vi.fn().mockResolvedValue(report);

    const outcome = await runDesktopDiagnostic("realtimeWebSocket", invoke, {
      __TAURI_INTERNALS__: {},
    });

    expect(invoke).toHaveBeenCalledWith("probe_realtime_websocket");
    expect(outcome).toEqual({
      action: "realtimeWebSocket",
      status: "passed",
      message: "realtime_websocket_probe_completed",
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

  it("formats local SQLite cache output without full paths or row content", () => {
    const rows = formatDiagnosticDetails({
      backend: "sqlite",
      database_file_name: "capability-probe.sqlite3",
      schema_version: 1,
      created_parent_directory: false,
      inserted_rows: 1,
      read_rows: 1,
      deleted_rows: 1,
      remaining_probe_rows: 0,
    });

    expect(rows).toEqual([
      ["Backend", "sqlite"],
      ["Database file", "capability-probe.sqlite3"],
      ["Schema version", "1"],
      ["Created parent directory", "No"],
      ["Inserted rows", "1"],
      ["Read rows", "1"],
      ["Deleted rows", "1"],
      ["Remaining probe rows", "0"],
    ]);
  });

  it("formats crash diagnostics output without full paths or content", () => {
    const rows = formatDiagnosticDetails({
      backend: "local_redacted_crash_report",
      report_file_name: "dokeza-crash-report-1-2.json",
      schema_version: "local_crash_report.v1",
      panic_message_redacted: true,
      full_path_returned: false,
      written_bytes: 320,
      sensitive_markers_found: 0,
      redacted_field_count: 1,
    });

    expect(rows).toEqual([
      ["Backend", "local_redacted_crash_report"],
      ["Report file", "dokeza-crash-report-1-2.json"],
      ["Schema version", "local_crash_report.v1"],
      ["Panic message redacted", "Yes"],
      ["Full path returned", "No"],
      ["Written bytes", "320"],
      ["Sensitive markers found", "0"],
      ["Redacted fields", "1"],
    ]);
  });

  it("formats realtime WebSocket output without payload content", () => {
    const rows = formatDiagnosticDetails({
      backend: "local_realtime_websocket",
      protocol_version: "2026-06-12",
      transport: "websocket",
      endpoint: "loopback",
      outbound_json_messages: 5,
      outbound_binary_frames: 1,
      inbound_json_messages: 2,
      server_observed_json_messages: 5,
      server_observed_binary_frames: 1,
      audio_chunk_bytes_sent: 4,
      audio_gap_sent: true,
      last_client_seq: 4,
      sensitive_markers_found: 0,
      duration_ms: 10,
    });

    expect(rows).toEqual([
      ["Backend", "local_realtime_websocket"],
      ["Protocol version", "2026-06-12"],
      ["Transport", "websocket"],
      ["Endpoint", "loopback"],
      ["Outbound JSON messages", "5"],
      ["Outbound binary frames", "1"],
      ["Inbound JSON messages", "2"],
      ["Server JSON messages", "5"],
      ["Server binary frames", "1"],
      ["Audio chunk bytes sent", "4"],
      ["Audio gap sent", "Yes"],
      ["Last client sequence", "4"],
      ["Sensitive markers found", "0"],
      ["Duration", "10 ms"],
    ]);
  });
});
