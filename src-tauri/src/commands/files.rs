use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LaunchFileRequest {
    pub path: String,
    pub kind: String,
}

#[derive(Default)]
pub struct LaunchFileState(pub Mutex<Option<LaunchFileRequest>>);

impl LaunchFileState {
    pub fn from_env_args() -> Self {
        Self(Mutex::new(parse_launch_file_from_args(std::env::args().skip(1))))
    }
}

pub fn parse_launch_file_from_args_with_cwd<I: IntoIterator<Item = String>>(
    args: I,
    cwd: Option<&Path>,
) -> Option<LaunchFileRequest> {
    for arg in args {
        let trimmed = arg.trim();
        if trimmed.is_empty() || trimmed.starts_with('-') {
            continue;
        }
        let raw_path = Path::new(trimmed);
        let candidate = if raw_path.is_relative() {
            match cwd {
                Some(base) => base.join(raw_path),
                None => raw_path.to_path_buf(),
            }
        } else {
            raw_path.to_path_buf()
        };
        let ext = candidate
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_ascii_lowercase());
        let kind = match ext.as_deref() {
            Some("typ") => "typ",
            Some("pdf") => "pdf",
            _ => continue,
        };
        if !candidate.is_file() {
            continue;
        }
        let resolved = std::fs::canonicalize(&candidate).unwrap_or(candidate);
        return Some(LaunchFileRequest {
            path: resolved.to_string_lossy().to_string(),
            kind: kind.to_string(),
        });
    }
    None
}

pub fn parse_launch_file_from_args<I: IntoIterator<Item = String>>(
    args: I,
) -> Option<LaunchFileRequest> {
    parse_launch_file_from_args_with_cwd(args, None)
}

pub fn is_allowed_markdown_write_path(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_ascii_lowercase())
            .as_deref(),
        Some("md") | Some("markdown")
    )
}

#[tauri::command]
pub fn get_launch_file(state: State<'_, LaunchFileState>) -> Option<LaunchFileRequest> {
    state.0.lock().ok().and_then(|mut guard| guard.take())
}

#[tauri::command]
pub async fn pick_notes_file(app: AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let picked = app
            .dialog()
            .file()
            .add_filter("Speaker Notes", &["md", "markdown", "json", "pdfpc"])
            .blocking_pick_file();
        Ok(picked.and_then(|fp| fp.into_path().ok().map(|p| p.to_string_lossy().to_string())))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn read_local_text_file(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read {path}: {e}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn write_local_text_file(path: String, content: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target = PathBuf::from(&path);
        if !is_allowed_markdown_write_path(&target) {
            return Err("Only .md or .markdown files can be overwritten directly.".to_string());
        }
        std::fs::write(&target, content.as_bytes())
            .map_err(|e| format!("Failed to write {path}: {e}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn read_local_binary_file(path: String) -> Result<tauri::ipc::Response, String> {
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        std::fs::read(&path).map_err(|e| format!("Failed to read {path}: {e}"))
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn rejects_non_markdown_write_paths() {
        assert!(is_allowed_markdown_write_path(Path::new("notes.md")));
        assert!(is_allowed_markdown_write_path(Path::new("notes.MARKDOWN")));
        assert!(!is_allowed_markdown_write_path(Path::new("slides.typ")));
        assert!(!is_allowed_markdown_write_path(Path::new("notes.json")));
        assert!(!is_allowed_markdown_write_path(Path::new("deck.pdf")));
    }

    #[test]
    fn parses_launch_file_ignoring_flags_and_missing_files() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let tmp_dir = std::env::temp_dir().join(format!("tp-launch-test-{unique}"));
        std::fs::create_dir_all(&tmp_dir).unwrap();
        let typ_path = tmp_dir.join("talk.typ");
        std::fs::write(&typ_path, "= Hello").unwrap();

        let parsed = parse_launch_file_from_args(vec![
            "--fullscreen".to_string(),
            "nonexistent.typ".to_string(),
            typ_path.to_string_lossy().to_string(),
        ]);

        assert!(parsed.is_some());
        let req = parsed.unwrap();
        assert_eq!(req.kind, "typ");
        assert!(req.path.ends_with("talk.typ"));

        let _ = std::fs::remove_dir_all(&tmp_dir);
    }

    #[test]
    fn resolves_relative_launch_file_against_cwd() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let tmp_dir = std::env::temp_dir().join(format!("tp-launch-cwd-test-{unique}"));
        let sub_dir = tmp_dir.join("slides");
        std::fs::create_dir_all(&sub_dir).unwrap();
        let pdf_path = sub_dir.join("deck.pdf");
        std::fs::write(&pdf_path, b"%PDF-1.4").unwrap();

        let parsed = parse_launch_file_from_args_with_cwd(
            vec!["slides/deck.pdf".to_string()],
            Some(tmp_dir.as_path()),
        );

        assert!(parsed.is_some());
        let req = parsed.unwrap();
        assert_eq!(req.kind, "pdf");
        assert!(req.path.ends_with("deck.pdf"));

        let _ = std::fs::remove_dir_all(&tmp_dir);
    }
}
