import {
  clampNumber,
  DEFAULT_GROUP_ID,
  DEFAULT_GROUP_ID as DEFAULT_GROUP,
  normalizeUrl,
  repairDisplayText
} from "./model.js";

export function registerDragDropFeature(app) {
  app.bindGridDropEvents = bindGridDropEvents;
  app.getDropIndex = getDropIndex;
  app.importDroppedPaths = importDroppedPaths;
  app.importDroppedFiles = importDroppedFiles;
  app.addResolvedShortcutsToGroup = addResolvedShortcutsToGroup;
  app.getDropTargetFromPosition = getDropTargetFromPosition;
  app.clearAllDropTargets = clearAllDropTargets;
  app.bindExternalShortcutDrop = bindExternalShortcutDrop;
  app.moveItem = moveItem;
  app.startPointerDrag = startPointerDrag;
  app.updateDropIndicator = updateDropIndicator;
  app.clearDropIndicator = clearDropIndicator;
  app.normalizeViewportPoint = normalizeViewportPoint;

  function bindGridDropEvents(grid, groupSection, toGroupId) {
    const activateDropTarget = (event) => {
      if (!app.runtime.dragData && !isExternalFileDrag(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = app.runtime.dragData ? "move" : "copy";
      grid.classList.add("drop-target");
      groupSection.classList.add("group-drop-target");
      updateDropIndicator(grid, event);
    };

    grid.addEventListener("dragover", activateDropTarget);
    groupSection.addEventListener("dragover", activateDropTarget);

    const handleDragLeave = (event) => {
      if (groupSection.contains(event.relatedTarget)) return;
      grid.classList.remove("drop-target", "drop-full");
      groupSection.classList.remove("group-drop-target");
      clearDropIndicator();
    };

    grid.addEventListener("dragleave", handleDragLeave);
    groupSection.addEventListener("dragleave", handleDragLeave);

    const handleDrop = async (event) => {
      event.preventDefault();
      grid.classList.remove("drop-target");
      groupSection.classList.remove("group-drop-target");
      clearDropIndicator();

      if (hasDroppedFilesystemEntries(event)) {
        event.stopPropagation();
        await importDroppedPaths(event, toGroupId, getDropIndex(grid, event));
        return;
      }

      if (!app.runtime.dragData) return;
      const toGroup = app.findGroup(toGroupId);
      if (!toGroup) return;

      const isCrossGroup = app.runtime.dragData.fromGroupId !== toGroupId;
      const dropIndex = isCrossGroup || toGroup.items.length === 0
        ? toGroup.items.length
        : getDropIndex(grid, event);
      moveItem(app.runtime.dragData.fromGroupId, toGroupId, app.runtime.dragData.itemId, dropIndex, false);
    };

    grid.addEventListener("drop", (event) => void handleDrop(event));
    groupSection.addEventListener("drop", (event) => void handleDrop(event));
  }

  function getDropIndex(grid, event) {
    const group = app.findGroup(grid.dataset.groupId);
    const tiles = Array.from(grid.querySelectorAll(".tile"));
    if (!group || !tiles.length) return 0;

    const direction = app.store.state.layout.flowDirection === "rtl" ? "rtl" : "ltr";
    const firstRect = tiles[0].getBoundingClientRect();
    const lastRect = tiles[tiles.length - 1].getBoundingClientRect();

    if (event.clientX < firstRect.left || event.clientY < firstRect.top) return 0;
    if (event.clientX > lastRect.right || event.clientY > lastRect.bottom) return group.items.length;

    const nearestTile = tiles.reduce((best, tile) => {
      const rect = tile.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = Math.hypot(event.clientX - centerX, event.clientY - centerY);
      if (!best || distance < best.distance) {
        return { tile, rect, distance };
      }
      return best;
    }, null);

    if (!nearestTile) return group.items.length;
    const tileIndex = Number(nearestTile.tile.dataset.index);
    if (!Number.isFinite(tileIndex)) return group.items.length;

    const before = direction === "rtl"
      ? event.clientX > nearestTile.rect.left + nearestTile.rect.width / 2
      : event.clientX < nearestTile.rect.left + nearestTile.rect.width / 2;

    return before ? tileIndex : tileIndex + 1;
  }

  function extractDroppedFilePaths(event) {
    return Array.from(event.dataTransfer?.files || [])
      .map((file) => String(file?.path || "").trim())
      .filter(Boolean);
  }

  async function importDroppedPaths(event, targetGroupId, dropIndex) {
    await importDroppedFiles(extractDroppedFilePaths(event), targetGroupId, dropIndex);
  }

  async function importDroppedFiles(filePaths, targetGroupId, dropIndex) {
    if (!filePaths.length) return;

    if (!window.__TAURI_INTERNALS__ && !window.__desktopPanelMock) {
      app.showDragToast?.("浏览器预览页不支持桌面快捷方式导入，请在 Tauri 客户端中测试");
      return;
    }

    let shortcuts = [];
    try {
      shortcuts = (await app.desktopPanel?.resolveDroppedPaths?.(filePaths)) || [];
    } catch {
      app.runtime.externalDragDepth = 0;
      clearAllDropTargets();
      app.showDragToast?.("快捷方式解析失败，请确认文件仍然存在");
      return;
    }

    if (!Array.isArray(shortcuts) || !shortcuts.length) {
      app.runtime.externalDragDepth = 0;
      clearAllDropTargets();
      app.showDragToast?.("没有识别到可添加的快捷方式");
      return;
    }

    await addResolvedShortcutsToGroup(targetGroupId, shortcuts, dropIndex);
    app.runtime.externalDragDepth = 0;
    clearAllDropTargets();
  }

  function getDropTargetFromPosition(position) {
    const normalizedPoint = normalizeViewportPoint(position);
    const x = normalizedPoint?.x;
    const y = normalizedPoint?.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { dropGrid: null, targetGroupId: DEFAULT_GROUP, dropIndex: undefined, groupSection: null };
    }

    const target = document.elementFromPoint(x, y);
    const dropGrid = getRealDropGrid(target);
    const groupSection = dropGrid?.closest(".group") || null;
    const targetGroupId = dropGrid?.dataset.groupId || DEFAULT_GROUP;
    const dropIndex = dropGrid ? getDropIndex(dropGrid, { clientX: x, clientY: y }) : undefined;
    return { dropGrid, targetGroupId, dropIndex, groupSection };
  }

  function getRealDropGrid(target) {
    const dropGrid = target?.closest?.(".group-grid") || null;
    return dropGrid?.dataset.recent === "true" ? null : dropGrid;
  }

  async function addResolvedShortcutsToGroup(targetGroupId, shortcuts, dropIndex) {
    const group = app.findGroup(targetGroupId) || app.findGroup(DEFAULT_GROUP_ID) || app.store.state.groups[0];
    if (!group) return;

    const normalizedShortcuts = shortcuts
      .filter((shortcut) => shortcut && typeof shortcut.title === "string" && typeof shortcut.url === "string")
      .map((shortcut) => ({
        id: crypto.randomUUID(),
        title: repairDisplayText(shortcut.title.trim() || "快捷方式"),
        description: repairDisplayText(shortcut.title.trim() || "快捷方式"),
        url: normalizeUrl(shortcut.url),
        size: "1x1",
        iconMode: "default",
        customIcon: "",
        shortcutIcon: String(shortcut.shortcutIcon || "").trim()
      }))
      .filter((shortcut) => shortcut.url);

    if (!normalizedShortcuts.length) return;

    const insertAt = Number.isInteger(dropIndex)
      ? clampNumber(dropIndex, 0, group.items.length, group.items.length)
      : group.items.length;
    group.items.splice(insertAt, 0, ...normalizedShortcuts);
    app.saveState();
    app.render();
    queueShortcutIconSearchTasks(normalizedShortcuts.map((item) => item.id));
  }

  function queueShortcutIconSearchTasks(itemIds) {
    const ids = Array.isArray(itemIds) ? itemIds.filter(Boolean) : [];
    if (!ids.length) return;

    setTimeout(() => {
      ids.forEach((itemId, index) => {
        setTimeout(() => {
          void enrichShortcutIconInBackground(itemId);
        }, index * 120);
      });
    }, 0);
  }

  async function enrichShortcutIconInBackground(itemId) {
    const located = app.findItemById(itemId);
    if (!located?.item) return;
    if (located.item.iconMode === "custom" && located.item.customIcon) return;

    const query = located.item.description || located.item.title;
    if (!String(query || "").trim()) return;

    let suggestions = [];
    try {
      suggestions = (await app.desktopPanel?.searchIconSuggestions?.(query)) || [];
    } catch {
      suggestions = [];
    }

    if (!Array.isArray(suggestions) || !suggestions[0]?.url) return;

    const latest = app.findItemById(itemId);
    if (!latest?.item) return;
    if (latest.item.iconMode === "custom" && latest.item.customIcon) return;

    latest.item.iconMode = "custom";
    latest.item.customIcon = suggestions[0].url;
    app.saveState();
    app.render();
  }

  function clearAllDropTargets() {
    document.querySelectorAll(".group-grid").forEach((grid) => grid.classList.remove("drop-target", "drop-full", "drop-empty"));
    document.querySelectorAll(".group").forEach((group) => group.classList.remove("group-drop-target"));
    clearDropIndicator();
  }

  function bindExternalShortcutDrop() {
    const onDragEnter = (event) => {
      if (!isExternalFileDrag(event)) return;
      app.runtime.externalDragDepth += 1;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };

    const onDragOver = (event) => {
      if (!isExternalFileDrag(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };

    const onDragLeave = (event) => {
      if (!isExternalFileDrag(event)) return;
      app.runtime.externalDragDepth = Math.max(0, app.runtime.externalDragDepth - 1);
      if (app.runtime.externalDragDepth > 0) return;
      clearAllDropTargets();
    };

    const onDrop = async (event) => {
      if (!isExternalFileDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      app.runtime.externalDragDepth = 0;
      clearAllDropTargets();

      const dropGrid = getRealDropGrid(event.target);
      const targetGroupId = dropGrid?.dataset.groupId || DEFAULT_GROUP;
      const dropIndex = dropGrid ? getDropIndex(dropGrid, event) : undefined;
      await importDroppedPaths(event, targetGroupId, dropIndex);
    };

    window.addEventListener("dragenter", onDragEnter, true);
    window.addEventListener("dragover", onDragOver, true);
    window.addEventListener("dragleave", onDragLeave, true);
    window.addEventListener("drop", (event) => void onDrop(event), true);

    void app.desktopPanel?.onNativeDragDrop?.(async (payload) => {
      if (!payload || typeof payload !== "object") return;

      try {
        if (payload.type === "leave") {
          app.runtime.externalDragDepth = 0;
          clearAllDropTargets();
          return;
        }

        const { dropGrid, groupSection, targetGroupId, dropIndex } = getDropTargetFromPosition(payload.position);
        clearAllDropTargets();
        if (dropGrid) dropGrid.classList.add("drop-target");
        if (groupSection) groupSection.classList.add("group-drop-target");

        if (payload.type === "drop") {
          await importDroppedFiles(payload.paths || [], targetGroupId, dropIndex);
        }
      } catch {
        app.runtime.externalDragDepth = 0;
        clearAllDropTargets();
      }
    });
  }

  function isExternalFileDrag(event) {
    return Array.from(event.dataTransfer?.types || []).includes("Files");
  }

  function hasDroppedFilesystemEntries(event) {
    return Array.from(event.dataTransfer?.files || []).some((file) => String(file?.path || "").trim());
  }

  function moveItem(fromGroupId, toGroupId, itemId, dropIndex, shouldRender = true) {
    const fromGroup = app.findGroup(fromGroupId);
    const toGroup = app.findGroup(toGroupId);
    if (!fromGroup || !toGroup) return { ok: false, reason: "missing-group" };

    const fromIndex = fromGroup.items.findIndex((item) => item.id === itemId);
    if (fromIndex < 0) return { ok: false, reason: "missing-item" };

    let normalizedDropIndex = clampNumber(dropIndex, 0, toGroup.items.length, toGroup.items.length);
    if (fromGroupId === toGroupId && fromIndex < normalizedDropIndex) {
      normalizedDropIndex -= 1;
    }

    const [moved] = fromGroup.items.splice(fromIndex, 1);
    const safeIndex = clampNumber(normalizedDropIndex, 0, toGroup.items.length, toGroup.items.length);
    toGroup.items.splice(safeIndex, 0, moved);

    app.saveState();
    if (shouldRender) app.render();
    return { ok: true };
  }

  function startPointerDrag(event, itemId, fromGroupId, node) {
    if (event.button !== 0) return;
    if (!(node instanceof HTMLElement)) return;
    event.preventDefault();

    app.runtime.pointerDrag = {
      pointerId: event.pointerId,
      itemId,
      fromGroupId,
      node,
      started: false,
      startX: event.clientX,
      startY: event.clientY
    };

    const handlePointerMove = (moveEvent) => {
      const dragState = app.runtime.pointerDrag;
      if (!dragState || moveEvent.pointerId !== dragState.pointerId) return;

      const distance = Math.hypot(moveEvent.clientX - dragState.startX, moveEvent.clientY - dragState.startY);
      if (!dragState.started && distance < 8) return;

      if (!dragState.started) {
        dragState.started = true;
        app.runtime.dragData = {
          itemId: dragState.itemId,
          fromGroupId: dragState.fromGroupId
        };
        dragState.node.classList.add("dragging");
        app.refs.appShell.classList.add("is-item-dragging");
        document.documentElement.classList.add("is-item-dragging");
        createDragPreview(dragState.node, moveEvent.clientX, moveEvent.clientY);
      }

      moveEvent.preventDefault();
      updateDragPreview(moveEvent.clientX, moveEvent.clientY);
      const { dropGrid, groupSection } = getDropTargetFromPosition({
        x: moveEvent.clientX,
        y: moveEvent.clientY
      });

      clearAllDropTargets();
      if (!dropGrid) return;
      dropGrid.classList.add("drop-target");
      if (groupSection) groupSection.classList.add("group-drop-target");
      updateDropIndicator(dropGrid, moveEvent);
    };

    const finishPointerDrag = (finishEvent) => {
      const dragState = app.runtime.pointerDrag;
      if (!dragState || finishEvent.pointerId !== dragState.pointerId) return;

      const wasDragging = dragState.started;
      if (wasDragging) {
        finishEvent.preventDefault();
        const { dropGrid, targetGroupId } = getDropTargetFromPosition({
          x: finishEvent.clientX,
          y: finishEvent.clientY
        });
        const toGroup = app.findGroup(targetGroupId);
        if (dropGrid && toGroup) {
          const isCrossGroup = dragState.fromGroupId !== targetGroupId;
          const dropIndex = isCrossGroup || toGroup.items.length === 0
            ? toGroup.items.length
            : getDropIndex(dropGrid, finishEvent);
          moveItem(dragState.fromGroupId, targetGroupId, dragState.itemId, dropIndex, false);
        }

        app.runtime.preventNextClickItemId = dragState.itemId;
        clearTimeout(app.runtime.preventNextClickTimer);
        app.runtime.preventNextClickTimer = setTimeout(() => {
          app.runtime.preventNextClickItemId = null;
        }, 250);
      }

      dragState.node.classList.remove("dragging");
      app.refs.appShell.classList.remove("is-item-dragging");
      document.documentElement.classList.remove("is-item-dragging");
      destroyDragPreview();
      app.runtime.pointerDrag = null;
      app.runtime.dragData = null;
      clearAllDropTargets();
      cleanup();
      if (wasDragging) app.render();
    };

    const cancelPointerDrag = (cancelEvent) => {
      const dragState = app.runtime.pointerDrag;
      if (!dragState || cancelEvent.pointerId !== dragState.pointerId) return;
      const wasDragging = dragState.started;
      dragState.node.classList.remove("dragging");
      app.refs.appShell.classList.remove("is-item-dragging");
      document.documentElement.classList.remove("is-item-dragging");
      destroyDragPreview();
      app.runtime.pointerDrag = null;
      app.runtime.dragData = null;
      clearAllDropTargets();
      cleanup();
      if (wasDragging) app.render();
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", finishPointerDrag, true);
      window.removeEventListener("pointercancel", cancelPointerDrag, true);
    };

    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", finishPointerDrag, true);
    window.addEventListener("pointercancel", cancelPointerDrag, true);
  }

  function createDragPreview(sourceNode, clientX, clientY) {
    destroyDragPreview();
    const preview = sourceNode.cloneNode(true);
    preview.classList.remove("dragging", "drop-before", "drop-after");
    preview.classList.add("drag-preview");
    preview.removeAttribute("data-index");
    preview.style.width = `${sourceNode.offsetWidth}px`;
    preview.style.height = `${sourceNode.offsetHeight}px`;
    document.body.appendChild(preview);
    app.runtime.dragPreviewElement = preview;
    updateDragPreview(clientX, clientY);
  }

  function updateDragPreview(clientX, clientY) {
    const preview = app.runtime.dragPreviewElement;
    if (!preview) return;
    preview.style.left = `${clientX}px`;
    preview.style.top = `${clientY}px`;
  }

  function destroyDragPreview() {
    app.runtime.dragPreviewElement?.remove();
    app.runtime.dragPreviewElement = null;
  }

  function updateDropIndicator(grid, event) {
    if (!app.runtime.dragData || isExternalFileDrag(event)) return;
    const tiles = Array.from(grid.querySelectorAll(".tile"));
    const isCrossGroup = app.runtime.dragData.fromGroupId !== grid.dataset.groupId;
    grid.classList.toggle("drop-empty", !tiles.length);
    if (!tiles.length) {
      clearDropIndicator();
      return;
    }

    const dropIndex = isCrossGroup ? tiles.length : getDropIndex(grid, event);
    const targetTile = tiles.find((tile) => Number(tile.dataset.index) === Math.min(dropIndex, tiles.length - 1));
    if (!targetTile) {
      clearDropIndicator();
      return;
    }

    const before = !isCrossGroup && dropIndex <= Number(targetTile.dataset.index);
    if (
      app.runtime.dropIndicator?.element === targetTile &&
      app.runtime.dropIndicator.position === (before ? "before" : "after")
    ) {
      return;
    }

    clearDropIndicator();
    targetTile.classList.add(before ? "drop-before" : "drop-after");
    app.runtime.dropIndicator = {
      element: targetTile,
      position: before ? "before" : "after"
    };
  }

  function clearDropIndicator() {
    if (!app.runtime.dropIndicator?.element) return;
    app.runtime.dropIndicator.element.classList.remove("drop-before", "drop-after");
    app.runtime.dropIndicator = null;
  }

  function normalizeViewportPoint(position) {
    const rawX = Number(position?.x);
    const rawY = Number(position?.y);
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return null;

    const pixelRatio = Number(window.devicePixelRatio) || 1;
    const looksPhysical =
      pixelRatio > 1 &&
      (rawX > window.innerWidth + 1 || rawY > window.innerHeight + 1);

    const normalizedX = looksPhysical ? rawX / pixelRatio : rawX;
    const normalizedY = looksPhysical ? rawY / pixelRatio : rawY;

    return {
      x: Math.max(0, Math.min(normalizedX, Math.max(0, window.innerWidth - 1))),
      y: Math.max(0, Math.min(normalizedY, Math.max(0, window.innerHeight - 1)))
    };
  }
}
