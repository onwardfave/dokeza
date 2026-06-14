mod shortcuts;

use shortcuts::{toggle_overlay_window, DEV_OVERLAY_TOGGLE_SHORTCUT};
use tauri_plugin_global_shortcut::ShortcutState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_shortcuts([DEV_OVERLAY_TOGGLE_SHORTCUT])?
                    .with_handler(|app, _shortcut, event| {
                        if event.state == ShortcutState::Pressed {
                            let _ = toggle_overlay_window(app);
                        }
                    })
                    .build(),
            )?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Dokeza desktop shell");
}
