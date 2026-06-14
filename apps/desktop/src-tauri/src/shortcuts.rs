use tauri::{AppHandle, Manager, Runtime};

pub const OVERLAY_WINDOW_LABEL: &str = "overlay";
pub const DEV_OVERLAY_TOGGLE_SHORTCUT: &str = "ctrl+alt+d";

pub fn toggle_overlay_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let Some(overlay) = app.get_webview_window(OVERLAY_WINDOW_LABEL) else {
        return Ok(());
    };

    if overlay.is_visible()? {
        overlay.hide()?;
    } else {
        overlay.show()?;
        overlay.set_focus()?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dev_overlay_shortcut_is_parseable() {
        let parsed = DEV_OVERLAY_TOGGLE_SHORTCUT.parse::<tauri_plugin_global_shortcut::Shortcut>();

        assert!(parsed.is_ok());
    }

    #[test]
    fn overlay_window_label_matches_tauri_config() {
        assert_eq!(OVERLAY_WINDOW_LABEL, "overlay");
    }
}
