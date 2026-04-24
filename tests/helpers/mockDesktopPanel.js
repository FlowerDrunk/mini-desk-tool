(function initDesktopPanelMock() {
  const normalize = (value) => String(value || "").trim().toLowerCase();

  const state = {
    launchAtLogin: false,
    importResult: { canceled: true },
    exportResult: { canceled: false, filePath: "C:\\exports\\desktop-panel-backup.json" },
    officialUrls: {},
    iconSuggestions: {},
    droppedShortcutsByPath: {},
    shortcutLocations: {},
    nativeDragDropHandler: null,
    calls: {
      closeWindow: [],
      exportStateFile: [],
      getLaunchAtLogin: [],
      importStateFile: [],
      openUrl: [],
      resolveDroppedPaths: [],
      scanShortcutLocations: [],
      searchIconSuggestions: [],
      searchOfficialUrl: [],
      setDropAccepting: [],
      setLaunchAtLogin: [],
      setSnapEnabled: [],
      setWindowSize: [],
      snapAfterDrag: []
    }
  };

  const mock = {
    state,
    resetCalls() {
      Object.keys(state.calls).forEach((key) => {
        state.calls[key] = [];
      });
    },
    setOfficialUrl(query, url) {
      state.officialUrls[normalize(query)] = String(url || "");
    },
    setIconSuggestions(query, suggestions) {
      state.iconSuggestions[normalize(query)] = Array.isArray(suggestions) ? suggestions : [];
    },
    setDroppedShortcut(filePath, shortcut) {
      state.droppedShortcutsByPath[String(filePath)] = shortcut;
    },
    setShortcutLocation(source, shortcuts) {
      state.shortcutLocations[normalize(source)] = Array.isArray(shortcuts) ? shortcuts : [];
    },
    emitNativeDragDrop(payload) {
      if (typeof state.nativeDragDropHandler === "function") {
        state.nativeDragDropHandler(payload);
      }
    },
    setImportPayload(payload, filePath = "C:\\imports\\desktop-panel-import.json") {
      state.importResult = {
        canceled: false,
        filePath,
        content: JSON.stringify(payload)
      };
    },
    cancelImport() {
      state.importResult = { canceled: true };
    }
  };

  try {
    window.localStorage.clear();
  } catch {}

  window.__desktopPanelMock = mock;
  window.desktopPanel = {
    closeWindow() {
      state.calls.closeWindow.push(true);
      return Promise.resolve();
    },
    exportStateFile(content) {
      state.calls.exportStateFile.push(String(content || ""));
      return Promise.resolve(state.exportResult);
    },
    getLaunchAtLogin() {
      state.calls.getLaunchAtLogin.push(true);
      return Promise.resolve(state.launchAtLogin);
    },
    importStateFile() {
      state.calls.importStateFile.push(true);
      return Promise.resolve(state.importResult);
    },
    openUrl(url) {
      state.calls.openUrl.push(String(url || ""));
      return Promise.resolve();
    },
    resolveDroppedPaths(filePaths) {
      const paths = Array.isArray(filePaths) ? filePaths.map((entry) => String(entry)) : [];
      state.calls.resolveDroppedPaths.push(paths);
      return Promise.resolve(
        paths
          .map((filePath) => state.droppedShortcutsByPath[filePath] || null)
          .filter(Boolean)
      );
    },
    scanShortcutLocations(sources) {
      const requested = Array.isArray(sources) && sources.length ? sources.map((entry) => String(entry)) : ["desktop", "startMenu"];
      state.calls.scanShortcutLocations.push(requested);
      return Promise.resolve(
        requested.flatMap((source) => state.shortcutLocations[normalize(source)] || [])
      );
    },
    searchIconSuggestions(query) {
      const key = normalize(query);
      state.calls.searchIconSuggestions.push(String(query || ""));
      return Promise.resolve(state.iconSuggestions[key] || []);
    },
    searchOfficialUrl(query) {
      const key = normalize(query);
      state.calls.searchOfficialUrl.push(String(query || ""));
      return Promise.resolve(state.officialUrls[key] || "");
    },
    setDropAccepting(accepting) {
      state.calls.setDropAccepting.push(Boolean(accepting));
      return Promise.resolve();
    },
    setLaunchAtLogin(enabled) {
      state.launchAtLogin = Boolean(enabled);
      state.calls.setLaunchAtLogin.push(Boolean(enabled));
      return Promise.resolve(state.launchAtLogin);
    },
    setSnapEnabled(enabled) {
      state.calls.setSnapEnabled.push(Boolean(enabled));
      return Promise.resolve();
    },
    setWindowSize(width, height) {
      state.calls.setWindowSize.push([width, height]);
      return Promise.resolve();
    },
    snapAfterDrag() {
      state.calls.snapAfterDrag.push(true);
      return Promise.resolve();
    },
    onNativeDragDrop(handler) {
      state.nativeDragDropHandler = handler;
      return Promise.resolve(() => {
        if (state.nativeDragDropHandler === handler) {
          state.nativeDragDropHandler = null;
        }
      });
    }
  };
})();
