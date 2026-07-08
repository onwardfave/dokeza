use keyring::Entry;
use serde::{Deserialize, Serialize};

const SERVICE_NAME: &str = "com.dokeza.desktop.auth";
const API_SESSION_ACCOUNT: &str = "api_session";

#[derive(Clone, Deserialize, Serialize)]
pub struct StoredApiSession {
    pub token: String,
    pub expires_at: String,
    pub user_id: String,
    pub workspace_id: String,
    pub provider_refresh_token: Option<String>,
    pub provider_domain: Option<String>,
    pub provider_client_id: Option<String>,
    pub provider_audience: Option<String>,
}

impl std::fmt::Debug for StoredApiSession {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("StoredApiSession")
            .field("token", &"[REDACTED]")
            .field("expires_at", &self.expires_at)
            .field("user_id", &self.user_id)
            .field("workspace_id", &self.workspace_id)
            .field(
                "provider_refresh_token",
                &self.provider_refresh_token.as_ref().map(|_| "[REDACTED]"),
            )
            .field("provider_domain", &self.provider_domain)
            .field("provider_client_id", &self.provider_client_id)
            .field("provider_audience", &self.provider_audience)
            .finish()
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct SecureTokenStorageReport {
    pub status: String,
}

#[tauri::command]
pub fn save_api_session(session: StoredApiSession) -> Result<SecureTokenStorageReport, String> {
    validate_api_session(&session)?;
    let payload = serialize_session(&session)?;
    api_session_entry()?
        .set_password(&payload)
        .map_err(|_| "secure_token_storage_unavailable".to_string())?;
    Ok(SecureTokenStorageReport {
        status: "saved".to_string(),
    })
}

#[tauri::command]
pub fn load_api_session() -> Result<Option<StoredApiSession>, String> {
    match api_session_entry()?.get_password() {
        Ok(payload) => deserialize_session(&payload).map(Some),
        Err(error) if is_missing_credential(&error) => Ok(None),
        Err(_) => Err("secure_token_storage_unavailable".to_string()),
    }
}

#[tauri::command]
pub fn clear_api_session() -> Result<SecureTokenStorageReport, String> {
    match api_session_entry()?.delete_credential() {
        Ok(()) => Ok(SecureTokenStorageReport {
            status: "cleared".to_string(),
        }),
        Err(error) if is_missing_credential(&error) => Ok(SecureTokenStorageReport {
            status: "cleared".to_string(),
        }),
        Err(_) => Err("secure_token_storage_unavailable".to_string()),
    }
}

fn api_session_entry() -> Result<Entry, String> {
    Entry::new(SERVICE_NAME, API_SESSION_ACCOUNT)
        .map_err(|_| "secure_token_storage_unavailable".to_string())
}

fn validate_api_session(session: &StoredApiSession) -> Result<(), String> {
    if session.token.trim().is_empty()
        || session.expires_at.trim().is_empty()
        || session.user_id.trim().is_empty()
        || session.workspace_id.trim().is_empty()
        || optional_is_empty(&session.provider_refresh_token)
        || optional_is_empty(&session.provider_domain)
        || optional_is_empty(&session.provider_client_id)
        || optional_is_empty(&session.provider_audience)
    {
        return Err("secure_token_storage_invalid_session".to_string());
    }

    Ok(())
}

fn optional_is_empty(value: &Option<String>) -> bool {
    value.as_ref().is_some_and(|inner| inner.trim().is_empty())
}

fn serialize_session(session: &StoredApiSession) -> Result<String, String> {
    serde_json::to_string(session).map_err(|_| "secure_token_storage_invalid_session".to_string())
}

fn deserialize_session(payload: &str) -> Result<StoredApiSession, String> {
    let session: StoredApiSession = serde_json::from_str(payload)
        .map_err(|_| "secure_token_storage_invalid_session".to_string())?;
    validate_api_session(&session)?;
    Ok(session)
}

fn is_missing_credential(error: &keyring::Error) -> bool {
    matches!(error, keyring::Error::NoEntry)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session() -> StoredApiSession {
        StoredApiSession {
            token: "api_secret_token".to_string(),
            expires_at: "2026-07-07T00:00:00.000Z".to_string(),
            user_id: "user_1".to_string(),
            workspace_id: "ws_1".to_string(),
            provider_refresh_token: Some("provider_refresh_secret".to_string()),
            provider_domain: Some("https://dokeza-alpha.us.auth0.com".to_string()),
            provider_client_id: Some("desktop_client_id".to_string()),
            provider_audience: Some("dokeza-api".to_string()),
        }
    }

    #[test]
    fn debug_output_redacts_token() {
        let rendered = format!("{:?}", session());

        assert!(rendered.contains("[REDACTED]"));
        assert!(!rendered.contains("api_secret_token"));
        assert!(!rendered.contains("provider_refresh_secret"));
    }

    #[test]
    fn session_round_trip_keeps_metadata() {
        let payload = serialize_session(&session()).expect("serialize");
        let decoded = deserialize_session(&payload).expect("deserialize");

        assert_eq!(decoded.token, "api_secret_token");
        assert_eq!(decoded.user_id, "user_1");
        assert_eq!(decoded.workspace_id, "ws_1");
        assert_eq!(
            decoded.provider_refresh_token,
            Some("provider_refresh_secret".to_string())
        );
    }

    #[test]
    fn invalid_sessions_fail_before_storage() {
        let mut invalid = session();
        invalid.token = " ".to_string();

        assert_eq!(
            validate_api_session(&invalid),
            Err("secure_token_storage_invalid_session".to_string())
        );
    }
}
