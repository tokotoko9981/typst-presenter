use serde::Serialize;
use tauri::window::Monitor;
use tauri::{
    AppHandle, Manager, PhysicalPosition, PhysicalSize, Position, Size, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub index: usize,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
    pub is_primary: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformInfo {
    pub runtime: String,
    pub os: String,
    pub arch: String,
    pub version: String,
}

fn monitors_match(a: &Monitor, b: &Monitor) -> bool {
    a.position() == b.position()
        && a.size() == b.size()
        && a.name() == b.name()
        && (a.scale_factor() - b.scale_factor()).abs() < f64::EPSILON
}

fn resolve_target_monitor(
    app: &AppHandle,
    monitor_index: Option<usize>,
) -> Result<Option<Monitor>, String> {
    let available = app.available_monitors().map_err(|e| e.to_string())?;
    if available.is_empty() {
        return Ok(None);
    }

    if let Some(idx) = monitor_index {
        let monitor = available
            .into_iter()
            .nth(idx)
            .ok_or_else(|| format!("Monitor index {idx} out of range"))?;
        return Ok(Some(monitor));
    }

    let primary = app.primary_monitor().map_err(|e| e.to_string())?;
    if let Some(ref primary_mon) = primary {
        if let Some(non_primary) = available.iter().find(|m| !monitors_match(m, primary_mon)) {
            return Ok(Some(non_primary.clone()));
        }
        return Ok(Some(primary_mon.clone()));
    }

    Ok(available.into_iter().next())
}

fn apply_monitor_and_fullscreen(
    window: &WebviewWindow,
    monitor: Option<&Monitor>,
    fullscreen: bool,
) -> Result<(), String> {
    // Exit fullscreen before relocating across monitors so OS window managers allow repositioning.
    if window.is_fullscreen().unwrap_or(false) {
        window.set_fullscreen(false).map_err(|e| e.to_string())?;
    }

    if let Some(mon) = monitor {
        let pos = mon.position();
        let size = mon.size();
        window
            .set_position(Position::Physical(PhysicalPosition::new(pos.x, pos.y)))
            .map_err(|e| e.to_string())?;
        window
            .set_size(Size::Physical(PhysicalSize::new(size.width, size.height)))
            .map_err(|e| e.to_string())?;
    }

    window.set_fullscreen(fullscreen).map_err(|e| e.to_string())?;
    let _ = window.unminimize();
    let _ = window.show();
    window.set_focus().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn list_monitors(app: AppHandle) -> Result<Vec<MonitorInfo>, String> {
    let available = app.available_monitors().map_err(|e| e.to_string())?;
    let primary = app.primary_monitor().map_err(|e| e.to_string())?;

    Ok(available
        .into_iter()
        .enumerate()
        .map(|(index, monitor)| {
            let pos = monitor.position();
            let size = monitor.size();
            let name = monitor
                .name()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .map(ToString::to_string)
                .unwrap_or_else(|| format!("Display {}", index + 1));
            let is_primary = match primary.as_ref() {
                Some(p) => monitors_match(&monitor, p),
                None => false,
            };

            MonitorInfo {
                index,
                name,
                x: pos.x,
                y: pos.y,
                width: size.width,
                height: size.height,
                scale_factor: monitor.scale_factor(),
                is_primary,
            }
        })
        .collect())
}

#[tauri::command]
pub fn open_audience_window(
    app: AppHandle,
    session_id: String,
    monitor_index: Option<usize>,
    fullscreen: bool,
) -> Result<(), String> {
    let target_monitor = resolve_target_monitor(&app, monitor_index)?;

    if let Some(existing) = app.get_webview_window("audience") {
        return apply_monitor_and_fullscreen(&existing, target_monitor.as_ref(), fullscreen);
    }

    let url = WebviewUrl::App(format!("index.html#/audience?session={}", session_id).into());
    let window = WebviewWindowBuilder::new(&app, "audience", url)
        .title("Typst Presenter - Audience")
        .inner_size(1280.0, 720.0)
        .resizable(true)
        .build()
        .map_err(|e| e.to_string())?;

    apply_monitor_and_fullscreen(&window, target_monitor.as_ref(), fullscreen)
}

#[tauri::command]
pub fn close_audience_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("audience") {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn set_audience_fullscreen(app: AppHandle, fullscreen: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("audience")
        .ok_or_else(|| "Audience window is not open".to_string())?;
    window.set_fullscreen(fullscreen).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_platform_info() -> PlatformInfo {
    PlatformInfo {
        runtime: "tauri".to_string(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_monitors,
            open_audience_window,
            close_audience_window,
            set_audience_fullscreen,
            get_platform_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
