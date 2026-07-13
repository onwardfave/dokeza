mod audio_probe;
mod cache_probe;
mod crash_diagnostics;
mod hosted_auth_callback;
mod microphone_capture;
mod microphone_resampler;
mod microphone_stream;
mod realtime_probe;
mod secure_token_storage;
mod shortcuts;
mod update_policy;

use audio_probe::{
    list_microphone_devices, list_system_audio_output_devices, probe_default_microphone,
    probe_system_audio_loopback,
};
use cache_probe::probe_local_sqlite_cache;
use crash_diagnostics::{install_panic_hook, probe_crash_diagnostics};
use hosted_auth_callback::wait_for_hosted_auth_callback;
use microphone_capture::list_microphone_capture_devices;
use microphone_stream::{
    pause_microphone_stream, resume_microphone_stream, start_microphone_stream,
    stop_microphone_stream, MicrophoneStreamManager,
};
use realtime_probe::probe_realtime_websocket;
use secure_token_storage::{clear_api_session, load_api_session, save_api_session};
use shortcuts::{toggle_overlay_window, DEV_OVERLAY_TOGGLE_SHORTCUT};
use tauri::Manager;
use tauri_plugin_global_shortcut::ShortcutState;
use update_policy::probe_update_installation_policy;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(MicrophoneStreamManager::default())
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
            probe_realtime_websocket,
            probe_update_installation_policy,
            probe_default_microphone,
            list_microphone_capture_devices,
            start_microphone_stream,
            pause_microphone_stream,
            resume_microphone_stream,
            stop_microphone_stream,
            probe_system_audio_loopback,
            save_api_session,
            load_api_session,
            clear_api_session,
            wait_for_hosted_auth_callback
        ])
        .run(tauri::generate_context!())
        .expect("error while running Dokeza desktop shell");
}
