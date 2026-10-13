//! ZenNovel's small game player (the "Small" build in Export game).
//!
//! One prebuilt program for every game: the editor copies it next to the
//! game folder and renames it.
//!
//!   My Game.exe
//!   game/index.html, game/assets/…
//!
//! The folder is served over game:// (http://game.localhost on Windows) so
//! the page, its images and its music load like a website. The page finds
//! `window.__TAURI__` and offers fullscreen and Quit (see
//! packages/runtime/src/host.ts).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::{Path, PathBuf};
use tauri::http::{header, Response, StatusCode};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

fn exe_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| PathBuf::from("."))
}

/// "My Game" for "My Game.exe": used for the window title and the save folder.
fn game_name() -> String {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.file_stem().map(|s| s.to_string_lossy().into_owned()))
        .unwrap_or_else(|| "Game".into())
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(b) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn mime_type(path: &Path) -> &'static str {
    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "html" => "text/html; charset=utf-8",
        "js" => "text/javascript",
        "css" => "text/css",
        "json" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "avif" => "image/avif",
        "mp3" => "audio/mpeg",
        "ogg" | "oga" => "audio/ogg",
        "opus" => "audio/ogg",
        "wav" => "audio/wav",
        "m4a" => "audio/mp4",
        "aac" => "audio/aac",
        "flac" => "audio/flac",
        "weba" => "audio/webm",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        _ => "application/octet-stream",
    }
}

fn serve(root: &Path, url_path: &str) -> Response<Vec<u8>> {
    let rel = percent_decode(url_path.trim_start_matches('/'));
    let rel = if rel.is_empty() { "index.html".to_string() } else { rel };
    let full = root.join(&rel);
    // Never serve anything outside the game folder.
    let inside = match (full.canonicalize(), root.canonicalize()) {
        (Ok(f), Ok(r)) => f.starts_with(r),
        _ => false,
    };
    if inside {
        if let Ok(bytes) = std::fs::read(&full) {
            return Response::builder()
                .header(header::CONTENT_TYPE, mime_type(&full))
                .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                .body(bytes)
                .unwrap();
        }
    }
    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .body(b"Not found".to_vec())
        .unwrap()
}

fn main() {
    let root = exe_dir().join("game");
    let name = game_name();
    let serve_root = root.clone();
    tauri::Builder::default()
        .register_uri_scheme_protocol("game", move |_ctx, request| serve(&serve_root, request.uri().path()))
        .setup(move |app| {
            // Windows' web view only accepts custom protocols as http://<scheme>.localhost.
            let start = if cfg!(windows) {
                "http://game.localhost/index.html"
            } else {
                "game://localhost/index.html"
            };
            let mut window = WebviewWindowBuilder::new(app, "main", WebviewUrl::CustomProtocol(start.parse()?))
                .title(&name)
                .inner_size(1280.0, 720.0)
                .min_inner_size(640.0, 360.0)
                .center();
            // Each game keeps its own saves, even though every game is this same program.
            if let Ok(dir) = app.path().app_local_data_dir() {
                window = window.data_directory(dir.join(&name));
            }
            window.build()?;
            if !root.join("index.html").exists() {
                eprintln!("ZenNovel: no game/index.html next to the program");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the ZenNovel player");
}
