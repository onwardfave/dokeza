use std::{
    fs,
    panic::PanicHookInfo,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use tauri::{AppHandle, Manager};

const BACKEND: &str = "local_redacted_crash_report";
const REPORT_SCHEMA_VERSION: &str = "local_crash_report.v1";
const REPORT_DIRECTORY_NAME: &str = "crash-reports";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CrashDiagnosticsProbeReport {
    pub backend: String,
    pub report_file_name: String,
    pub schema_version: String,
    pub panic_message_redacted: bool,
    pub full_path_returned: bool,
    pub written_bytes: u64,
    pub sensitive_markers_found: u64,
    pub redacted_field_count: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
struct LocalCrashReport {
    schema_version: String,
    app_version: String,
    platform: String,
    timestamp_ms: u128,
    process_id: u32,
    panic_payload_kind: String,
    panic_message_redacted: bool,
    location_file_name: Option<String>,
    location_line: Option<u32>,
    location_column: Option<u32>,
    redacted_fields: Vec<String>,
}

#[tauri::command]
pub fn probe_crash_diagnostics(
    app_handle: AppHandle,
) -> Result<CrashDiagnosticsProbeReport, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;

    probe_crash_diagnostics_at(&app_data_dir)
}

pub fn install_panic_hook(app_data_dir: PathBuf) {
    let previous_hook = std::panic::take_hook();

    std::panic::set_hook(Box::new(move |panic_info| {
        let reports_dir = app_data_dir.join(REPORT_DIRECTORY_NAME);
        let report = redacted_crash_report_from_panic(panic_info, current_timestamp_ms());
        let _ = write_crash_report_at(&reports_dir, &report);

        previous_hook(panic_info);
    }));
}

pub fn probe_crash_diagnostics_at(
    app_data_dir: &Path,
) -> Result<CrashDiagnosticsProbeReport, String> {
    let reports_dir = app_data_dir.join(REPORT_DIRECTORY_NAME);
    let report = synthetic_redacted_crash_report(current_timestamp_ms());
    let write_result = write_crash_report_at(&reports_dir, &report)?;
    let serialized_report =
        fs::read(write_result.report_path).map_err(|error| error.to_string())?;

    Ok(CrashDiagnosticsProbeReport {
        backend: BACKEND.to_string(),
        report_file_name: write_result.report_file_name,
        schema_version: REPORT_SCHEMA_VERSION.to_string(),
        panic_message_redacted: report.panic_message_redacted,
        full_path_returned: false,
        written_bytes: write_result.written_bytes,
        sensitive_markers_found: count_synthetic_sensitive_markers(&serialized_report),
        redacted_field_count: report
            .redacted_fields
            .len()
            .try_into()
            .map_err(|_| "crash_diagnostics_redacted_field_count_overflow".to_string())?,
    })
}

fn redacted_crash_report_from_panic(
    panic_info: &PanicHookInfo<'_>,
    timestamp_ms: u128,
) -> LocalCrashReport {
    let location = panic_info.location();

    LocalCrashReport {
        schema_version: REPORT_SCHEMA_VERSION.to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        platform: std::env::consts::OS.to_string(),
        timestamp_ms,
        process_id: std::process::id(),
        panic_payload_kind: panic_payload_kind(panic_info),
        panic_message_redacted: true,
        location_file_name: location.and_then(|location| path_file_name(location.file())),
        location_line: location.map(|location| location.line()),
        location_column: location.map(|location| location.column()),
        redacted_fields: vec!["panic_payload".to_string()],
    }
}

fn synthetic_redacted_crash_report(timestamp_ms: u128) -> LocalCrashReport {
    LocalCrashReport {
        schema_version: REPORT_SCHEMA_VERSION.to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        platform: std::env::consts::OS.to_string(),
        timestamp_ms,
        process_id: std::process::id(),
        panic_payload_kind: "synthetic_probe".to_string(),
        panic_message_redacted: true,
        location_file_name: Some("synthetic_probe.rs".to_string()),
        location_line: Some(1),
        location_column: Some(1),
        redacted_fields: vec!["panic_payload".to_string()],
    }
}

struct CrashReportWriteResult {
    report_file_name: String,
    report_path: PathBuf,
    written_bytes: u64,
}

fn write_crash_report_at(
    reports_dir: &Path,
    report: &LocalCrashReport,
) -> Result<CrashReportWriteResult, String> {
    fs::create_dir_all(reports_dir).map_err(|error| error.to_string())?;

    let report_file_name = report_file_name(report.timestamp_ms);
    let report_path = reports_dir.join(&report_file_name);
    let report_bytes = serde_json::to_vec_pretty(report).map_err(|error| error.to_string())?;

    fs::write(&report_path, &report_bytes).map_err(|error| error.to_string())?;

    Ok(CrashReportWriteResult {
        report_file_name,
        report_path,
        written_bytes: report_bytes
            .len()
            .try_into()
            .map_err(|_| "crash_diagnostics_written_bytes_overflow".to_string())?,
    })
}

fn panic_payload_kind(panic_info: &PanicHookInfo<'_>) -> String {
    let payload = panic_info.payload();

    if payload.is::<&str>() {
        "str".to_string()
    } else if payload.is::<String>() {
        "string".to_string()
    } else {
        "unknown".to_string()
    }
}

fn current_timestamp_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn report_file_name(timestamp_ms: u128) -> String {
    format!(
        "dokeza-crash-report-{timestamp_ms}-{}.json",
        std::process::id()
    )
}

fn path_file_name(path: &str) -> Option<String> {
    Path::new(path)
        .file_name()
        .and_then(|file_name| file_name.to_str())
        .map(str::to_string)
}

fn count_synthetic_sensitive_markers(report_bytes: &[u8]) -> u64 {
    let report = String::from_utf8_lossy(report_bytes);
    synthetic_sensitive_markers()
        .iter()
        .filter(|marker| report.contains(*marker))
        .count()
        .try_into()
        .unwrap_or(u64::MAX)
}

fn synthetic_sensitive_markers() -> [&'static str; 5] {
    [
        "customer-secret-transcript",
        "raw-prompt-body",
        "internal-document-content",
        "generated-suggestion-content",
        "raw-audio-bytes",
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn synthetic_crash_report_serializes_without_sensitive_content() {
        let report = synthetic_redacted_crash_report(1);
        let report_json = serde_json::to_string(&report).expect("report should serialize");

        assert!(report.panic_message_redacted);
        assert_eq!(report.panic_payload_kind, "synthetic_probe");
        for marker in synthetic_sensitive_markers() {
            assert!(!report_json.contains(marker));
        }
    }

    #[test]
    fn crash_diagnostics_probe_writes_report_and_returns_file_name_only() {
        let app_data_dir = unique_test_directory();

        let report =
            probe_crash_diagnostics_at(&app_data_dir).expect("crash diagnostics probe should pass");

        assert_eq!(report.backend, BACKEND);
        assert_eq!(report.schema_version, REPORT_SCHEMA_VERSION);
        assert!(report.panic_message_redacted);
        assert!(!report.full_path_returned);
        assert_eq!(report.sensitive_markers_found, 0);
        assert_eq!(report.redacted_field_count, 1);
        assert!(report.written_bytes > 0);
        assert!(!report.report_file_name.contains('\\'));
        assert!(!report.report_file_name.contains('/'));
        assert!(app_data_dir
            .join(REPORT_DIRECTORY_NAME)
            .join(&report.report_file_name)
            .is_file());

        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn path_file_name_drops_parent_directories() {
        assert_eq!(
            path_file_name("/tmp/dokeza/main.rs").as_deref(),
            Some("main.rs")
        );
    }

    fn unique_test_directory() -> PathBuf {
        let unique_suffix = format!(
            "{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("test clock should be after unix epoch")
                .as_nanos()
        );

        std::env::temp_dir().join(format!("dokeza-crash-diagnostics-{unique_suffix}"))
    }
}
