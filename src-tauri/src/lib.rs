use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
    thread,
    time::Duration,
};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use reqwest::header::USER_AGENT;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use tauri::{
    menu::MenuBuilder,
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    AppHandle, LogicalPosition, LogicalSize, Manager, Position, Size, State, WebviewWindow, Window,
    WindowEvent,
};
#[cfg(desktop)]
use tauri_plugin_autostart::ManagerExt as AutostartExt;

const MAIN_WINDOW_LABEL: &str = "main";
const MIN_WIDTH: f64 = 300.0;
const MIN_HEIGHT: f64 = 460.0;
const WINDOW_MARGIN_TOP: f64 = 0.0;
const WINDOW_MARGIN_RIGHT: f64 = 16.0;
const SNAP_DISTANCE: f64 = 14.0;
const SNAP_RELEASE_DISTANCE: f64 = 26.0;
const SNAP_IDLE_DELAY_MS: u64 = 120;
const USER_AGENT_VALUE: &str =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const ICONFONT_RESULT_LIMIT: usize = 12;
const OFFICIAL_SEARCH_LIMIT: usize = 6;
const SHOW_PANEL_ID: &str = "show-panel";
const HIDE_PANEL_ID: &str = "hide-panel";
const QUIT_APP_ID: &str = "quit-app";

#[derive(Default)]
struct RuntimeState {
    inner: Mutex<WindowRuntimeState>,
}

#[derive(Default)]
struct WindowRuntimeState {
    snap_enabled: bool,
    adjusting_position: bool,
    snapped_x: Option<SnapTarget>,
    snapped_y: Option<SnapTarget>,
    move_revision: u64,
    is_quitting: bool,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum SnapTarget {
    Min,
    Max,
}

#[derive(Clone, Copy)]
struct WindowBounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Clone, Copy)]
struct WorkArea {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportStateResponse {
    canceled: bool,
    file_path: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportStateResponse {
    canceled: bool,
    file_path: Option<String>,
    content: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ResolvedShortcut {
    title: String,
    url: String,
    shortcut_icon: String,
}

#[derive(Serialize)]
struct IconSuggestion {
    id: String,
    name: String,
    url: String,
}

#[derive(Deserialize)]
struct IconfontSearchResponse {
    data: Option<IconfontSearchData>,
}

#[derive(Deserialize)]
struct IconfontSearchData {
    icons: Vec<IconfontIcon>,
}

#[derive(Deserialize)]
struct IconfontIcon {
    id: serde_json::Value,
    name: Option<String>,
    show_svg: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShortcutQueryResult {
    target_path: String,
    arguments: String,
}

#[derive(Clone)]
struct OfficialCandidate {
    url: String,
    title: String,
    hostname: String,
    protocol: String,
    path_depth: usize,
}

#[tauri::command]
fn hide_main_window(window: Window) -> Result<(), String> {
    window.hide().map_err(|error| error.to_string())
}

#[tauri::command]
fn set_snap_enabled(enabled: bool, state: State<RuntimeState>) {
    if let Ok(mut runtime) = state.inner.lock() {
        runtime.snap_enabled = enabled;
        if !enabled {
            runtime.snapped_x = None;
            runtime.snapped_y = None;
        }
    }
}

#[tauri::command]
fn set_window_size(
    window: Window,
    width: Option<f64>,
    _height: Option<f64>,
    state: State<RuntimeState>,
) -> Result<(), String> {
    let current_bounds = get_window_bounds(&window)?;
    let work_area = get_work_area(&window)?;
    let preferred_width = width.unwrap_or(current_bounds.width);
    let next_width = preferred_width.clamp(MIN_WIDTH, work_area.width);
    let (snap_enabled, snapped_x) = {
        let runtime = state
            .inner
            .lock()
            .map_err(|_| "failed to lock runtime state".to_string())?;
        (runtime.snap_enabled, runtime.snapped_x)
    };
    let current_max_x = work_area.x + work_area.width - current_bounds.width;
    let inferred_snap_x = if snap_enabled {
        infer_axis_snap(current_bounds.x, work_area.x, current_max_x, snapped_x)
    } else {
        None
    };
    let preferred_x = match inferred_snap_x {
        Some(SnapTarget::Min) => work_area.x,
        Some(SnapTarget::Max) => work_area.x + work_area.width - next_width,
        None => current_bounds.x,
    };
    let next_bounds = clamp_bounds(
        WindowBounds {
            x: preferred_x,
            y: current_bounds.y,
            width: preferred_width,
            height: current_bounds.height,
        },
        work_area,
    );

    if let Ok(mut runtime) = state.inner.lock() {
        runtime.snapped_x = inferred_snap_x;
    }

    apply_bounds(&window, &state, next_bounds)
}

#[tauri::command]
fn snap_window_after_drag(window: Window, state: State<RuntimeState>) -> Result<(), String> {
    if let Ok(mut runtime) = state.inner.lock() {
        runtime.snapped_x = None;
        runtime.snapped_y = None;
    }

    clamp_window_bounds(&window, &state)?;
    maybe_adjust_position(&window, &state)
}

#[tauri::command]
fn get_launch_at_login(app: AppHandle) -> Result<bool, String> {
    #[cfg(desktop)]
    {
        app.autolaunch()
            .is_enabled()
            .map_err(|error| error.to_string())
    }

    #[cfg(not(desktop))]
    {
        let _ = app;
        Ok(false)
    }
}

#[tauri::command]
fn set_launch_at_login(app: AppHandle, enabled: bool) -> Result<bool, String> {
    #[cfg(desktop)]
    {
        let manager = app.autolaunch();
        if enabled {
            manager.enable().map_err(|error| error.to_string())?;
        } else {
            manager.disable().map_err(|error| error.to_string())?;
        }

        manager.is_enabled().map_err(|error| error.to_string())
    }

    #[cfg(not(desktop))]
    {
        let _ = (app, enabled);
        Ok(false)
    }
}

#[tauri::command]
async fn export_state(content: String) -> Result<ExportStateResponse, String> {
    let mut dialog = rfd::FileDialog::new()
        .add_filter("JSON Files", &["json"])
        .set_file_name(&build_backup_file_name());

    if let Some(default_dir) = default_export_directory() {
        dialog = dialog.set_directory(default_dir);
    }

    let Some(file_path) = dialog.save_file() else {
        return Ok(ExportStateResponse {
            canceled: true,
            file_path: None,
        });
    };

    fs::write(&file_path, content).map_err(|error| error.to_string())?;

    Ok(ExportStateResponse {
        canceled: false,
        file_path: Some(file_path.display().to_string()),
    })
}

#[tauri::command]
async fn import_state() -> Result<ImportStateResponse, String> {
    let Some(file_path) = rfd::FileDialog::new()
        .add_filter("JSON Files", &["json"])
        .pick_file()
    else {
        return Ok(ImportStateResponse {
            canceled: true,
            file_path: None,
            content: None,
        });
    };

    let content = fs::read_to_string(&file_path).map_err(|error| error.to_string())?;

    Ok(ImportStateResponse {
        canceled: false,
        file_path: Some(file_path.display().to_string()),
        content: Some(content),
    })
}

#[tauri::command]
async fn open_target(target: String) -> Result<(), String> {
    let normalized = target.trim();
    if normalized.is_empty() {
        return Ok(());
    }

    if let Some((file_path, arguments)) = split_path_and_args(normalized) {
        if let Some(args) = arguments {
            start_process_with_arguments(&file_path, &args)?;
            return Ok(());
        }
    }

    opener::open(normalized).map_err(|error| error.to_string())
}

#[tauri::command]
async fn resolve_dropped_paths(paths: Vec<String>) -> Result<Vec<ResolvedShortcut>, String> {
    let mut resolved = Vec::new();

    for raw_path in paths {
        if let Some(shortcut) = resolve_dropped_path(&PathBuf::from(raw_path))? {
            resolved.push(shortcut);
        }
    }

    Ok(resolved)
}

#[tauri::command]
async fn search_icon_suggestions(query: String) -> Result<Vec<IconSuggestion>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    let iconfont_suggestions = fetch_iconfont_suggestions(trimmed)
        .await
        .unwrap_or_default();
    if !iconfont_suggestions.is_empty() {
        return Ok(iconfont_suggestions);
    }

    let mut suggestions = Vec::new();
    let mut seen = HashSet::new();
    for host in collect_icon_hosts_from_query(trimmed) {
        push_favicon_suggestions(&mut suggestions, &mut seen, &host);
    }

    if suggestions.is_empty() {
        if let Some(official_url) = search_official_url_for_icons(trimmed).await {
            if let Some(host) = host_from_url(&official_url) {
                push_favicon_suggestions(&mut suggestions, &mut seen, &host);
            }
        }
    }

    let palettes = [
        ("#13547a", "#80d0c7"),
        ("#1e3c72", "#2a5298"),
        ("#0f766e", "#14b8a6"),
        ("#7c2d12", "#f97316"),
        ("#7f1d1d", "#ef4444"),
        ("#312e81", "#6366f1"),
        ("#14532d", "#22c55e"),
        ("#4c1d95", "#a855f7"),
        ("#083344", "#06b6d4"),
        ("#3f3f46", "#71717a"),
        ("#9a3412", "#fb923c"),
        ("#1d4ed8", "#60a5fa"),
    ];

    let initials = query_initials(trimmed);
    for (index, palette) in palettes.iter().enumerate() {
        let url = build_icon_data_url(&initials, palette.0, palette.1, index);
        if seen.insert(url.clone()) {
            suggestions.push(IconSuggestion {
                id: format!("{}-local-{}", normalize_search_text(trimmed), index),
                name: trimmed.to_string(),
                url,
            });
        }
    }

    Ok(suggestions)
}

#[tauri::command]
async fn search_official_url(query: String) -> Result<String, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(String::new());
    }

    if let Some(url) = search_official_url_with_bing(trimmed).await? {
        return Ok(url);
    }

    if let Some(url) = search_official_url_with_hao123(trimmed).await? {
        return Ok(url);
    }

    Ok(String::new())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            let _ = show_main_window(app);
        }))
        .manage(RuntimeState {
            inner: Mutex::new(WindowRuntimeState {
                snap_enabled: true,
                ..WindowRuntimeState::default()
            }),
        })
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None::<Vec<&str>>,
        ))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            #[cfg(desktop)]
            build_tray(app.handle())?;

            if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                configure_main_webview_window(&window, app.state::<RuntimeState>())?;
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != MAIN_WINDOW_LABEL {
                return;
            }

            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    let should_hide = window
                        .state::<RuntimeState>()
                        .inner
                        .lock()
                        .map(|runtime| !runtime.is_quitting)
                        .unwrap_or(true);

                    if should_hide {
                        api.prevent_close();
                    }
                }
                WindowEvent::Moved(_) => schedule_snap_after_move(window),
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            hide_main_window,
            open_target,
            export_state,
            import_state,
            set_snap_enabled,
            set_window_size,
            resolve_dropped_paths,
            search_icon_suggestions,
            search_official_url,
            snap_window_after_drag,
            get_launch_at_login,
            set_launch_at_login
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(desktop)]
fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = MenuBuilder::new(app)
        .text(SHOW_PANEL_ID, "Show Panel")
        .text(HIDE_PANEL_ID, "Hide Panel")
        .separator()
        .text(QUIT_APP_ID, "Quit")
        .build()?;

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .tooltip("Mini Desk Tool")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            SHOW_PANEL_ID => {
                let _ = show_main_window(app);
            }
            HIDE_PANEL_ID => {
                if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                    let _ = window.hide();
                }
            }
            QUIT_APP_ID => quit_application(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                ..
            } = event
            {
                let _ = toggle_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    let _ = builder.build(app)?;
    Ok(())
}

fn configure_main_webview_window(
    window: &WebviewWindow,
    state: State<RuntimeState>,
) -> Result<(), String> {
    let current_bounds = get_webview_window_bounds(window)?;
    let work_area = get_webview_work_area(window)?;
    let clamped = clamp_bounds(
        get_docked_bounds(work_area, Some(current_bounds.x), current_bounds.width),
        work_area,
    );

    {
        let mut runtime = state
            .inner
            .lock()
            .map_err(|_| "failed to lock runtime state".to_string())?;
        runtime.adjusting_position = true;
    }

    let size = Size::Logical(LogicalSize::new(clamped.width, clamped.height));
    let position = Position::Logical(LogicalPosition::new(clamped.x as f64, clamped.y as f64));
    let size_result = window.set_size(size).map_err(|error| error.to_string());
    let position_result = window
        .set_position(position)
        .map_err(|error| error.to_string());

    if let Ok(mut runtime) = state.inner.lock() {
        runtime.adjusting_position = false;
    }

    size_result?;
    position_result?;
    Ok(())
}

fn show_main_window(app: &AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return Ok(());
    };

    if window.is_minimized().map_err(|error| error.to_string())? {
        window.unminimize().map_err(|error| error.to_string())?;
    }

    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    Ok(())
}

fn toggle_main_window(app: &AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return Ok(());
    };

    if window.is_visible().map_err(|error| error.to_string())? {
        window.hide().map_err(|error| error.to_string())?;
    } else {
        show_main_window(app)?;
    }

    Ok(())
}

fn quit_application(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        if let Ok(mut runtime) = window.state::<RuntimeState>().inner.lock() {
            runtime.is_quitting = true;
        }
    }

    app.exit(0);
}

fn apply_bounds(
    window: &Window,
    state: &State<RuntimeState>,
    bounds: WindowBounds,
) -> Result<(), String> {
    {
        let mut runtime = state
            .inner
            .lock()
            .map_err(|_| "failed to lock runtime state".to_string())?;
        runtime.adjusting_position = true;
    }

    let size = Size::Logical(LogicalSize::new(bounds.width, bounds.height));
    let position = Position::Logical(LogicalPosition::new(bounds.x, bounds.y));
    let size_result = window.set_size(size).map_err(|error| error.to_string());
    let position_result = window
        .set_position(position)
        .map_err(|error| error.to_string());

    if let Ok(mut runtime) = state.inner.lock() {
        runtime.adjusting_position = false;
    }

    size_result?;
    position_result?;
    Ok(())
}

fn maybe_adjust_position(window: &Window, state: &State<RuntimeState>) -> Result<(), String> {
    let mut runtime = state
        .inner
        .lock()
        .map_err(|_| "failed to lock runtime state".to_string())?;
    if runtime.adjusting_position {
        return Ok(());
    }

    let current_bounds = get_window_bounds(window)?;
    let work_area = get_work_area(window)?;
    let mut target_x = current_bounds.x;
    let mut target_y = current_bounds.y;
    let left = work_area.x;
    let right = work_area.x + work_area.width - current_bounds.width;
    let top = work_area.y;
    let bottom = work_area.y + work_area.height - current_bounds.height;

    if runtime.snap_enabled {
        let snap_x = resolve_axis_snap(current_bounds.x, left, right, runtime.snapped_x);
        let snap_y = resolve_axis_snap(current_bounds.y, top, bottom, runtime.snapped_y);
        target_x = snap_x.0;
        target_y = snap_y.0;
        runtime.snapped_x = snap_x.1;
        runtime.snapped_y = snap_y.1;
    } else {
        runtime.snapped_x = None;
        runtime.snapped_y = None;
    }

    target_x = target_x.clamp(left, right);
    target_y = target_y.clamp(top, bottom);

    if target_x == current_bounds.x && target_y == current_bounds.y {
        return Ok(());
    }

    runtime.adjusting_position = true;
    drop(runtime);

    let result = window.set_position(Position::Logical(LogicalPosition::new(target_x, target_y)));

    if let Ok(mut runtime) = state.inner.lock() {
        runtime.adjusting_position = false;
    }

    result.map_err(|error| error.to_string())
}

fn schedule_snap_after_move(window: &Window) {
    let state = window.state::<RuntimeState>();
    let move_revision = {
        let Ok(mut runtime) = state.inner.lock() else {
            return;
        };

        if runtime.adjusting_position || !runtime.snap_enabled {
            return;
        }

        runtime.move_revision = runtime.move_revision.wrapping_add(1);
        runtime.move_revision
    };
    let window = window.clone();

    thread::spawn(move || {
        thread::sleep(Duration::from_millis(SNAP_IDLE_DELAY_MS));

        let state = window.state::<RuntimeState>();
        let should_snap = state
            .inner
            .lock()
            .map(|runtime| {
                runtime.snap_enabled
                    && !runtime.adjusting_position
                    && runtime.move_revision == move_revision
            })
            .unwrap_or(false);

        if should_snap {
            let _ = maybe_adjust_position(&window, &state);
        }
    });
}

fn clamp_window_bounds(window: &Window, state: &State<RuntimeState>) -> Result<(), String> {
    let current_bounds = get_window_bounds(window)?;
    let work_area = get_work_area(window)?;
    let clamped = clamp_bounds(
        get_docked_bounds(work_area, Some(current_bounds.x), current_bounds.width),
        work_area,
    );
    apply_bounds(window, state, clamped)
}

fn get_window_bounds(window: &Window) -> Result<WindowBounds, String> {
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let size = window.outer_size().map_err(|error| error.to_string())?;
    let scale_factor = window.scale_factor().map_err(|error| error.to_string())?;
    let logical_position = position.to_logical::<f64>(scale_factor);
    let logical_size = size.to_logical::<f64>(scale_factor);

    Ok(WindowBounds {
        x: logical_position.x,
        y: logical_position.y,
        width: logical_size.width,
        height: logical_size.height,
    })
}

fn get_webview_window_bounds(window: &WebviewWindow) -> Result<WindowBounds, String> {
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let size = window.outer_size().map_err(|error| error.to_string())?;
    let scale_factor = window.scale_factor().map_err(|error| error.to_string())?;
    let logical_position = position.to_logical::<f64>(scale_factor);
    let logical_size = size.to_logical::<f64>(scale_factor);

    Ok(WindowBounds {
        x: logical_position.x,
        y: logical_position.y,
        width: logical_size.width,
        height: logical_size.height,
    })
}

fn get_work_area(window: &Window) -> Result<WorkArea, String> {
    let monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or_else(|| window.primary_monitor().ok().flatten())
        .ok_or_else(|| "failed to resolve active monitor".to_string())?;
    let area = monitor.work_area();
    let scale_factor = window.scale_factor().map_err(|error| error.to_string())?;
    let position = area.position.to_logical::<f64>(scale_factor);
    let size = area.size.to_logical::<f64>(scale_factor);

    Ok(WorkArea {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    })
}

fn get_webview_work_area(window: &WebviewWindow) -> Result<WorkArea, String> {
    let monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or_else(|| window.primary_monitor().ok().flatten())
        .ok_or_else(|| "failed to resolve active monitor".to_string())?;
    let area = monitor.work_area();
    let scale_factor = window.scale_factor().map_err(|error| error.to_string())?;
    let position = area.position.to_logical::<f64>(scale_factor);
    let size = area.size.to_logical::<f64>(scale_factor);

    Ok(WorkArea {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    })
}

fn get_docked_bounds(
    area: WorkArea,
    preferred_x: Option<f64>,
    preferred_width: f64,
) -> WindowBounds {
    let width = preferred_width.clamp(MIN_WIDTH, area.width);
    let y = area.y + WINDOW_MARGIN_TOP.min((area.height - MIN_HEIGHT).max(0.0));
    let height = (area.y + area.height - y).clamp(MIN_HEIGHT, area.height);
    let fallback_x = area.x + (area.width - width).max(0.0) - WINDOW_MARGIN_RIGHT;
    let max_x = area.x + area.width - width;
    let x = preferred_x
        .map(|value| value.clamp(area.x, max_x.max(area.x)))
        .unwrap_or_else(|| fallback_x.max(area.x));

    WindowBounds {
        x,
        y,
        width,
        height,
    }
}

fn clamp_bounds(bounds: WindowBounds, area: WorkArea) -> WindowBounds {
    let width = bounds.width.clamp(MIN_WIDTH, area.width);
    let height = bounds.height.clamp(MIN_HEIGHT, area.height);
    let max_x = area.x + area.width - width;
    let max_y = area.y + area.height - height;

    WindowBounds {
        x: bounds.x.clamp(area.x, max_x.max(area.x)),
        y: bounds.y.clamp(area.y, max_y.max(area.y)),
        width,
        height,
    }
}

fn resolve_axis_snap(
    current: f64,
    min: f64,
    max: f64,
    snapped_state: Option<SnapTarget>,
) -> (f64, Option<SnapTarget>) {
    let near_min = (current - min).abs() <= SNAP_DISTANCE;
    let near_max = (current - max).abs() <= SNAP_DISTANCE;

    match snapped_state {
        Some(SnapTarget::Min) => {
            if (current - min).abs() <= SNAP_RELEASE_DISTANCE {
                (min, Some(SnapTarget::Min))
            } else {
                (current, None)
            }
        }
        Some(SnapTarget::Max) => {
            if (current - max).abs() <= SNAP_RELEASE_DISTANCE {
                (max, Some(SnapTarget::Max))
            } else {
                (current, None)
            }
        }
        None if near_min => (min, Some(SnapTarget::Min)),
        None if near_max => (max, Some(SnapTarget::Max)),
        None => (current, None),
    }
}

fn infer_axis_snap(
    current: f64,
    min: f64,
    max: f64,
    snapped_state: Option<SnapTarget>,
) -> Option<SnapTarget> {
    match snapped_state {
        Some(target) => Some(target),
        None if (current - min).abs() <= SNAP_RELEASE_DISTANCE => Some(SnapTarget::Min),
        None if (current - max).abs() <= SNAP_RELEASE_DISTANCE => Some(SnapTarget::Max),
        None => None,
    }
}

fn build_backup_file_name() -> String {
    format!("mini-desk-tool-backup-{}.json", current_unix_timestamp())
}

fn current_unix_timestamp() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

fn current_unix_millis() -> u128 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn default_export_directory() -> Option<PathBuf> {
    dirs::document_dir().or_else(dirs::download_dir)
}

fn split_path_and_args(value: &str) -> Option<(String, Option<String>)> {
    if value.is_empty() {
        return None;
    }

    if let Some(rest) = value.strip_prefix('"') {
        if let Some(end_quote) = rest.find('"') {
            let file_path = rest[..end_quote].trim();
            if Path::new(file_path).exists() {
                let args = rest[end_quote + 1..].trim();
                return Some((
                    file_path.to_string(),
                    (!args.is_empty()).then(|| args.to_string()),
                ));
            }
        }
    }

    if Path::new(value).exists() {
        return Some((value.to_string(), None));
    }

    for (index, _) in value.match_indices(' ').rev() {
        let candidate = value[..index].trim();
        if Path::new(candidate).exists() {
            let args = value[index + 1..].trim();
            return Some((
                candidate.to_string(),
                (!args.is_empty()).then(|| args.to_string()),
            ));
        }
    }

    None
}

fn start_process_with_arguments(file_path: &str, args: &str) -> Result<(), String> {
    let status = Command::new(power_shell_path())
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Start-Process -FilePath $args[0] -ArgumentList $args[1]",
            file_path,
            args,
        ])
        .status()
        .map_err(|error| error.to_string())?;

    if status.success() {
        Ok(())
    } else {
        Err("failed to launch target with arguments".to_string())
    }
}

fn resolve_dropped_path(path: &Path) -> Result<Option<ResolvedShortcut>, String> {
    let Some(extension) = path.extension().and_then(|value| value.to_str()) else {
        return resolve_regular_entry(path);
    };

    match extension.to_ascii_lowercase().as_str() {
        "lnk" => resolve_windows_shortcut(path).or_else(|_| resolve_regular_entry(path)),
        "url" => resolve_internet_shortcut(path).or_else(|_| resolve_regular_entry(path)),
        _ => resolve_regular_entry(path),
    }
}

fn resolve_windows_shortcut(path: &Path) -> Result<Option<ResolvedShortcut>, String> {
    let Some(shortcut) = query_windows_shortcut(path)? else {
        return resolve_regular_entry(path);
    };

    let mut launch_target = shortcut.target_path.trim().to_string();
    if !shortcut.arguments.trim().is_empty() {
        launch_target = format!("{launch_target} {}", shortcut.arguments.trim());
    }

    if launch_target.trim().is_empty() {
        return resolve_regular_entry(path);
    }

    Ok(Some(ResolvedShortcut {
        title: path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("Shortcut")
            .to_string(),
        shortcut_icon: shortcut_icon_for_target(&launch_target),
        url: launch_target,
    }))
}

fn resolve_internet_shortcut(path: &Path) -> Result<Option<ResolvedShortcut>, String> {
    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let url = content
        .lines()
        .find_map(|line| line.trim().strip_prefix("URL="))
        .unwrap_or_default()
        .trim()
        .to_string();

    if url.is_empty() {
        return resolve_regular_entry(path);
    }

    Ok(Some(ResolvedShortcut {
        title: path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("Shortcut")
            .to_string(),
        shortcut_icon: shortcut_icon_for_target(&url),
        url,
    }))
}

fn resolve_regular_entry(path: &Path) -> Result<Option<ResolvedShortcut>, String> {
    if !path.exists() {
        return Ok(None);
    }

    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    let title = if metadata.is_dir() {
        path.file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("Folder")
            .to_string()
    } else {
        path.file_stem()
            .and_then(|value| value.to_str())
            .or_else(|| path.file_name().and_then(|value| value.to_str()))
            .unwrap_or("File")
            .to_string()
    };

    Ok(Some(ResolvedShortcut {
        title,
        url: path.display().to_string(),
        shortcut_icon: String::new(),
    }))
}

fn query_windows_shortcut(path: &Path) -> Result<Option<ShortcutQueryResult>, String> {
    let script = [
        "$ErrorActionPreference = 'Stop'",
        "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
        "$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($args[0])",
        "$result = [pscustomobject]@{",
        "  targetPath = [string]$shortcut.TargetPath",
        "  arguments = [string]$shortcut.Arguments",
        "}",
        "$result | ConvertTo-Json -Compress",
    ]
    .join("; ");

    let output = Command::new(power_shell_path())
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            &script,
            &path.display().to_string(),
        ])
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        return Ok(None);
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        return Ok(None);
    }

    let parsed: ShortcutQueryResult =
        serde_json::from_str(&stdout).map_err(|error| error.to_string())?;

    if parsed.target_path.trim().is_empty() && parsed.arguments.trim().is_empty() {
        return Ok(None);
    }

    Ok(Some(parsed))
}

fn shortcut_icon_for_target(target: &str) -> String {
    let maybe_url = target
        .split_whitespace()
        .find(|part| part.starts_with("http://") || part.starts_with("https://"))
        .unwrap_or(target);

    reqwest::Url::parse(maybe_url)
        .ok()
        .and_then(|url| {
            url.host_str()
                .map(|host| format!("https://icons.duckduckgo.com/ip3/{host}.ico"))
        })
        .unwrap_or_default()
}

async fn fetch_iconfont_suggestions(query: &str) -> Result<Vec<IconSuggestion>, String> {
    let params = [
        ("q", query.to_string()),
        ("sortType", "updated_at".to_string()),
        ("page", "1".to_string()),
        ("pageSize", "54".to_string()),
        ("sType", String::new()),
        ("fromCollection", "-1".to_string()),
        ("fills", String::new()),
        ("t", current_unix_millis().to_string()),
        ("ctoken", "null".to_string()),
    ];

    let response_text = reqwest::Client::new()
        .post("https://www.iconfont.cn/api/icon/search.json")
        .header(USER_AGENT, USER_AGENT_VALUE)
        .header("referer", "https://www.iconfont.cn/search/index")
        .header(
            "content-type",
            "application/x-www-form-urlencoded; charset=UTF-8",
        )
        .body(encode_form_params(&params))
        .send()
        .await
        .map_err(|error| error.to_string())?
        .text()
        .await
        .map_err(|error| error.to_string())?;

    let response: IconfontSearchResponse =
        serde_json::from_str(&response_text).map_err(|error| error.to_string())?;

    let icons = response.data.map(|data| data.icons).unwrap_or_default();

    Ok(icons
        .into_iter()
        .filter_map(|icon| {
            let svg = normalize_iconfont_svg(icon.show_svg.as_deref()?);
            if svg.is_empty() {
                return None;
            }

            Some(IconSuggestion {
                id: format!("iconfont-{}", iconfont_id_to_string(&icon.id)),
                name: icon.name.unwrap_or_else(|| query.to_string()),
                url: svg_to_data_url(&svg),
            })
        })
        .take(ICONFONT_RESULT_LIMIT)
        .collect())
}

fn iconfont_id_to_string(value: &serde_json::Value) -> String {
    value
        .as_i64()
        .map(|id| id.to_string())
        .or_else(|| value.as_str().map(str::to_string))
        .unwrap_or_else(|| "unknown".to_string())
}

fn encode_form_params(params: &[(&str, String)]) -> String {
    params
        .iter()
        .map(|(key, value)| {
            format!(
                "{}={}",
                urlencoding::encode(key),
                urlencoding::encode(value)
            )
        })
        .collect::<Vec<_>>()
        .join("&")
}

fn normalize_iconfont_svg(svg: &str) -> String {
    let trimmed = svg.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    if trimmed.contains("xmlns=") {
        trimmed.to_string()
    } else {
        trimmed.replacen("<svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"", 1)
    }
}

fn svg_to_data_url(svg: &str) -> String {
    format!("data:image/svg+xml;base64,{}", BASE64.encode(svg))
}

async fn search_official_url_for_icons(query: &str) -> Option<String> {
    if let Ok(Some(url)) = search_official_url_with_bing(query).await {
        return Some(url);
    }

    if let Ok(Some(url)) = search_official_url_with_hao123(query).await {
        return Some(url);
    }

    None
}

fn collect_icon_hosts_from_query(query: &str) -> Vec<String> {
    let mut hosts = Vec::new();
    let mut seen = HashSet::new();

    for candidate in query
        .split(|character: char| {
            character.is_whitespace() || matches!(character, ',' | ';' | '，' | '；')
        })
        .map(str::trim)
        .filter(|candidate| !candidate.is_empty())
    {
        if let Some(host) = host_from_url(candidate).or_else(|| host_from_bare_domain(candidate)) {
            if seen.insert(host.clone()) {
                hosts.push(host);
            }
        }
    }

    hosts
}

fn host_from_url(value: &str) -> Option<String> {
    reqwest::Url::parse(value)
        .ok()
        .and_then(|url| url.host_str().map(normalize_icon_host))
}

fn host_from_bare_domain(value: &str) -> Option<String> {
    let candidate = value.trim().trim_matches(|character: char| {
        matches!(
            character,
            '"' | '\'' | '(' | ')' | '[' | ']' | '<' | '>' | '。' | '，' | ','
        )
    });

    if candidate.contains('/') || candidate.contains('\\') || candidate.contains('@') {
        return None;
    }

    if !candidate.contains('.') || candidate.split('.').any(str::is_empty) {
        return None;
    }

    reqwest::Url::parse(&format!("https://{candidate}"))
        .ok()
        .and_then(|url| url.host_str().map(normalize_icon_host))
}

fn normalize_icon_host(host: &str) -> String {
    host.trim().trim_start_matches("www.").to_ascii_lowercase()
}

fn push_favicon_suggestions(
    suggestions: &mut Vec<IconSuggestion>,
    seen: &mut HashSet<String>,
    host: &str,
) {
    let host = normalize_icon_host(host);
    if host.is_empty() {
        return;
    }

    let providers = [
    (
      "duckduckgo",
      format!("https://icons.duckduckgo.com/ip3/{host}.ico"),
    ),
    (
      "google",
      format!("https://www.google.com/s2/favicons?domain={host}&sz=128"),
    ),
    (
      "google-v2",
      format!("https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://{host}&size=128"),
    ),
  ];

    for (provider, url) in providers {
        if !seen.insert(url.clone()) {
            continue;
        }

        suggestions.push(IconSuggestion {
            id: format!("{}-{provider}", normalize_search_text(&host)),
            name: host.clone(),
            url,
        });
    }
}

fn power_shell_path() -> PathBuf {
    let system_root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string());
    PathBuf::from(system_root)
        .join("System32")
        .join("WindowsPowerShell")
        .join("v1.0")
        .join("powershell.exe")
}

fn query_initials(query: &str) -> String {
    let mut initials = String::new();
    for part in query
        .split_whitespace()
        .filter(|part| !part.is_empty())
        .take(2)
    {
        if let Some(ch) = part.chars().next() {
            initials.push(ch.to_ascii_uppercase());
        }
    }

    if initials.is_empty() {
        query
            .chars()
            .next()
            .map(|ch| ch.to_ascii_uppercase().to_string())
            .unwrap_or_else(|| "?".to_string())
    } else {
        initials
    }
}

fn build_icon_data_url(text: &str, color_start: &str, color_end: &str, index: usize) -> String {
    let radius = if index % 2 == 0 { 22 } else { 28 };
    let svg = format!(
    "<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128'>\
      <defs>\
        <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>\
          <stop offset='0%' stop-color='{color_start}'/>\
          <stop offset='100%' stop-color='{color_end}'/>\
        </linearGradient>\
      </defs>\
      <rect width='128' height='128' rx='{radius}' fill='url(#g)'/>\
      <circle cx='102' cy='26' r='12' fill='rgba(255,255,255,0.18)'/>\
      <text x='50%' y='54%' dominant-baseline='middle' text-anchor='middle' font-family='Arial, sans-serif' font-size='46' font-weight='700' fill='white'>{}</text>\
    </svg>",
    escape_xml(text)
  );

    format!("data:image/svg+xml;base64,{}", BASE64.encode(svg))
}

fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn normalize_search_text(value: &str) -> String {
    value
        .chars()
        .flat_map(char::to_lowercase)
        .filter(|character| character.is_alphanumeric())
        .collect()
}

fn build_official_search_keywords(query: &str) -> Vec<String> {
    let mut keywords = Vec::new();
    let mut buffer = String::new();

    for character in query.chars() {
        if character.is_alphanumeric() {
            buffer.push(character);
        } else if !buffer.is_empty() {
            keywords.push(buffer.clone());
            buffer.clear();
        }
    }

    if !buffer.is_empty() {
        keywords.push(buffer);
    }

    if keywords.is_empty() {
        keywords.push(query.trim().to_string());
    }

    keywords.truncate(8);
    keywords
}

fn is_blocked_official_host(host: &str, path: &str) -> bool {
    let host = host.to_ascii_lowercase();
    let path = path.to_ascii_lowercase();
    let blocked_hosts = [
        "hao123.com",
        "baidu.com",
        "bing.com",
        "google.com",
        "taobao.com",
        "jd.com",
        "1688.com",
    ];

    blocked_hosts
        .iter()
        .any(|blocked| host == *blocked || host.ends_with(&format!(".{blocked}")))
        || (host.contains("baidu.com") && path.starts_with("/s"))
}

fn build_official_candidate(url: &str, title: &str) -> Option<OfficialCandidate> {
    let parsed = reqwest::Url::parse(url).ok()?;
    let host = parsed.host_str()?.to_string();
    if is_blocked_official_host(&host, parsed.path()) {
        return None;
    }

    Some(OfficialCandidate {
        url: parsed.to_string(),
        title: title.trim().to_string(),
        hostname: host,
        protocol: parsed.scheme().to_string(),
        path_depth: parsed
            .path_segments()
            .map(|segments| segments.filter(|segment| !segment.is_empty()).count())
            .unwrap_or_default(),
    })
}

fn score_official_candidate(candidate: &OfficialCandidate, query: &str) -> i32 {
    let text = normalize_search_text(&format!("{} {}", candidate.title, candidate.url));
    let hostname = normalize_search_text(&candidate.hostname);
    let keywords = build_official_search_keywords(query);
    let mut score = 0;

    if candidate.title.contains("官网") || candidate.title.to_ascii_lowercase().contains("official")
    {
        score += 36;
    }

    if candidate.path_depth == 0 {
        score += 18;
    }

    if candidate.protocol == "https" {
        score += 6;
    }

    for (index, keyword) in keywords.iter().enumerate() {
        let normalized = normalize_search_text(keyword);
        if normalized.len() < 2 {
            continue;
        }

        if text == normalized {
            score += 120 - index as i32 * 8;
        } else if text.contains(&normalized) {
            score += 70 - index as i32 * 5;
        }

        if hostname.contains(&normalized) {
            score += 42 - index as i32 * 3;
        }
    }

    score
}

async fn search_official_url_with_bing(query: &str) -> Result<Option<String>, String> {
    let search_query = if query.is_ascii() {
        format!("{query} official site")
    } else {
        format!("{query} 官网")
    };
    let url = format!(
        "https://www.bing.com/search?q={}",
        urlencoding::encode(&search_query)
    );

    let html = reqwest::Client::new()
        .get(url)
        .header(USER_AGENT, USER_AGENT_VALUE)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .text()
        .await
        .map_err(|error| error.to_string())?;

    let document = Html::parse_document(&html);
    let selector = Selector::parse("li.b_algo h2 a").map_err(|error| error.to_string())?;
    let mut candidates = Vec::new();

    for link in document.select(&selector) {
        let title = link.text().collect::<Vec<_>>().join(" ");
        let href = link.value().attr("href").unwrap_or_default();
        if let Some(candidate) = build_official_candidate(href, &title) {
            candidates.push(candidate);
        }
    }

    Ok(rank_official_candidates(candidates, query))
}

async fn search_official_url_with_hao123(query: &str) -> Result<Option<String>, String> {
    let html = reqwest::Client::new()
        .get("https://www.hao123.com/")
        .header(USER_AGENT, USER_AGENT_VALUE)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .text()
        .await
        .map_err(|error| error.to_string())?;

    let document = Html::parse_document(&html);
    let selector = Selector::parse("a[href]").map_err(|error| error.to_string())?;
    let mut candidates = Vec::new();

    for link in document.select(&selector) {
        let title = link.text().collect::<Vec<_>>().join(" ").trim().to_string();
        if title.is_empty() || title.len() > 24 {
            continue;
        }

        let href = link.value().attr("href").unwrap_or_default();
        if let Some(candidate) = build_official_candidate(href, &title) {
            candidates.push(candidate);
        }
    }

    Ok(rank_official_candidates(candidates, query))
}

fn rank_official_candidates(candidates: Vec<OfficialCandidate>, query: &str) -> Option<String> {
    let mut ranked = candidates
        .into_iter()
        .map(|candidate| (score_official_candidate(&candidate, query), candidate))
        .filter(|(score, _)| *score > 0)
        .collect::<Vec<_>>();

    ranked.sort_by(|left, right| right.0.cmp(&left.0));
    ranked
        .into_iter()
        .take(OFFICIAL_SEARCH_LIMIT)
        .map(|(_, candidate)| candidate.url)
        .next()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn falls_back_to_shortcut_file_when_lnk_target_cannot_be_resolved() {
        let path = std::env::temp_dir().join(format!(
            "mini-desk-tool-empty-{}-{}.lnk",
            current_unix_timestamp(),
            std::process::id()
        ));
        fs::write(&path, "").expect("write fake shortcut");

        let resolved = resolve_dropped_path(&path)
            .expect("resolve fake shortcut")
            .expect("fallback shortcut");

        assert_eq!(
            resolved.title,
            path.file_stem().unwrap().to_string_lossy().to_string()
        );
        assert_eq!(resolved.url, path.display().to_string());

        let _ = fs::remove_file(path);
    }

    #[test]
    fn builds_network_icon_candidates_from_domain_queries() {
        let hosts = collect_icon_hosts_from_query("https://www.github.com/features github.com");
        assert_eq!(hosts, vec!["github.com".to_string()]);

        let mut suggestions = Vec::new();
        let mut seen = HashSet::new();
        push_favicon_suggestions(&mut suggestions, &mut seen, &hosts[0]);

        let urls = suggestions
            .iter()
            .map(|suggestion| suggestion.url.as_str())
            .collect::<Vec<_>>();

        assert!(urls.contains(&"https://icons.duckduckgo.com/ip3/github.com.ico"));
        assert!(urls.contains(&"https://www.google.com/s2/favicons?domain=github.com&sz=128"));
        assert!(urls.iter().any(|url| url.contains("faviconV2")));
    }

    #[test]
    fn converts_iconfont_svg_to_data_url_candidates() {
        let svg =
            normalize_iconfont_svg("<svg viewBox=\"0 0 1024 1024\"><path d=\"M0 0\" /></svg>");
        assert!(svg.contains("xmlns=\"http://www.w3.org/2000/svg\""));

        let data_url = svg_to_data_url(&svg);
        assert!(data_url.starts_with("data:image/svg+xml;base64,"));
    }
}
