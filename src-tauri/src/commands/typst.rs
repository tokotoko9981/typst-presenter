use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[cfg(windows)]
const TYPST_EXE_NAME: &str = "typst.exe";
#[cfg(not(windows))]
const TYPST_EXE_NAME: &str = "typst";

const WATCHED_EXTENSIONS: &[&str] = &[
    "typ", "bib", "yml", "yaml", "json", "csv", "toml", "png", "jpg", "jpeg", "svg",
];

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TypstCompileOptions {
    pub root: Option<String>,
    pub inputs: Option<Vec<String>>,
    pub font_paths: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TypstCliStatus {
    pub available: bool,
    pub version: Option<String>,
    pub path: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TypstCompileResultEvent {
    pub build_id: u64,
    pub file_path: String,
    pub file_name: String,
    pub ok: bool,
    pub duration_ms: u64,
    pub byte_length: Option<usize>,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub pdfpc_query_json: Option<String>,
}

#[derive(Default)]
pub struct TypstWatchState {
    pub active_stop: Mutex<Option<Arc<AtomicBool>>>,
    pub watcher: Mutex<Option<RecommendedWatcher>>,
    pub last_good_pdf: Arc<Mutex<Option<Vec<u8>>>>,
    pub build_counter: Arc<AtomicU64>,
}

fn create_hidden_command(program: &std::ffi::OsStr) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

pub fn resolve_typst_in_dirs(dirs: &[PathBuf], exe_name: &str) -> Option<PathBuf> {
    for dir in dirs {
        let candidate = dir.join(exe_name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

fn push_unique_dir(dirs: &mut Vec<PathBuf>, dir: PathBuf) {
    if !dir.as_os_str().is_empty() && !dirs.iter().any(|existing| existing == &dir) {
        dirs.push(dir);
    }
}

fn default_typst_search_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(path_var) = std::env::var_os("PATH") {
        for entry in std::env::split_paths(&path_var) {
            push_unique_dir(&mut dirs, entry);
        }
    }
    if let Some(cargo_home) = std::env::var_os("CARGO_HOME") {
        push_unique_dir(&mut dirs, PathBuf::from(cargo_home).join("bin"));
    }

    #[cfg(windows)]
    {
        if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") {
            let base = PathBuf::from(local_app_data);
            push_unique_dir(&mut dirs, base.join("Microsoft").join("WinGet").join("Links"));
            push_unique_dir(&mut dirs, base.join("Programs").join("Typst"));
        }
        if let Some(user_profile) = std::env::var_os("USERPROFILE") {
            let home = PathBuf::from(user_profile);
            push_unique_dir(&mut dirs, home.join(".cargo").join("bin"));
            push_unique_dir(&mut dirs, home.join("scoop").join("shims"));
        }
        push_unique_dir(&mut dirs, PathBuf::from(r"C:\Program Files\Typst"));
    }

    #[cfg(target_os = "macos")]
    {
        push_unique_dir(&mut dirs, PathBuf::from("/opt/homebrew/bin"));
        push_unique_dir(&mut dirs, PathBuf::from("/usr/local/bin"));
        if let Some(home) = std::env::var_os("HOME") {
            let home_dir = PathBuf::from(home);
            push_unique_dir(&mut dirs, home_dir.join(".cargo").join("bin"));
            push_unique_dir(&mut dirs, home_dir.join(".local").join("bin"));
        }
        push_unique_dir(&mut dirs, PathBuf::from("/opt/local/bin"));
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Some(home) = std::env::var_os("HOME") {
            let home_dir = PathBuf::from(home);
            push_unique_dir(&mut dirs, home_dir.join(".cargo").join("bin"));
            push_unique_dir(&mut dirs, home_dir.join(".local").join("bin"));
        }
        push_unique_dir(&mut dirs, PathBuf::from("/usr/local/bin"));
        push_unique_dir(&mut dirs, PathBuf::from("/usr/bin"));
        push_unique_dir(&mut dirs, PathBuf::from("/snap/bin"));
    }

    dirs
}

fn create_typst_command() -> (Command, Option<String>) {
    if let Some(path) = resolve_typst_in_dirs(&default_typst_search_dirs(), TYPST_EXE_NAME) {
        let resolved_str = path.to_string_lossy().to_string();
        let cmd = create_hidden_command(path.as_os_str());
        return (cmd, Some(resolved_str));
    }
    (create_hidden_command(std::ffi::OsStr::new("typst")), None)
}

pub fn is_relevant_watch_path(path: &Path) -> bool {
    for component in path.components() {
        if let std::path::Component::Normal(os_name) = component {
            let s = os_name.to_string_lossy();
            if s == ".git" || s == "node_modules" || s == "target" || s.starts_with('.') {
                if s != "." && s != ".." {
                    return false;
                }
            }
        }
    }
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_ascii_lowercase());
    matches!(ext.as_deref(), Some(e) if WATCHED_EXTENSIONS.contains(&e))
}

fn append_common_typst_args(cmd: &mut Command, options: &TypstCompileOptions) {
    if let Some(root) = options.root.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        cmd.arg("--root").arg(root);
    }
    if let Some(inputs) = &options.inputs {
        for kv in inputs {
            let trimmed = kv.trim();
            if !trimmed.is_empty() {
                cmd.arg("--input").arg(trimmed);
            }
        }
    }
    if let Some(font_paths) = &options.font_paths {
        for dir in font_paths {
            let trimmed = dir.trim();
            if !trimmed.is_empty() {
                cmd.arg("--font-path").arg(trimmed);
            }
        }
    }
}

pub fn compile_typst_blocking(
    app: &AppHandle,
    last_good_pdf: &Arc<Mutex<Option<Vec<u8>>>>,
    build_counter: &Arc<AtomicU64>,
    file_path: &Path,
    options: &TypstCompileOptions,
) -> TypstCompileResultEvent {
    let build_id = build_counter.fetch_add(1, Ordering::SeqCst) + 1;
    let started = Instant::now();
    let file_path_str = file_path.to_string_lossy().to_string();
    let file_name = file_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("slides.typ")
        .to_string();

    let tmp_pdf = std::env::temp_dir().join(format!(
        "typst-presenter-{}-{build_id}.pdf",
        std::process::id()
    ));

    let (mut compile_cmd, _) = create_typst_command();
    compile_cmd
        .arg("compile")
        .arg("--diagnostic-format")
        .arg("short");
    append_common_typst_args(&mut compile_cmd, options);
    compile_cmd.arg(file_path).arg(&tmp_pdf);

    let output = match compile_cmd.output() {
        Ok(out) => out,
        Err(err) => {
            let _ = std::fs::remove_file(&tmp_pdf);
            let evt = TypstCompileResultEvent {
                build_id,
                file_path: file_path_str,
                file_name,
                ok: false,
                duration_ms: started.elapsed().as_millis() as u64,
                byte_length: None,
                stderr: format!("Failed to invoke typst CLI: {err}"),
                exit_code: None,
                pdfpc_query_json: None,
            };
            let _ = app.emit("typst-compile-result", &evt);
            return evt;
        }
    };

    let stderr_str = String::from_utf8_lossy(&output.stderr).to_string();
    let exit_code = output.status.code();

    if !output.status.success() {
        // Live Compile Guard: keep `last_good_pdf` untouched on failure.
        let _ = std::fs::remove_file(&tmp_pdf);
        let evt = TypstCompileResultEvent {
            build_id,
            file_path: file_path_str,
            file_name,
            ok: false,
            duration_ms: started.elapsed().as_millis() as u64,
            byte_length: None,
            stderr: stderr_str,
            exit_code,
            pdfpc_query_json: None,
        };
        let _ = app.emit("typst-compile-result", &evt);
        return evt;
    }

    let pdf_bytes = match std::fs::read(&tmp_pdf) {
        Ok(bytes) => {
            let _ = std::fs::remove_file(&tmp_pdf);
            bytes
        }
        Err(err) => {
            let _ = std::fs::remove_file(&tmp_pdf);
            let evt = TypstCompileResultEvent {
                build_id,
                file_path: file_path_str,
                file_name,
                ok: false,
                duration_ms: started.elapsed().as_millis() as u64,
                byte_length: None,
                stderr: format!("Compiled PDF could not be read: {err}"),
                exit_code,
                pdfpc_query_json: None,
            };
            let _ = app.emit("typst-compile-result", &evt);
            return evt;
        }
    };

    let byte_length = pdf_bytes.len();
    if let Ok(mut guard) = last_good_pdf.lock() {
        *guard = Some(pdf_bytes);
    }

    // Best-effort `<pdfpc>` metadata query for Polylux/Touying compatibility (Appendix A Option 1).
    let (mut query_cmd, _) = create_typst_command();
    query_cmd
        .arg("query")
        .arg("--format")
        .arg("json")
        .arg("--field")
        .arg("value");
    append_common_typst_args(&mut query_cmd, options);
    query_cmd.arg(file_path).arg("<pdfpc>");

    let pdfpc_query_json = query_cmd.output().ok().and_then(|q_out| {
        if q_out.status.success() {
            let text = String::from_utf8_lossy(&q_out.stdout).trim().to_string();
            if !text.is_empty() && text != "[]" {
                return Some(text);
            }
        }
        None
    });

    let evt = TypstCompileResultEvent {
        build_id,
        file_path: file_path_str,
        file_name,
        ok: true,
        duration_ms: started.elapsed().as_millis() as u64,
        byte_length: Some(byte_length),
        stderr: stderr_str,
        exit_code,
        pdfpc_query_json,
    };
    let _ = app.emit("typst-compile-result", &evt);
    evt
}

fn stop_existing_watch(state: &TypstWatchState) {
    if let Ok(mut stop_guard) = state.active_stop.lock() {
        if let Some(flag) = stop_guard.take() {
            flag.store(true, Ordering::SeqCst);
        }
    }
    if let Ok(mut watcher_guard) = state.watcher.lock() {
        *watcher_guard = None;
    }
}

#[tauri::command]
pub async fn check_typst_cli() -> Result<TypstCliStatus, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let (mut cmd, resolved_path) = create_typst_command();
        let out = cmd.arg("--version").output();
        match out {
            Ok(res) if res.status.success() => {
                let version = String::from_utf8_lossy(&res.stdout).trim().to_string();
                TypstCliStatus {
                    available: true,
                    version: if version.is_empty() { None } else { Some(version) },
                    path: resolved_path,
                    error: None,
                }
            }
            Ok(res) => TypstCliStatus {
                available: false,
                version: None,
                path: None,
                error: Some(String::from_utf8_lossy(&res.stderr).trim().to_string()),
            },
            Err(err) => TypstCliStatus {
                available: false,
                version: None,
                path: None,
                error: Some(err.to_string()),
            },
        }
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_typst_fonts(font_paths: Option<Vec<String>>) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (mut cmd, _) = create_typst_command();
        cmd.arg("fonts");
        if let Some(paths) = font_paths {
            for dir in paths {
                let trimmed = dir.trim();
                if !trimmed.is_empty() {
                    cmd.arg("--font-path").arg(trimmed);
                }
            }
        }
        let out = cmd.output().map_err(|e| format!("Failed to run typst fonts: {e}"))?;
        if !out.status.success() {
            return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
        }
        let mut set = BTreeSet::new();
        for line in String::from_utf8_lossy(&out.stdout).lines() {
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                set.insert(trimmed.to_string());
            }
        }
        Ok(set.into_iter().collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn pick_typst_file(app: AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let picked = app
            .dialog()
            .file()
            .add_filter("Typst Source", &["typ"])
            .blocking_pick_file();
        Ok(picked.and_then(|fp| fp.into_path().ok().map(|p| p.to_string_lossy().to_string())))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn start_typst_watch(
    app: AppHandle,
    state: State<'_, TypstWatchState>,
    file_path: String,
    options: Option<TypstCompileOptions>,
) -> Result<(), String> {
    stop_existing_watch(&state);

    let target = PathBuf::from(&file_path);
    if !target.is_file() {
        return Err(format!("Typst file not found: {file_path}"));
    }
    let canonical = std::fs::canonicalize(&target).unwrap_or(target);
    let compile_opts = options.unwrap_or_default();

    let stop_flag = Arc::new(AtomicBool::new(false));
    {
        let mut guard = state.active_stop.lock().map_err(|e| e.to_string())?;
        *guard = Some(Arc::clone(&stop_flag));
    }

    let last_good_pdf = Arc::clone(&state.last_good_pdf);
    let build_counter = Arc::clone(&state.build_counter);

    let app_init = app.clone();
    let canonical_init = canonical.clone();
    let opts_init = compile_opts.clone();
    let pdf_init = Arc::clone(&last_good_pdf);
    let counter_init = Arc::clone(&build_counter);
    tauri::async_runtime::spawn_blocking(move || {
        compile_typst_blocking(
            &app_init,
            &pdf_init,
            &counter_init,
            &canonical_init,
            &opts_init,
        );
    })
    .await
    .map_err(|e| e.to_string())?;

    let (tx, rx) = mpsc::channel::<()>();
    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                if event.paths.iter().any(|p| is_relevant_watch_path(p)) {
                    let _ = tx.send(());
                }
            }
        },
        Config::default(),
    )
    .map_err(|e| format!("Failed to create file watcher: {e}"))?;

    let parent_dir = canonical
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));
    watcher
        .watch(&parent_dir, RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch directory: {e}"))?;

    if let Some(root_str) = compile_opts.root.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        let root_path = PathBuf::from(root_str);
        if root_path.is_dir() && root_path != parent_dir {
            let _ = watcher.watch(&root_path, RecursiveMode::Recursive);
        }
    }

    {
        let mut guard = state.watcher.lock().map_err(|e| e.to_string())?;
        *guard = Some(watcher);
    }

    std::thread::spawn(move || {
        let debounce = Duration::from_millis(250);
        while !stop_flag.load(Ordering::SeqCst) {
            match rx.recv_timeout(Duration::from_millis(250)) {
                Ok(()) => {
                    while rx.recv_timeout(debounce).is_ok() {
                        if stop_flag.load(Ordering::SeqCst) {
                            return;
                        }
                    }
                    if stop_flag.load(Ordering::SeqCst) {
                        return;
                    }
                    compile_typst_blocking(
                        &app,
                        &last_good_pdf,
                        &build_counter,
                        &canonical,
                        &compile_opts,
                    );
                }
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_typst_watch(state: State<'_, TypstWatchState>) -> Result<(), String> {
    stop_existing_watch(&state);
    Ok(())
}

#[tauri::command]
pub async fn read_compiled_pdf(
    state: State<'_, TypstWatchState>,
) -> Result<tauri::ipc::Response, String> {
    let bytes = state
        .last_good_pdf
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "No compiled PDF available yet.".to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filters_watched_extensions_and_ignored_dirs() {
        assert!(is_relevant_watch_path(Path::new("deck/slides.typ")));
        assert!(is_relevant_watch_path(Path::new("deck/refs.bib")));
        assert!(is_relevant_watch_path(Path::new("deck/fig.png")));
        assert!(!is_relevant_watch_path(Path::new("deck/slides.pdf")));
        assert!(!is_relevant_watch_path(Path::new("deck/.git/index")));
        assert!(!is_relevant_watch_path(Path::new("deck/node_modules/a.typ")));
        assert!(!is_relevant_watch_path(Path::new("deck/target/tmp.typ")));
    }

    #[test]
    fn resolves_typst_binary_from_fallback_dir() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("tp-typst-resolve-{unique}"));
        let first_dir = root.join("empty");
        let second_dir = root.join("fallback");
        std::fs::create_dir_all(&first_dir).unwrap();
        std::fs::create_dir_all(&second_dir).unwrap();

        let binary = second_dir.join(TYPST_EXE_NAME);
        std::fs::write(&binary, b"stub").unwrap();

        let resolved = resolve_typst_in_dirs(&[first_dir, second_dir], TYPST_EXE_NAME);
        assert_eq!(resolved.as_deref(), Some(binary.as_path()));

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn returns_none_when_typst_binary_missing() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let empty_dir = std::env::temp_dir().join(format!("tp-typst-missing-{unique}"));
        std::fs::create_dir_all(&empty_dir).unwrap();

        let resolved = resolve_typst_in_dirs(&[empty_dir.clone()], TYPST_EXE_NAME);
        assert!(resolved.is_none());

        let _ = std::fs::remove_dir_all(&empty_dir);
    }
}
