// Prevent a console window from opening alongside the app on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! The native half of MiniCode.
//!
//! Deliberately thin: a handful of `std::fs` wrappers behind one invariant --
//! every path a command touches must resolve inside the opened workspace, or
//! inside `~/.minicode` where user extensions live. The frontend never sends an
//! absolute path except when opening a folder, so that single guard covers the
//! whole surface.
//!
//! `tauri-plugin-fs` is deliberately not used. Hand-rolled commands are smaller,
//! and they let the guard live in one place rather than in a scope config.

use std::fs;
use std::io::ErrorKind;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{Manager, State};

/// The opened folder. Set by `set_workspace`, read by every path resolution.
#[derive(Default)]
struct Workspace(Mutex<Option<PathBuf>>);

#[derive(Serialize)]
struct Entry {
    name: String,
    path: String,
    #[serde(rename = "isDir")]
    is_dir: bool,
    size: u64,
}

#[derive(Serialize)]
struct Stat {
    size: u64,
    #[serde(rename = "isDir")]
    is_dir: bool,
    modified: f64,
}

#[derive(Serialize)]
struct Hit {
    path: String,
    line: usize,
    text: String,
}

/// Directories never worth walking, listing, or searching.
const SKIP: [&str; 6] = [".git", "node_modules", "dist", "target", ".DS_Store", ".cache"];

const MAX_SEARCH_BYTES: u64 = 2_000_000;

type Res<T> = Result<T, String>;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

fn minicode_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".minicode"))
}

/// Normalise a path lexically, resolving `.` and `..` without touching the
/// disk. Done before canonicalisation so a `..` in a path that does not exist
/// yet (a file about to be created) is still caught.
fn lexical_normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for part in path.components() {
        match part {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// The guard, as a pure function: no Tauri types, so it is directly testable.
///
/// Accepts either a workspace-relative path ("src/main.rs") or a home-relative
/// one ("~/.minicode/extensions"), and refuses anything that would land outside
/// the base it belongs to.
fn resolve_within(root: &Path, home: Option<&Path>, raw: &str) -> Res<PathBuf> {
    let (base, joined) = if let Some(rest) = raw.strip_prefix("~/") {
        let home = home.ok_or("no home directory")?;
        (home.join(".minicode"), home.join(rest))
    } else {
        (root.to_path_buf(), root.join(raw))
    };

    let candidate = lexical_normalize(&joined);

    // Two checks, because either alone has a hole.
    //
    // 1. Lexically, the normalised path must sit under the base. This catches
    //    `..` escapes and works for paths that do not exist yet -- a file about
    //    to be created, or ~/.minicode before the first extension is installed.
    if !candidate.starts_with(&base) {
        return Err("path escapes the workspace".into());
    }

    // 2. If any part of the path already exists, its canonical form must still
    //    sit under the base. This catches a symlink inside the workspace that
    //    points out of it -- which check 1 cannot see.
    if let Some(existing) = candidate.ancestors().find(|a| a.exists()) {
        // Only meaningful when the existing ancestor is itself inside the base;
        // above it there is nothing of ours left to escape from.
        if existing.starts_with(&base) {
            let real_existing = fs::canonicalize(existing).map_err(err)?;
            let real_base = fs::canonicalize(&base).map_err(err)?;
            if !real_existing.starts_with(&real_base) {
                return Err("path escapes the workspace via a symlink".into());
            }
        }
    }

    Ok(candidate)
}

/// Command-facing wrapper: pulls the open workspace out of state and applies
/// the guard above.
fn resolve(ws: &State<Workspace>, raw: &str) -> Res<PathBuf> {
    let root = ws
        .0
        .lock()
        .map_err(err)?
        .clone()
        .ok_or("no workspace is open")?;
    resolve_within(&root, dirs::home_dir().as_deref(), raw)
}

/// Render an absolute path back into the space the frontend sent it in.
fn display(ws: &State<Workspace>, abs: &Path) -> String {
    if let Some(home) = dirs::home_dir() {
        if let Ok(rest) = abs.strip_prefix(&home) {
            if abs.starts_with(home.join(".minicode")) {
                return format!("~/{}", rest.to_string_lossy().replace('\\', "/"));
            }
        }
    }
    let root = ws.0.lock().ok().and_then(|g| g.clone());
    match root.and_then(|r| abs.strip_prefix(r).ok().map(Path::to_path_buf)) {
        Some(rel) => rel.to_string_lossy().replace('\\', "/"),
        None => abs.to_string_lossy().replace('\\', "/"),
    }
}

/* --- commands ------------------------------------------------------------ */

#[tauri::command]
fn set_workspace(ws: State<Workspace>, path: String) -> Res<String> {
    let abs = fs::canonicalize(&path).map_err(err)?;
    if !abs.is_dir() {
        return Err("not a directory".into());
    }
    *ws.0.lock().map_err(err)? = Some(abs.clone());
    Ok(abs.to_string_lossy().into_owned())
}

#[tauri::command]
fn workspace_root(ws: State<Workspace>) -> Res<String> {
    ws.0.lock()
        .map_err(err)?
        .clone()
        .map(|p| p.to_string_lossy().into_owned())
        .ok_or_else(|| "no workspace is open".into())
}

#[tauri::command]
fn read_dir(ws: State<Workspace>, path: String) -> Res<Vec<Entry>> {
    let abs = resolve(&ws, &path)?;
    let mut out = Vec::new();

    for entry in fs::read_dir(&abs).map_err(err)? {
        let entry = entry.map_err(err)?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if SKIP.contains(&name.as_str()) {
            continue;
        }
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue, // a broken symlink is skipped, not fatal
        };
        out.push(Entry {
            path: display(&ws, &entry.path()),
            name,
            is_dir: meta.is_dir(),
            size: if meta.is_file() { meta.len() } else { 0 },
        });
    }

    // Directories first, then case-insensitive by name. Must match the dev
    // backend's ordering or the tree reshuffles between the two.
    out.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(out)
}

#[tauri::command]
fn read_file(ws: State<Workspace>, path: String) -> Res<String> {
    let abs = resolve(&ws, &path)?;
    fs::read_to_string(&abs).map_err(|e| match e.kind() {
        ErrorKind::InvalidData => "file is not valid UTF-8 text".to_string(),
        _ => err(e),
    })
}

#[tauri::command]
fn write_file(ws: State<Workspace>, path: String, content: String) -> Res<bool> {
    let abs = resolve(&ws, &path)?;
    fs::write(&abs, content).map_err(err)?;
    Ok(true)
}

#[tauri::command]
fn create_file(ws: State<Workspace>, path: String) -> Res<bool> {
    let abs = resolve(&ws, &path)?;
    // create_new fails when the file exists, which is what the explorer relies
    // on to avoid silently clobbering a file the user forgot about.
    std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&abs)
        .map_err(err)?;
    Ok(true)
}

#[tauri::command]
fn make_dir(ws: State<Workspace>, path: String) -> Res<bool> {
    let abs = resolve(&ws, &path)?;
    fs::create_dir_all(&abs).map_err(err)?;
    Ok(true)
}

#[tauri::command]
fn rename_path(ws: State<Workspace>, from: String, to: String) -> Res<bool> {
    let from_abs = resolve(&ws, &from)?;
    let to_abs = resolve(&ws, &to)?;
    fs::rename(&from_abs, &to_abs).map_err(err)?;
    Ok(true)
}

#[tauri::command]
fn remove_path(ws: State<Workspace>, path: String) -> Res<bool> {
    let abs = resolve(&ws, &path)?;
    if abs.is_dir() {
        fs::remove_dir_all(&abs).map_err(err)?;
    } else {
        fs::remove_file(&abs).map_err(err)?;
    }
    Ok(true)
}

#[tauri::command]
fn copy_path(ws: State<Workspace>, from: String, to: String) -> Res<bool> {
    let from_abs = resolve(&ws, &from)?;
    let to_abs = resolve(&ws, &to)?;
    if from_abs.is_dir() {
        copy_dir(&from_abs, &to_abs).map_err(err)?;
    } else {
        fs::copy(&from_abs, &to_abs).map_err(err)?;
    }
    Ok(true)
}

fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

#[tauri::command]
fn stat_path(ws: State<Workspace>, path: String) -> Res<Stat> {
    let abs = resolve(&ws, &path)?;
    let meta = fs::metadata(&abs).map_err(err)?;
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0);
    Ok(Stat {
        size: meta.len(),
        is_dir: meta.is_dir(),
        modified,
    })
}

#[tauri::command]
fn path_exists(ws: State<Workspace>, path: String) -> bool {
    // A path that fails the guard simply does not exist as far as callers are
    // concerned -- this is used for probing, so it must not surface an error.
    resolve(&ws, &path).map(|p| p.exists()).unwrap_or(false)
}

#[tauri::command]
fn search_files(ws: State<Workspace>, query: String, max: Option<usize>) -> Res<Vec<Hit>> {
    let root = ws
        .0
        .lock()
        .map_err(err)?
        .clone()
        .ok_or("no workspace is open")?;
    let max = max.unwrap_or(200);
    let needle = query.to_lowercase();
    let mut hits = Vec::new();
    walk_search(&ws, &root, &needle, max, &mut hits);
    Ok(hits)
}

fn walk_search(ws: &State<Workspace>, dir: &Path, needle: &str, max: usize, hits: &mut Vec<Hit>) {
    if hits.len() >= max {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else { return };

    for entry in entries.flatten() {
        if hits.len() >= max {
            return;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if SKIP.contains(&name.as_str()) {
            continue;
        }
        let path = entry.path();
        let Ok(meta) = entry.metadata() else { continue };

        if meta.is_dir() {
            walk_search(ws, &path, needle, max, hits);
            continue;
        }
        if meta.len() > MAX_SEARCH_BYTES {
            continue;
        }
        // read_to_string fails on non-UTF-8, which conveniently skips binaries
        // without a separate content sniff.
        let Ok(text) = fs::read_to_string(&path) else { continue };

        for (i, line) in text.lines().enumerate() {
            if hits.len() >= max {
                return;
            }
            if line.to_lowercase().contains(needle) {
                hits.push(Hit {
                    path: display(ws, &path),
                    line: i + 1,
                    text: line.chars().take(200).collect(),
                });
            }
        }
    }
}

/* --- entry point --------------------------------------------------------- */

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Workspace::default())
        .setup(|app| {
            // Open the directory the app was launched from, so `minicode .`
            // behaves the way a terminal user expects.
            if let Ok(cwd) = std::env::current_dir() {
                if let Some(state) = app.try_state::<Workspace>() {
                    *state.0.lock().unwrap() = Some(cwd);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_workspace,
            workspace_root,
            read_dir,
            read_file,
            write_file,
            create_file,
            make_dir,
            rename_path,
            remove_path,
            copy_path,
            stat_path,
            path_exists,
            search_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running MiniCode");
}

/* --- tests --------------------------------------------------------------- */

#[cfg(test)]
mod tests {
    //! The path guard is the security-critical part of this crate: it is the
    //! only thing standing between a malformed path from the frontend and the
    //! rest of the user's disk. These cover both halves of it -- the lexical
    //! check that catches `..`, and the canonicalisation that catches symlinks.

    use super::*;

    fn root() -> PathBuf {
        let root = std::env::temp_dir().join("minicode-guard-test");
        fs::create_dir_all(root.join("sub")).unwrap();
        root
    }

    fn home() -> PathBuf {
        let home = std::env::temp_dir().join("minicode-guard-home");
        fs::create_dir_all(&home).unwrap();
        home
    }

    #[test]
    fn lexical_normalize_resolves_dot_segments() {
        assert_eq!(lexical_normalize(Path::new("a/b/../c")), PathBuf::from("a/c"));
        assert_eq!(lexical_normalize(Path::new("./a/./b")), PathBuf::from("a/b"));
    }

    #[test]
    fn rejects_parent_escapes() {
        let (r, h) = (root(), home());
        assert!(resolve_within(&r, Some(&h), "../../etc/passwd").is_err());
        assert!(resolve_within(&r, Some(&h), "a/../../../etc").is_err());
    }

    #[test]
    fn allows_paths_that_do_not_exist_yet() {
        let (r, h) = (root(), home());
        // A file about to be created must resolve, or nothing could be created.
        assert!(resolve_within(&r, Some(&h), "does/not/exist/yet.txt").is_ok());
        // Likewise ~/.minicode before the first extension is installed.
        assert!(resolve_within(&r, Some(&h), "~/.minicode/extensions").is_ok());
    }

    #[test]
    fn rejects_home_outside_minicode() {
        let (r, h) = (root(), home());
        assert!(resolve_within(&r, Some(&h), "~/.ssh/id_rsa").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escape() {
        let (r, h) = (root(), home());
        let link = r.join("escape");
        let _ = fs::remove_file(&link);
        std::os::unix::fs::symlink("/etc", &link).unwrap();
        // Lexically this is inside the workspace; only canonicalisation sees it.
        assert!(resolve_within(&r, Some(&h), "escape/passwd").is_err());
        let _ = fs::remove_file(&link);
    }
}
