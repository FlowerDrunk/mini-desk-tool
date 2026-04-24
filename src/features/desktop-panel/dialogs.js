import {
  buildExportPayload,
  clampNumber,
  DEFAULT_GROUP_ID,
  extractImportedState,
  findItem,
  inferGroupName,
  NEW_AUTO_GROUP,
  TRACK_COUNT_MAX,
  TRACK_COUNT_MIN,
  uniqueGroupName,
  WINDOW_WIDTH_MAX,
  WINDOW_WIDTH_MIN
} from "./model.js";

export function registerDialogFeature(app) {
  app.bindEvents = bindEvents;
  app.exportDataToFile = exportDataToFile;
  app.importDataFromFile = importDataFromFile;
  app.refreshGroupOptions = refreshGroupOptions;
  app.ensureGroupBySelection = ensureGroupBySelection;
  app.openAddDialog = openAddDialog;
  app.openEditDialog = openEditDialog;
  app.syncEditDialogFields = syncEditDialogFields;
  app.syncSettingsDialogFields = syncSettingsDialogFields;
  app.openSettings = openSettings;
  app.hideMenus = hideMenus;
  app.openMenu = openMenu;
  app.shouldAutoSearchOfficialLink = shouldAutoSearchOfficialLink;
  app.removeItem = removeItem;
  app.autoGroupByContent = autoGroupByContent;

  async function exportDataToFile() {
    try {
      const result = await app.desktopPanel?.exportStateFile?.(buildExportPayload(app.store));
      if (result?.canceled) return;
      if (result?.filePath) app.showDragToast(`数据已导出到 ${result.filePath}`);
    } catch {
      app.showDragToast("导出失败，请稍后重试");
    }
  }

  async function importDataFromFile() {
    try {
      const result = await app.desktopPanel?.importStateFile?.();
      if (result?.canceled || !result?.content) return;

      const nextState = app.hydrateState(extractImportedState(JSON.parse(result.content)));
      app.store.state = nextState;
      app.saveState();
      app.applyLayout();
      app.desktopPanel?.setSnapEnabled?.(app.store.state.app.snapToEdge);
      app.render();
      if (app.refs.settingsDialog.open) await syncSettingsDialogFields();
      app.showDragToast(`数据已从 ${result.filePath} 导入`);
    } catch {
      app.showDragToast("导入失败，请确认选择的是有效备份文件");
    }
  }

  function bindEvents() {
    app.refs.cancelAddDialog.addEventListener("click", () => closeDialog(app.refs.addDialog));
    app.refs.cancelSettingsDialog.addEventListener("click", () => closeDialog(app.refs.settingsDialog));
    app.refs.cancelEditDialog.addEventListener("click", () => closeDialog(app.refs.editDialog));

    app.refs.addForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(app.refs.addForm);
      const title = String(formData.get("title") || "").trim();
      const description = String(formData.get("description") || "").trim();
      const url = app.normalizeUrl(String(formData.get("url") || "").trim());
      const groupId = String(formData.get("groupId") || "");
      if (!title || !url) return;

      const actualGroupId = ensureGroupBySelection(groupId, title, url);
      const targetGroup = app.findGroup(actualGroupId) || app.store.state.groups[0];
      const addPicker = app.runtime.iconPickers.add;
      const nextItem = {
        id: crypto.randomUUID(),
        title,
        description,
        url,
        size: "1x1",
        iconMode: addPicker.selectedUrl ? "custom" : "default",
        customIcon: addPicker.selectedUrl,
        shortcutIcon: ""
      };
      const insertIndex = app.runtime.addDialogSource === "menu" ? 0 : targetGroup.items.length;
      targetGroup.items.splice(insertIndex, 0, nextItem);
      app.saveState();
      app.render();
      closeDialog(app.refs.addDialog);
    });

    app.refs.editForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!app.runtime.activeItemContext) return;

      const item = app.findItem(app.runtime.activeItemContext.groupId, app.runtime.activeItemContext.itemId);
      if (!item) return;

      const nextGroupId = String(app.refs.editGroupSelect.value || "");
      const nextTitle = app.refs.editTitleInput.value.trim();
      const nextDescription = app.refs.editDescriptionInput.value.trim();
      const nextUrl = app.normalizeUrl(app.refs.editUrlInput.value.trim());
      const nextSize = app.refs.editSizeSelect.value;
      const nextIconMode = app.refs.editIconModeSelect.value === "custom" ? "custom" : "default";
      const nextCustomIcon = app.refs.editCustomIconInput.value.trim();

      if (!nextTitle || !nextUrl || !app.sizeMeta[nextSize]) return;

      item.title = nextTitle;
      item.description = nextDescription;
      item.url = nextUrl;
      item.size = nextSize;
      item.iconMode = nextIconMode;
      item.customIcon = nextIconMode === "custom" ? nextCustomIcon : "";

      if (nextGroupId && nextGroupId !== app.runtime.activeItemContext.groupId) {
        app.moveItem(
          app.runtime.activeItemContext.groupId,
          nextGroupId,
          item.id,
          app.findGroup(nextGroupId)?.items.length ?? 0,
          false
        );
        app.runtime.activeItemContext = { groupId: nextGroupId, itemId: item.id };
      }

      app.saveState();
      app.render();
      closeDialog(app.refs.editDialog);
    });

    app.refs.editIconModeSelect.addEventListener("change", () => syncEditDialogFields());
    app.refs.editCustomIconInput.addEventListener("input", () => {
      app.runtime.iconPickers.edit.selectedUrl = app.refs.editCustomIconInput.value.trim();
      app.renderIconSuggestions("edit");
    });

    app.refs.addUrlInput.addEventListener("input", () => app.renderIconSuggestions("add"));
    app.refs.addRefreshIconsButton?.addEventListener("click", () => app.rotateIconSuggestions("add"));
    app.refs.editRefreshIconsButton?.addEventListener("click", () => app.rotateIconSuggestions("edit"));

    app.refs.addDescriptionInput.addEventListener("input", () => {
      if (shouldAutoSearchOfficialLink("add")) {
        app.scheduleOfficialLinkSearch("add", app.refs.addDescriptionInput.value);
      } else {
        app.cancelOfficialLinkSearch("add");
        app.setLinkSearchStatus("add", "当前入口不自动搜索官网，请手动填写地址或路径");
      }
      app.scheduleIconSuggestionSearch("add", app.refs.addDescriptionInput.value, { autoSelectFirst: true });
    });

    app.refs.editDescriptionInput.addEventListener("input", () => {
      app.cancelOfficialLinkSearch("edit");
      app.setLinkSearchStatus("edit", "编辑时不自动搜索官网，请按需手动修改地址");
      app.scheduleIconSuggestionSearch("edit", app.refs.editDescriptionInput.value, {
        preferUrl: app.refs.editCustomIconInput.value.trim(),
        autoSelectFirst: !app.refs.editCustomIconInput.value.trim()
      });
    });

    app.refs.workspace.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      const tile = event.target.closest(".tile");
      hideMenus();
      if (tile) {
        app.runtime.activeItemContext = { groupId: tile.dataset.groupId, itemId: tile.dataset.itemId };
        openMenu(app.refs.itemContextMenu, event.clientX, event.clientY);
        return;
      }
      openMenu(app.refs.appContextMenu, event.clientX, event.clientY);
    });

    app.refs.workspace.addEventListener("dblclick", (event) => {
      const title = event.target.closest(".group-title");
      if (title) app.beginRenameGroup(title.dataset.groupId);
    });

    app.refs.workspace.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      if (event.target.closest(".tile") || event.target.closest(".add-tile") || event.target.closest(".context-menu")) return;
      hideMenus();
    });

    document.addEventListener(
      "pointerdown",
      (event) => {
        if (event.button !== 0) return;
        if (event.target.closest(".context-menu")) return;
        hideMenus();
      },
      true
    );

    window.addEventListener("blur", hideMenus);

    app.refs.appContextMenu.addEventListener("click", (event) => {
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (!action) return;
      hideMenus();
      if (action === "open-settings") void openSettings();
      if (action === "add-icon") openAddDialog("menu");
    });

    app.refs.itemContextMenu.addEventListener("click", (event) => {
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (!action || !app.runtime.activeItemContext) return;

      const context = app.runtime.activeItemContext;
      const item = app.findItem(context.groupId, context.itemId);
      hideMenus();
      if (!item) return;

      if (action === "edit-item") {
        openEditDialog(context.groupId, context.itemId);
        return;
      }

      if (action === "duplicate-item") {
        const group = app.findGroup(context.groupId);
        if (!group) return;
        const index = group.items.findIndex((entry) => entry.id === item.id);
        group.items.splice(index + 1, 0, { ...structuredClone(item), id: crypto.randomUUID() });
        app.saveState();
        app.render();
        return;
      }

      if (action === "delete-item") removeItem(context.groupId, context.itemId);
    });

    app.refs.iconSizeInput.addEventListener("input", () => {
      app.store.state.layout.iconSize = clampNumber(Number(app.refs.iconSizeInput.value), 42, 76, 58);
      app.applyLayout();
      app.saveState();
      app.render();
    });

    app.refs.windowWidthInput.addEventListener("input", () => {
      app.store.state.layout.windowWidth = clampNumber(
        Number(app.refs.windowWidthInput.value),
        WINDOW_WIDTH_MIN,
        WINDOW_WIDTH_MAX,
        360
      );
      app.saveState();
    });
    app.refs.windowWidthInput.addEventListener("change", () => {
      void syncWindowWidth();
    });

    app.refs.showAddTileInput.addEventListener("change", () => {
      app.store.state.layout.showAddTile = app.refs.showAddTileInput.checked;
      app.saveState();
      app.render();
    });

    app.refs.showGroupTitleInput.addEventListener("change", () => {
      app.store.state.layout.showGroupTitle = app.refs.showGroupTitleInput.checked;
      app.saveState();
      app.render();
    });

    app.refs.layoutDirectionInput.addEventListener("change", () => {
      app.store.state.layout.flowDirection = app.refs.layoutDirectionInput.value === "rtl" ? "rtl" : "ltr";
      app.applyLayout();
      app.saveState();
      app.render();
    });

    app.refs.trackCountInput.addEventListener("input", () => {
      app.store.state.layout.trackCount = clampNumber(
        Number(app.refs.trackCountInput.value),
        TRACK_COUNT_MIN,
        TRACK_COUNT_MAX,
        3
      );
      app.updateTrackCountHint();
      app.applyLayout();
      app.saveState();
      app.render();
    });

    app.refs.snapEdgeInput.addEventListener("change", () => {
      app.store.state.app.snapToEdge = app.refs.snapEdgeInput.checked;
      app.desktopPanel?.setSnapEnabled?.(app.store.state.app.snapToEdge);
      app.saveState();
    });

    app.refs.launchAtLoginInput?.addEventListener("change", async () => {
      const nextValue = app.refs.launchAtLoginInput.checked;
      try {
        const applied = await app.desktopPanel?.setLaunchAtLogin?.(nextValue);
        app.refs.launchAtLoginInput.checked = Boolean(applied);
      } catch {
        app.refs.launchAtLoginInput.checked = !nextValue;
      }
    });

    app.refs.exportDataButton?.addEventListener("click", () => void exportDataToFile());
    app.refs.importDataButton?.addEventListener("click", () => void importDataFromFile());
    app.refs.autoGroupButton.addEventListener("click", () => {
      autoGroupByContent();
      app.saveState();
      app.render();
    });
    app.refs.closeWindowButton.addEventListener("click", () => app.desktopPanel?.closeWindow?.());

    app.bindExternalShortcutDrop();
  }

  function refreshGroupOptions(select, includeAuto = true) {
    if (!select) return;
    select.innerHTML = "";
    app.store.state.groups.forEach((group) => {
      const option = document.createElement("option");
      option.value = group.id;
      option.textContent = group.name;
      select.appendChild(option);
    });

    if (includeAuto) {
      const autoOption = document.createElement("option");
      autoOption.value = NEW_AUTO_GROUP;
      autoOption.textContent = "新建自动分组";
      select.appendChild(autoOption);
    }
  }

  function ensureGroupBySelection(selectedGroupId, title, url) {
    if (selectedGroupId && selectedGroupId !== NEW_AUTO_GROUP) return selectedGroupId;
    if (selectedGroupId === NEW_AUTO_GROUP) {
      const groupName = uniqueGroupName(app.store, inferGroupName(title, url, ""));
      const newGroup = { id: crypto.randomUUID(), name: groupName, items: [] };
      app.store.state.groups.push(newGroup);
      return newGroup.id;
    }
    return app.store.state.groups[0].id;
  }

  function openAddDialog(source = "tile") {
    hideMenus();
    app.refs.addForm.reset();
    app.runtime.addDialogSource = source === "menu" ? "menu" : "tile";
    app.cancelOfficialLinkSearch("add");
    const picker = app.runtime.iconPickers.add;
    picker.batchIndex = 0;
    picker.refreshCooldownUntil = 0;
    clearTimeout(picker.refreshCooldownTimer);
    refreshGroupOptions(app.refs.groupSelect);
    picker.suggestions = [];
    picker.selectedUrl = "";
    app.runtime.pendingEditOriginalIconUrl = "";
    app.setIconSearchStatus("add", "输入描述后自动搜索");
    app.setLinkSearchStatus(
      "add",
      shouldAutoSearchOfficialLink("add") ? "根据描述自动补全官方链接" : "当前入口不自动搜索官网，请手动填写地址或路径"
    );
    app.renderIconSuggestions("add");
    showDialogAtPoint(app.refs.addDialog);
  }

  function openEditDialog(groupId, itemId) {
    const item = findItem(app.store, groupId, itemId);
    if (!item) return;

    app.runtime.activeItemContext = { groupId, itemId };
    app.cancelOfficialLinkSearch("edit");

    const picker = app.runtime.iconPickers.edit;
    picker.batchIndex = 0;
    picker.refreshCooldownUntil = 0;
    clearTimeout(picker.refreshCooldownTimer);

    refreshGroupOptions(app.refs.editGroupSelect, false);
    app.refs.editTitleInput.value = item.title;
    app.refs.editDescriptionInput.value = item.description || "";
    app.refs.editUrlInput.value = item.url;
    app.refs.editGroupSelect.value = groupId;
    app.refs.editSizeSelect.value = item.size;
    app.refs.editIconModeSelect.value = item.iconMode || "default";
    app.refs.editCustomIconInput.value = item.customIcon || "";
    picker.selectedUrl = item.iconMode === "custom" ? item.customIcon || "" : "";
    app.runtime.pendingEditOriginalIconUrl =
      item.shortcutIcon || `https://icons.duckduckgo.com/ip3/${app.safeHost(item.url)}.ico`;
    syncEditDialogFields(item.shortcutIcon);
    app.setLinkSearchStatus("edit", "编辑时不自动搜索官网，请按需手动修改地址");
    app.scheduleIconSuggestionSearch("edit", item.description || "", {
      preferUrl: picker.selectedUrl,
      autoSelectFirst: false
    });
    showDialogAtPoint(app.refs.editDialog);
  }

  function syncEditDialogFields(shortcutIcon = "") {
    const isCustom = app.refs.editIconModeSelect.value === "custom";
    app.refs.editCustomIconField.hidden = !isCustom;
    app.refs.editCustomIconInput.toggleAttribute("required", isCustom);
    if (!isCustom) app.runtime.iconPickers.edit.selectedUrl = "";
    app.refs.editIconModeHint.textContent = shortcutIcon
      ? "默认会优先保留该快捷方式原有图标。"
      : "默认会优先使用更清晰的网站站点图标。";
    app.renderIconSuggestions("edit");
  }

  async function syncSettingsDialogFields() {
    app.refs.iconSizeInput.value = String(app.store.state.layout.iconSize);
    app.refs.windowWidthInput.value = String(
      clampNumber(app.store.state.layout.windowWidth, WINDOW_WIDTH_MIN, WINDOW_WIDTH_MAX, 360)
    );
    app.refs.showAddTileInput.checked = !!app.store.state.layout.showAddTile;
    app.refs.showGroupTitleInput.checked = !!app.store.state.layout.showGroupTitle;
    app.refs.layoutDirectionInput.value = app.store.state.layout.flowDirection === "rtl" ? "rtl" : "ltr";
    app.refs.trackCountInput.value = String(app.store.state.layout.trackCount);
    app.updateTrackCountHint();
    app.refs.snapEdgeInput.checked = !!app.store.state.app.snapToEdge;
    if (app.refs.launchAtLoginInput) {
      try {
        app.refs.launchAtLoginInput.checked = Boolean(await app.desktopPanel?.getLaunchAtLogin?.());
      } catch {
        app.refs.launchAtLoginInput.checked = false;
      }
    }
  }

  async function openSettings() {
    hideMenus();
    await syncSettingsDialogFields();
    showDialogAtPoint(app.refs.settingsDialog);
  }

  function hideMenus() {
    app.refs.appContextMenu.hidden = true;
    app.refs.itemContextMenu.hidden = true;
  }

  function openMenu(menu, x, y) {
    menu.hidden = false;
    app.runtime.lastMenuPoint = {
      x: Number(x),
      y: Number(y)
    };
    const preferredX = Number(x) - 2;
    const preferredY = Number(y) - 8;
    const maxX = window.innerWidth - menu.offsetWidth - 8;
    const maxY = window.innerHeight - menu.offsetHeight - 8;
    menu.style.left = `${Math.max(6, Math.min(preferredX, maxX))}px`;
    menu.style.top = `${Math.max(6, Math.min(preferredY, maxY))}px`;
  }

  function showDialogAtPoint(dialog) {
    closeOtherDialogs(dialog);
    dialog.style.left = "";
    dialog.style.top = "";
    dialog.style.transform = "";
    dialog.hidden = false;
    dialog.style.visibility = "hidden";
    dialog.setAttribute("open", "");
    updateDialogState();

    queueMicrotask(() => {
      positionDialog(dialog);
      dialog.style.visibility = "";
      const focusTarget = dialog.querySelector("input, select, button, textarea");
      if (focusTarget instanceof HTMLElement) focusTarget.focus();
    });
  }

  function closeDialog(dialog) {
    dialog.removeAttribute("open");
    dialog.hidden = true;
    dialog.style.visibility = "";
    dialog.style.left = "";
    dialog.style.top = "";
    dialog.style.transform = "";
    updateDialogState();
  }

  function closeOtherDialogs(activeDialog) {
    [app.refs.addDialog, app.refs.settingsDialog, app.refs.editDialog]
      .filter((dialog) => dialog && dialog !== activeDialog && dialog.open)
      .forEach((dialog) => closeDialog(dialog));
  }

  function updateDialogState() {
    const hasOpenDialog = [app.refs.addDialog, app.refs.settingsDialog, app.refs.editDialog].some((dialog) => dialog?.open);
    app.refs.appShell.classList.toggle("is-dialog-open", hasOpenDialog);
  }

  function positionDialog(dialog) {
    dialog.style.left = "50%";
    dialog.style.top = "100px";
    dialog.style.transform = "translateX(-50%)";
  }

  async function syncWindowWidth() {
    await app.desktopPanel?.setWindowSize?.(app.store.state.layout.windowWidth);

    if (!app.refs.settingsDialog.open) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        positionDialog(app.refs.settingsDialog);
      });
    });
  }

  function shouldAutoSearchOfficialLink(type) {
    return type === "add" && app.runtime.addDialogSource === "menu";
  }

  function removeItem(groupId, itemId) {
    const group = app.findGroup(groupId);
    if (!group) return;
    group.items = group.items.filter((item) => item.id !== itemId);
    if (!group.items.length && group.id !== DEFAULT_GROUP_ID) {
      app.store.state.groups = app.store.state.groups.filter((entry) => entry.id !== group.id);
    }
    app.ensureValidGroups();
    app.saveState();
    app.render();
  }

  function autoGroupByContent() {
    const allItems = app.store.state.groups.flatMap((group) => group.items);
    if (!allItems.length) return;

    const grouped = new Map();
    allItems.forEach((item) => {
      const groupName = inferGroupName(item.title, item.url, item.description);
      if (!grouped.has(groupName)) grouped.set(groupName, []);
      grouped.get(groupName).push(item);
    });

    app.store.state.groups = Array.from(grouped.entries()).map(([name, items], index) => ({
      id: index === 0 ? DEFAULT_GROUP_ID : crypto.randomUUID(),
      name,
      items
    }));

    app.ensureValidGroups();
  }
}
