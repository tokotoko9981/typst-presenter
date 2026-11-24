mod commands;

use commands::files::LaunchFileState;
use commands::typst::TypstWatchState;
use commands::window::CloseGuardState;
use std::sync::atomic::Ordering;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(CloseGuardState::default())
        .manage(TypstWatchState::default())
        .manage(LaunchFileState::from_env_args())
        .on_window_event(|window, event| {
            if window.label() == "main" {
                match event {
                    tauri::WindowEvent::CloseRequested { api, .. } => {
                        let guard_enabled = window
                            .app_handle()
                            .try_state::<CloseGuardState>()
                            .map(|s| s.0.load(Ordering::SeqCst))
                            .unwrap_or(false);
                        if guard_enabled {
                            api.prevent_close();
                            let _ = window.emit("close-guard-blocked", ());
                        } else if let Some(audience) =
                            window.app_handle().get_webview_window("audience")
                        {
                            let _ = audience.destroy();
                        }
                    }
                    tauri::WindowEvent::Destroyed => {
                        if let Some(audience) = window.app_handle().get_webview_window("audience") {
                            let _ = audience.destroy();
                        }
                    }
                    _ => {}
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::window::list_monitors,
            commands::window::open_audience_window,
            commands::window::close_audience_window,
            commands::window::set_audience_fullscreen,
            commands::window::is_audience_fullscreen,
            commands::window::get_platform_info,
            commands::window::set_close_guard,
            commands::window::force_close_app,
            commands::typst::check_typst_cli,
            commands::typst::list_typst_fonts,
            commands::typst::pick_typst_file,
            commands::typst::start_typst_watch,
            commands::typst::stop_typst_watch,
            commands::typst::read_compiled_pdf,
            commands::files::get_launch_file,
            commands::files::pick_notes_file,
            commands::files::read_local_text_file,
            commands::files::write_local_text_file,
            commands::files::read_local_binary_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
