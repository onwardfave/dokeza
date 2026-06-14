mod audio_probe;
mod cache_probe;
mod crash_diagnostics;
mod shortcuts;

use audio_probe::{
    list_microphone_devices, list_system_audio_output_devices, probe_default_microphone,
    probe_system_audio_loopback,
};
use cache_probe::probe_local_sqlite_cache;
use crash_diagnostics::{install_panic_hook, probe_crash_diagnostics};
use shortcuts::{toggle_overlay_window, DEV_OVERLAY_TOGGLE_SHORTCUT};
use tauri::Manager;
use tauri_plugin_global_shortcut::ShortcutState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            install_panic_hook(
                app.path()
                    .app_data_dir()
                    .map_err(|error| Box::new(error) as Box<dyn std::error::Error>)?,
            );

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
        .invoke_handler(tauri::generate_handler![
            list_microphone_devices,
            list_system_audio_output_devices,
            probe_local_sqlite_cache,
            probe_crash_diagnostics,
            probe_default_microphone,
            probe_system_audio_loopback
        ])
        .run(tauri::generate_context!())
        .expect("error while running Dokeza desktop shell");
}
