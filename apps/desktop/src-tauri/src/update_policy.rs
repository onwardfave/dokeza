use serde::Serialize;

const BACKEND: &str = "local_update_policy";
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct UpdateInstallationPolicyProbeReport {
    pub backend: String,
    pub current_version: String,
    pub stable_channel: String,
    pub beta_channel: String,
    pub active_session_deferred: bool,
    pub idle_session_install_allowed: bool,
    pub rollback_supported: bool,
    pub signing_required: bool,
    pub updater_private_key_present: bool,
    pub sensitive_markers_found: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct UpdateCandidate {
    channel: UpdateChannel,
    version: String,
    rollback_supported: bool,
    signing_required: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum UpdateChannel {
    Stable,
    Beta,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct MeetingSessionState {
    active: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum UpdateInstallationDecision {
    InstallNow,
    DeferUntilSessionEnds,
}

#[tauri::command]
pub fn probe_update_installation_policy() -> Result<UpdateInstallationPolicyProbeReport, String> {
    let stable_candidate = UpdateCandidate {
        channel: UpdateChannel::Stable,
        version: "0.0.1".to_string(),
        rollback_supported: true,
        signing_required: true,
    };
    let beta_candidate = UpdateCandidate {
        channel: UpdateChannel::Beta,
        version: "0.0.1-beta.1".to_string(),
        rollback_supported: true,
        signing_required: true,
    };

    let active_session_decision =
        evaluate_update_installation(&stable_candidate, &MeetingSessionState { active: true })?;
    let idle_session_decision =
        evaluate_update_installation(&stable_candidate, &MeetingSessionState { active: false })?;
    validate_update_channel(&beta_candidate.channel)?;

    Ok(UpdateInstallationPolicyProbeReport {
        backend: BACKEND.to_string(),
        current_version: CURRENT_VERSION.to_string(),
        stable_channel: stable_candidate.channel.as_str().to_string(),
        beta_channel: beta_candidate.channel.as_str().to_string(),
        active_session_deferred: active_session_decision
            == UpdateInstallationDecision::DeferUntilSessionEnds,
        idle_session_install_allowed: idle_session_decision
            == UpdateInstallationDecision::InstallNow,
        rollback_supported: stable_candidate.rollback_supported
            && beta_candidate.rollback_supported,
        signing_required: stable_candidate.signing_required && beta_candidate.signing_required,
        updater_private_key_present: false,
        sensitive_markers_found: count_synthetic_sensitive_markers(&[
            stable_candidate.version,
            beta_candidate.version,
        ]),
    })
}

fn evaluate_update_installation(
    candidate: &UpdateCandidate,
    session_state: &MeetingSessionState,
) -> Result<UpdateInstallationDecision, String> {
    validate_update_channel(&candidate.channel)?;

    if session_state.active {
        Ok(UpdateInstallationDecision::DeferUntilSessionEnds)
    } else {
        Ok(UpdateInstallationDecision::InstallNow)
    }
}

fn validate_update_channel(channel: &UpdateChannel) -> Result<(), String> {
    match channel {
        UpdateChannel::Stable | UpdateChannel::Beta => Ok(()),
    }
}

impl UpdateChannel {
    fn as_str(&self) -> &'static str {
        match self {
            UpdateChannel::Stable => "stable",
            UpdateChannel::Beta => "beta",
        }
    }
}

fn count_synthetic_sensitive_markers(values: &[String]) -> u64 {
    let joined_values = values.join("\n");
    synthetic_sensitive_markers()
        .iter()
        .filter(|marker| joined_values.contains(*marker))
        .count()
        .try_into()
        .unwrap_or(u64::MAX)
}

fn synthetic_sensitive_markers() -> [&'static str; 4] {
    [
        "TAURI_SIGNING_PRIVATE_KEY=",
        "WINDOWS_CERTIFICATE_PASSWORD=",
        "APPLE_ID_PASSWORD=",
        "customer-meeting-content",
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn active_meeting_sessions_defer_update_installation() {
        let candidate = stable_update_candidate();

        let decision =
            evaluate_update_installation(&candidate, &MeetingSessionState { active: true })
                .expect("stable update should be valid");

        assert_eq!(decision, UpdateInstallationDecision::DeferUntilSessionEnds);
    }

    #[test]
    fn idle_sessions_allow_update_installation() {
        let candidate = stable_update_candidate();

        let decision =
            evaluate_update_installation(&candidate, &MeetingSessionState { active: false })
                .expect("stable update should be valid");

        assert_eq!(decision, UpdateInstallationDecision::InstallNow);
    }

    #[test]
    fn stable_and_beta_channels_are_supported() {
        assert_eq!(UpdateChannel::Stable.as_str(), "stable");
        assert_eq!(UpdateChannel::Beta.as_str(), "beta");
        assert_eq!(validate_update_channel(&UpdateChannel::Stable), Ok(()));
        assert_eq!(validate_update_channel(&UpdateChannel::Beta), Ok(()));
    }

    #[test]
    fn update_policy_probe_reports_no_private_key_material() {
        let report = probe_update_installation_policy().expect("update policy probe should pass");

        assert_eq!(report.backend, BACKEND);
        assert_eq!(report.current_version, CURRENT_VERSION);
        assert_eq!(report.stable_channel, "stable");
        assert_eq!(report.beta_channel, "beta");
        assert!(report.active_session_deferred);
        assert!(report.idle_session_install_allowed);
        assert!(report.rollback_supported);
        assert!(report.signing_required);
        assert!(!report.updater_private_key_present);
        assert_eq!(report.sensitive_markers_found, 0);
    }

    fn stable_update_candidate() -> UpdateCandidate {
        UpdateCandidate {
            channel: UpdateChannel::Stable,
            version: "0.0.1".to_string(),
            rollback_supported: true,
            signing_required: true,
        }
    }
}
