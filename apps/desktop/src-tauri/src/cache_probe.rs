use std::{fs, path::Path};

use rusqlite::{params, Connection};
use serde::Serialize;
use tauri::{AppHandle, Manager};

const PROBE_DATABASE_FILE_NAME: &str = "capability-probe.sqlite3";
const PROBE_SCHEMA_VERSION: u32 = 1;
const PROBE_KEY: &str = "synthetic-cache-probe";
const PROBE_VALUE: &str = "synthetic-cache-value";
const PROBE_CREATED_AT: &str = "2026-06-14T00:00:00.000Z";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LocalSqliteCacheProbeReport {
    pub backend: String,
    pub database_file_name: String,
    pub schema_version: u32,
    pub created_parent_directory: bool,
    pub inserted_rows: u64,
    pub read_rows: u64,
    pub deleted_rows: u64,
    pub remaining_probe_rows: u64,
}

#[tauri::command]
pub fn probe_local_sqlite_cache(
    app_handle: AppHandle,
) -> Result<LocalSqliteCacheProbeReport, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let database_path = app_data_dir.join(PROBE_DATABASE_FILE_NAME);

    probe_local_sqlite_cache_at(&database_path)
}

pub fn probe_local_sqlite_cache_at(
    database_path: &Path,
) -> Result<LocalSqliteCacheProbeReport, String> {
    let created_parent_directory = ensure_parent_directory(database_path)?;
    let connection = Connection::open(database_path).map_err(|error| error.to_string())?;

    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS capability_probe (
                key TEXT PRIMARY KEY NOT NULL,
                value TEXT NOT NULL,
                created_at TEXT NOT NULL
            );",
        )
        .map_err(|error| error.to_string())?;

    let inserted_rows = connection
        .execute(
            "INSERT OR REPLACE INTO capability_probe (key, value, created_at)
                VALUES (?1, ?2, ?3);",
            params![PROBE_KEY, PROBE_VALUE, PROBE_CREATED_AT],
        )
        .map_err(|error| error.to_string())?;

    let read_rows = sqlite_count_to_u64(
        connection
            .query_row(
                "SELECT COUNT(*)
                    FROM capability_probe
                    WHERE key = ?1 AND value = ?2;",
                params![PROBE_KEY, PROBE_VALUE],
                |row| row.get::<_, i64>(0),
            )
            .map_err(|error| error.to_string())?,
    )?;

    let deleted_rows = connection
        .execute(
            "DELETE FROM capability_probe
                WHERE key = ?1;",
            params![PROBE_KEY],
        )
        .map_err(|error| error.to_string())?;

    let remaining_probe_rows = sqlite_count_to_u64(
        connection
            .query_row(
                "SELECT COUNT(*)
                    FROM capability_probe
                    WHERE key = ?1;",
                params![PROBE_KEY],
                |row| row.get::<_, i64>(0),
            )
            .map_err(|error| error.to_string())?,
    )?;

    Ok(LocalSqliteCacheProbeReport {
        backend: "sqlite".to_string(),
        database_file_name: database_file_name(database_path)?,
        schema_version: PROBE_SCHEMA_VERSION,
        created_parent_directory,
        inserted_rows: inserted_rows
            .try_into()
            .map_err(|_| "sqlite_inserted_rows_overflow".to_string())?,
        read_rows,
        deleted_rows: deleted_rows
            .try_into()
            .map_err(|_| "sqlite_deleted_rows_overflow".to_string())?,
        remaining_probe_rows,
    })
}

fn sqlite_count_to_u64(count: i64) -> Result<u64, String> {
    count
        .try_into()
        .map_err(|_| "sqlite_negative_row_count".to_string())
}

fn ensure_parent_directory(database_path: &Path) -> Result<bool, String> {
    let parent = database_path
        .parent()
        .ok_or_else(|| "sqlite_probe_parent_missing".to_string())?;
    let existed_before = parent.exists();

    fs::create_dir_all(parent).map_err(|error| error.to_string())?;

    Ok(!existed_before)
}

fn database_file_name(database_path: &Path) -> Result<String, String> {
    database_path
        .file_name()
        .and_then(|file_name| file_name.to_str())
        .map(str::to_string)
        .ok_or_else(|| "sqlite_probe_database_file_name_missing".to_string())
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    #[test]
    fn sqlite_cache_probe_creates_writes_reads_and_deletes_synthetic_row() {
        let database_path = unique_test_database_path();

        let report = probe_local_sqlite_cache_at(&database_path).expect("sqlite probe should pass");

        assert_eq!(
            report,
            LocalSqliteCacheProbeReport {
                backend: "sqlite".to_string(),
                database_file_name: database_path
                    .file_name()
                    .and_then(|file_name| file_name.to_str())
                    .expect("test database file name should be unicode")
                    .to_string(),
                schema_version: PROBE_SCHEMA_VERSION,
                created_parent_directory: true,
                inserted_rows: 1,
                read_rows: 1,
                deleted_rows: 1,
                remaining_probe_rows: 0,
            }
        );

        let _ = fs::remove_file(database_path);
    }

    #[test]
    fn sqlite_cache_probe_report_does_not_include_probe_value() {
        let report = LocalSqliteCacheProbeReport {
            backend: "sqlite".to_string(),
            database_file_name: PROBE_DATABASE_FILE_NAME.to_string(),
            schema_version: PROBE_SCHEMA_VERSION,
            created_parent_directory: false,
            inserted_rows: 1,
            read_rows: 1,
            deleted_rows: 1,
            remaining_probe_rows: 0,
        };

        assert_eq!(report.database_file_name, PROBE_DATABASE_FILE_NAME);
    }

    #[test]
    fn sqlite_count_rejects_negative_values() {
        assert_eq!(
            sqlite_count_to_u64(-1),
            Err("sqlite_negative_row_count".to_string())
        );
    }

    fn unique_test_database_path() -> PathBuf {
        let unique_suffix = format!(
            "{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("test clock should be after unix epoch")
                .as_nanos()
        );

        std::env::temp_dir()
            .join(format!("dokeza-cache-probe-{unique_suffix}"))
            .join(PROBE_DATABASE_FILE_NAME)
    }
}
