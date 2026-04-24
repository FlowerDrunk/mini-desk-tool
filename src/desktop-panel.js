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

  window.desktopPanel = {
    minimizeWindow: () => appWindow.minimize(),
    closeWindow: () => invoke("hide_main_window"),
    openUrl: (target) => invoke("open_target", { target }),
    exportStateFile: (content) => invoke("export_state", { content }),
    importStateFile: () => invoke("import_state"),
    setSnapEnabled: (enabled) => invoke("set_snap_enabled", { enabled }),
    setWindowSize: (width, height) => invoke("set_window_size", { width, height }),
    setDropAccepting: async () => {},
    resolveDroppedPaths: (paths) => invoke("resolve_dropped_paths", { paths }),
    searchIconSuggestions: (query) => invoke("search_icon_suggestions", { query }),
    searchOfficialUrl: (query) => invoke("search_official_url", { query }),
    snapAfterDrag: () => invoke("snap_window_after_drag"),
    getLaunchAtLogin: () => invoke("get_launch_at_login"),
    setLaunchAtLogin: (enabled) => invoke("set_launch_at_login", { enabled }),
    startWindowDrag: () => appWindow.startDragging(),
    onNativeDragDrop: async (handler) => appWindow.onDragDropEvent((event) => handler(event.payload))
  };

  return window.desktopPanel;
}

function createBrowserFallbackBridge() {
  return {
    minimizeWindow: async () => {},
    closeWindow: async () => {},
    openUrl: async (target) => {
      const normalized = String(target || "").trim();
      if (!normalized) return;
      if (/^https?:\/\//i.test(normalized)) {
        window.open(normalized, "_blank", "noopener,noreferrer");
      }
    },
    exportStateFile: async () => ({ canceled: true }),
    importStateFile: async () => ({ canceled: true }),
    setSnapEnabled: async () => {},
    setWindowSize: async () => {},
    setDropAccepting: async () => {},
    resolveDroppedPaths: async () => [],
    searchIconSuggestions: async () => [],
    searchOfficialUrl: async () => "",
    snapAfterDrag: async () => {},
    getLaunchAtLogin: async () => false,
    setLaunchAtLogin: async (enabled) => Boolean(enabled),
    startWindowDrag: async () => {},
    onNativeDragDrop: async () => () => {}
  };
}
