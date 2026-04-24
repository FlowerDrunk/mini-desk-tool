export function registerWindowShellFeature(app) {
  app.bindDragBand = bindDragBand;

  function bindDragBand() {
    const finishWindowDrag = (shouldSnap = true) => {
      if (!app.refs.appShell.classList.contains("is-window-dragging")) return;
      app.refs.appShell.classList.remove("is-window-dragging");
      if (shouldSnap) void app.desktopPanel?.snapAfterDrag?.();
    };
    const useNativeDragLifecycle =
      Boolean(window.__TAURI_INTERNALS__) && typeof app.desktopPanel?.startWindowDrag === "function";

    app.refs.windowDragBand.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      app.refs.appShell.classList.add("is-window-dragging");
      if (useNativeDragLifecycle) {
        Promise.resolve(app.desktopPanel.startWindowDrag())
          .then(() => finishWindowDrag(false))
          .catch(() => finishWindowDrag(false));
      }
    });

    if (!useNativeDragLifecycle) {
      window.addEventListener("pointerup", () => finishWindowDrag(true));
      window.addEventListener("pointercancel", () => finishWindowDrag(false));
    }
  }
}
