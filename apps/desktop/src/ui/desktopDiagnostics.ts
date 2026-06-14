import { invoke as tauriInvoke } from "@tauri-apps/api/core";

export type AudioProbeReport = {
  device_name: string | null;
  sample_rate_hz: number;
  channels: number;
  sample_format: string;
  captured_frames: number;
  duration_ms: number;
};

export type AudioDeviceSummary = {
  name: string | null;
};

export type SystemAudioLoopbackProbeReport = {
  backend: "wasapi_loopback";
  device_name: string | null;
  sample_rate_hz: number;
  channels: number;
  sample_format: string;
  captured_frames: number;
  captured_bytes: number;
  silent_packets: number;
  duration_ms: number;
};

export type LocalSqliteCacheProbeReport = {
  backend: "sqlite";
  database_file_name: string;
  schema_version: number;
  created_parent_directory: boolean;
  inserted_rows: number;
  read_rows: number;
  deleted_rows: number;
  remaining_probe_rows: number;
};

export type CrashDiagnosticsProbeReport = {
  backend: "local_redacted_crash_report";
  report_file_name: string;
  schema_version: string;
  panic_message_redacted: boolean;
  full_path_returned: boolean;
  written_bytes: number;
  sensitive_markers_found: number;
  redacted_field_count: number;
};

export type DiagnosticAction =
  | "microphone"
  | "outputDevices"
  | "systemLoopback"
  | "localCache"
  | "crashDiagnostics";

export type DiagnosticStatus = "idle" | "running" | "passed" | "failed" | "unavailable";

export type DiagnosticDetails =
  | AudioProbeReport
  | AudioDeviceSummary[]
  | SystemAudioLoopbackProbeReport
  | LocalSqliteCacheProbeReport
  | CrashDiagnosticsProbeReport;

export type DiagnosticOutcome = {
  action: DiagnosticAction;
  status: Exclude<DiagnosticStatus, "idle" | "running">;
  message: string;
  details?: DiagnosticDetails;
};

export type TauriRuntime = {
  __TAURI_INTERNALS__?: unknown;
};

export type TauriInvoke = <T>(command: string) => Promise<T>;

export function isTauriRuntime(runtime: TauriRuntime = globalThis as TauriRuntime): boolean {
  return runtime.__TAURI_INTERNALS__ !== undefined;
}

export async function runDesktopDiagnostic(
  action: DiagnosticAction,
  invoke: TauriInvoke = tauriInvoke,
  runtime: TauriRuntime = globalThis as TauriRuntime,
): Promise<DiagnosticOutcome> {
  if (!isTauriRuntime(runtime)) {
    return {
      action,
      status: "unavailable",
      message: "native_runtime_unavailable",
    };
  }

  try {
    switch (action) {
      case "microphone": {
        const details = await invoke<AudioProbeReport>("probe_default_microphone");

        return {
          action,
          status: "passed",
          message: "microphone_probe_completed",
          details,
        };
      }
      case "outputDevices": {
        const details = await invoke<AudioDeviceSummary[]>("list_system_audio_output_devices");

        return {
          action,
          status: "passed",
          message: "output_devices_listed",
          details,
        };
      }
      case "systemLoopback": {
        const details = await invoke<SystemAudioLoopbackProbeReport>("probe_system_audio_loopback");

        return {
          action,
          status: "passed",
          message: "system_loopback_probe_completed",
          details,
        };
      }
      case "localCache": {
        const details = await invoke<LocalSqliteCacheProbeReport>("probe_local_sqlite_cache");

        return {
          action,
          status: "passed",
          message: "local_sqlite_cache_probe_completed",
          details,
        };
      }
      case "crashDiagnostics": {
        const details = await invoke<CrashDiagnosticsProbeReport>("probe_crash_diagnostics");

        return {
          action,
          status: "passed",
          message: "crash_diagnostics_probe_completed",
          details,
        };
      }
    }
  } catch (error) {
    return {
      action,
      status: "failed",
      message: normalizeDiagnosticError(error),
    };
  }
}

export function formatDiagnosticDetails(details: DiagnosticDetails): [string, string][] {
  if (Array.isArray(details)) {
    return [
      ["Device count", details.length.toString()],
      ...details.map(
        (device, index) =>
          [`Device ${index + 1}`, device.name ?? "Unnamed device"] satisfies [string, string],
      ),
    ];
  }

  if ("backend" in details) {
    if (details.backend === "sqlite") {
      return [
        ["Backend", details.backend],
        ["Database file", details.database_file_name],
        ["Schema version", details.schema_version.toString()],
        ["Created parent directory", details.created_parent_directory ? "Yes" : "No"],
        ["Inserted rows", details.inserted_rows.toString()],
        ["Read rows", details.read_rows.toString()],
        ["Deleted rows", details.deleted_rows.toString()],
        ["Remaining probe rows", details.remaining_probe_rows.toString()],
      ];
    }

    if (details.backend === "local_redacted_crash_report") {
      return [
        ["Backend", details.backend],
        ["Report file", details.report_file_name],
        ["Schema version", details.schema_version],
        ["Panic message redacted", details.panic_message_redacted ? "Yes" : "No"],
        ["Full path returned", details.full_path_returned ? "Yes" : "No"],
        ["Written bytes", details.written_bytes.toString()],
        ["Sensitive markers found", details.sensitive_markers_found.toString()],
        ["Redacted fields", details.redacted_field_count.toString()],
      ];
    }

    return [
      ["Backend", details.backend],
      ["Device", details.device_name ?? "Default render device"],
      ["Sample rate", `${details.sample_rate_hz} Hz`],
      ["Channels", details.channels.toString()],
      ["Sample format", details.sample_format],
      ["Captured frames", details.captured_frames.toString()],
      ["Captured bytes", details.captured_bytes.toString()],
      ["Silent packets", details.silent_packets.toString()],
      ["Duration", `${details.duration_ms} ms`],
    ];
  }

  return [
    ["Device", details.device_name ?? "Default input device"],
    ["Sample rate", `${details.sample_rate_hz} Hz`],
    ["Channels", details.channels.toString()],
    ["Sample format", details.sample_format],
    ["Captured frames", details.captured_frames.toString()],
    ["Duration", `${details.duration_ms} ms`],
  ];
}

function normalizeDiagnosticError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "diagnostic_probe_failed";
}
