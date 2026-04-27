export async function ensureDesktopPanelBridge() {
  if (window.desktopPanel) return window.desktopPanel;

  if (!window.__TAURI_INTERNALS__) {
    window.desktopPanel = createBrowserFallbackBridge();
    return window.desktopPanel;
  }

  const [{ invoke }, windowApi] = await Promise.all([
    import("@tauri-apps/api/core"),
    import("@tauri-apps/api/window")
  ]);

  const appWindow = windowApi.getCurrentWindow();
  let registeredGlobalShortcut = "";
  let nativeDragScaleFactor = Number(window.devicePixelRatio) || 1;
  const refreshNativeDragScaleFactor = async () => {
    try {
      nativeDragScaleFactor = Number(await appWindow.scaleFactor()) || nativeDragScaleFactor;
    } catch {
      nativeDragScaleFactor = Number(window.devicePixelRatio) || nativeDragScaleFactor;
    }
  };
  void refreshNativeDragScaleFactor();

  window.desktopPanel = {
    minimizeWindow: () => appWindow.minimize(),
    closeWindow: () => invoke("hide_main_window"),
    toggleWindow: () => invoke("toggle_main_window_command"),
    openUrl: (target) => invoke("open_target", { target }),
    exportStateFile: (content) => invoke("export_state", { content }),
    importStateFile: () => invoke("import_state"),
    chooseBackupDirectory: () => invoke("choose_backup_directory"),
    writeBackupFile: (content, directory, retention) => invoke("write_backup_file", { content, directory, retention }),
    setSnapEnabled: (enabled) => invoke("set_snap_enabled", { enabled }),
    setWindowSize: (width, height) => invoke("set_window_size", { width, height }),
    setDropAccepting: async () => {},
    resolveDroppedPaths: (paths) => invoke("resolve_dropped_paths", { paths }),
    scanShortcutLocations: (sources) => invoke("scan_shortcut_locations", { sources }),
    searchIconSuggestions: (query) => invoke("search_icon_suggestions", { query }),
    searchOfficialUrl: (query) => invoke("search_official_url", { query }),
    snapAfterDrag: () => invoke("snap_window_after_drag"),
    getLaunchAtLogin: () => invoke("get_launch_at_login"),
    setLaunchAtLogin: (enabled) => invoke("set_launch_at_login", { enabled }),
    configureWindowBehavior: (options) => invoke("configure_window_behavior", {
      autoHideEnabled: Boolean(options?.autoHideEnabled),
      snapEdge: String(options?.snapEdge || "auto"),
      snapDistance: Number(options?.snapDistance || 14),
      revealDelayMs: Number(options?.revealDelayMs || 250)
    }),
    configureGlobalShortcut: async (enabled, shortcut) => {
      const { register, unregister } = await import("@tauri-apps/plugin-global-shortcut");
      if (registeredGlobalShortcut) {
        await unregister(registeredGlobalShortcut);
        registeredGlobalShortcut = "";
      }

      const normalizedShortcut = String(shortcut || "").trim();
      if (!enabled || !normalizedShortcut) {
        return { enabled: false, shortcut: "" };
      }

      await register(normalizedShortcut, (event) => {
        if (event.state === "Pressed") void invoke("toggle_main_window_command");
      });
      registeredGlobalShortcut = normalizedShortcut;
      return { enabled: true, shortcut: normalizedShortcut };
    },
    startWindowDrag: () => appWindow.startDragging(),
    onNativeDragDrop: async (handler) => appWindow.onDragDropEvent((event) => {
      const payload = event.payload;
      if (!payload || !payload.position) {
        handler(payload);
        return;
      }

      void refreshNativeDragScaleFactor();
      handler({ ...payload, scaleFactor: nativeDragScaleFactor });
    })
  };

  return window.desktopPanel;
}

function createBrowserFallbackBridge() {
  return {
    minimizeWindow: async () => {},
    closeWindow: async () => {},
    toggleWindow: async () => {},
    openUrl: async (target) => {
      const normalized = String(target || "").trim();
      if (!normalized) return;
      if (/^https?:\/\//i.test(normalized)) {
        window.open(normalized, "_blank", "noopener,noreferrer");
      }
    },
    exportStateFile: async () => ({ canceled: true }),
    importStateFile: async () => ({ canceled: true }),
    chooseBackupDirectory: async () => ({ canceled: true }),
    writeBackupFile: async () => ({ filePath: "" }),
    setSnapEnabled: async () => {},
    setWindowSize: async () => {},
    setDropAccepting: async () => {},
    resolveDroppedPaths: async () => [],
    scanShortcutLocations: async () => [],
    searchIconSuggestions: async () => [],
    searchOfficialUrl: async () => "",
    snapAfterDrag: async () => {},
    getLaunchAtLogin: async () => false,
    setLaunchAtLogin: async (enabled) => Boolean(enabled),
    configureWindowBehavior: async () => {},
    configureGlobalShortcut: async (enabled, shortcut) => ({
      enabled: Boolean(enabled && shortcut),
      shortcut: String(shortcut || "")
    }),
    startWindowDrag: async () => {},
    onNativeDragDrop: async () => () => {}
  };
}
