export function registerWindowShellFeature(app) {
  const DRAWER_HOVER_EXPAND_DELAY_MS = 180;
  app.bindDragBand = bindDragBand;
  app.syncDrawerHandle = syncDrawerHandle;
  app.expandDrawer = expandDrawer;
  app.collapseDrawer = collapseDrawer;
  app.scheduleDrawerCollapse = scheduleDrawerCollapse;
  let drawerCollapseTimer = null;
  let drawerExpandTimer = null;

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

    app.refs.drawerHandle?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void expandDrawer();
    });

    app.refs.drawerHandle?.addEventListener("pointerenter", () => {
      if (app.store.state.app.drawerTrigger === "click") return;
      scheduleDrawerExpand();
    });

    app.refs.drawerHandle?.addEventListener("pointerleave", () => {
      clearTimeout(drawerExpandTimer);
    });

    app.refs.drawerHandle?.addEventListener("focus", () => {
      if (app.store.state.app.drawerTrigger === "click") return;
      scheduleDrawerExpand();
    });

    app.refs.appShell?.addEventListener("pointerenter", () => {
      clearDrawerTimers();
    });

    app.refs.appShell?.addEventListener("pointerleave", () => {
      scheduleDrawerCollapse();
    });
  }

  function syncDrawerHandle() {
    const enabled = !!app.store.state.app.drawerModeEnabled;
    const edge = resolveDrawerEdgeForUi(app.store.state.app.drawerEdge, app.store.state.app.snapEdge);
    if (app.refs.drawerHandle) {
      app.refs.drawerHandle.hidden = !enabled;
      app.refs.drawerHandle.setAttribute("aria-hidden", enabled ? "false" : "true");
    }
    if (!app.refs.appShell) return;
    app.refs.appShell.dataset.drawerEnabled = enabled ? "true" : "false";
    app.refs.appShell.dataset.drawerEdge = edge;
    if (!enabled) {
      clearDrawerTimers();
      app.refs.appShell.dataset.drawerCollapsed = "false";
      app.refs.appShell.dataset.drawerPendingCollapse = "false";
    } else if (!app.refs.appShell.dataset.drawerCollapsed) {
      app.refs.appShell.dataset.drawerCollapsed = "false";
      app.refs.appShell.dataset.drawerPendingCollapse = "false";
    }
  }

  async function expandDrawer() {
    if (!app.store.state.app.drawerModeEnabled) return;
    clearDrawerTimers();
    syncDrawerHandle();
    app.refs.appShell.dataset.drawerCollapsed = "false";
    app.refs.appShell.dataset.drawerPendingCollapse = "false";
    app.refs.appShell.dataset.drawerAnimating = "expand";
    await app.desktopPanel?.setDrawerCollapsed?.(false);
    clearDrawerAnimating();
  }

  async function collapseDrawer() {
    if (!app.store.state.app.drawerModeEnabled || shouldKeepDrawerOpen()) {
      if (app.refs.appShell) app.refs.appShell.dataset.drawerPendingCollapse = "false";
      return;
    }
    clearDrawerTimers();
    syncDrawerHandle();
    app.refs.appShell.dataset.drawerCollapsed = "true";
    app.refs.appShell.dataset.drawerPendingCollapse = "false";
    app.refs.appShell.dataset.drawerAnimating = "collapse";
    await app.desktopPanel?.setDrawerCollapsed?.(true);
    clearDrawerAnimating();
  }

  function scheduleDrawerCollapse({ immediate = false } = {}) {
    if (!app.store.state.app.drawerModeEnabled || shouldKeepDrawerOpen()) return;
    clearTimeout(drawerCollapseTimer);
    const delay = immediate ? 0 : Math.max(0, Number(app.store.state.app.drawerCollapseDelay || 450));
    app.refs.appShell.dataset.drawerPendingCollapse = delay > 0 ? "true" : "false";
    drawerCollapseTimer = setTimeout(() => {
      void collapseDrawer();
    }, delay);
  }

  function scheduleDrawerExpand() {
    if (!app.store.state.app.drawerModeEnabled) return;
    clearTimeout(drawerExpandTimer);
    drawerExpandTimer = setTimeout(() => {
      void expandDrawer();
    }, DRAWER_HOVER_EXPAND_DELAY_MS);
  }

  function clearDrawerTimers() {
    clearTimeout(drawerCollapseTimer);
    clearTimeout(drawerExpandTimer);
    if (app.refs.appShell) app.refs.appShell.dataset.drawerPendingCollapse = "false";
  }

  function clearDrawerAnimating() {
    setTimeout(() => {
      if (app.refs.appShell) app.refs.appShell.dataset.drawerAnimating = "false";
    }, 220);
  }

  function shouldKeepDrawerOpen() {
    return Boolean(
      app.hasOpenDialog?.() ||
        app.hasVisibleMenu?.() ||
        app.runtime?.pointerDrag ||
        app.runtime?.dragData ||
        app.runtime?.externalDragDepth > 0
    );
  }
}

function resolveDrawerEdgeForUi(drawerEdge, snapEdge) {
  const edge = String(drawerEdge || "").toLowerCase();
  if (["left", "right", "top", "bottom"].includes(edge)) return edge;
  const fallback = String(snapEdge || "").toLowerCase();
  if (["left", "right", "top", "bottom"].includes(fallback)) return fallback;
  return "right";
}
