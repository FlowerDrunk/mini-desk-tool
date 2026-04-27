import {
  buildExportPayload,
  BACKUP_RETENTION_MAX,
  BACKUP_RETENTION_MIN,
  clampNumber,
  applyProfileSnapshot,
  createProfileSnapshot,
  DEFAULT_GLOBAL_SHORTCUT,
  DEFAULT_GROUP_ID,
  extractImportedState,
  findItem,
  getNextProfileName,
  inferGroupName,
  LAYOUT_PRESETS,
  NEW_AUTO_GROUP,
  PANEL_OPACITY_MAX,
  PANEL_OPACITY_MIN,
  REVEAL_DELAY_MAX,
  REVEAL_DELAY_MIN,
  sanitizeLayoutPreset,
  sanitizeSearchEngine,
  sanitizeSnapEdge,
  sanitizeShortcut,
  sanitizeTheme,
  SNAP_DISTANCE_MAX,
  SNAP_DISTANCE_MIN,
  syncActiveProfileState,
  THEME_OPTIONS,
  TRACK_COUNT_MAX,
  TRACK_COUNT_MIN,
  uniqueGroupName,
  WINDOW_WIDTH_MAX,
  WINDOW_WIDTH_MIN
} from "./model.js";

export function registerDialogFeature(app) {
  const saveStateNow = app.saveState;
  let backupTimer = null;

  app.saveState = () => {
    saveStateNow();
    scheduleAutomaticBackup();
  };
  app.bindEvents = bindEvents;
  app.exportDataToFile = exportDataToFile;
  app.importDataFromFile = importDataFromFile;
  app.createRestorePoint = createRestorePoint;
  app.writeAutomaticBackup = writeAutomaticBackup;
  app.refreshGroupOptions = refreshGroupOptions;
  app.ensureGroupBySelection = ensureGroupBySelection;
  app.openAddDialog = openAddDialog;
  app.openEditDialog = openEditDialog;
  app.syncEditDialogFields = syncEditDialogFields;
  app.syncSettingsDialogFields = syncSettingsDialogFields;
  app.openSettings = openSettings;
  app.syncWindowBehavior = syncWindowBehavior;
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
      app.reportIssue?.("导出失败", "请稍后重试或检查目标目录权限");
    }
  }

  async function importDataFromFile() {
    try {
      const result = await app.desktopPanel?.importStateFile?.();
      if (result?.canceled || !result?.content) return;

      createRestorePoint("导入数据前");
      await writeAutomaticBackup("导入数据前恢复点", { silent: true });
      const nextState = app.hydrateState(extractImportedState(JSON.parse(result.content)));
      app.store.state = mergeLocalRecoveryState(nextState, app.store.state);
      app.saveState();
      app.applyLayout();
      app.desktopPanel?.setSnapEnabled?.(app.store.state.app.snapToEdge);
      void app.syncWindowBehavior?.();
      app.render();
      if (app.refs.settingsDialog.open) await syncSettingsDialogFields();
      app.showDragToast(`数据已从 ${result.filePath} 导入`);
    } catch {
      app.showDragToast("导入失败，请确认选择的是有效备份文件");
      app.reportIssue?.("导入失败", "当前数据未被覆盖，已保留导入前状态");
    }
  }

  function bindEvents() {
    app.refs.cancelAddDialog.addEventListener("click", () => closeDialog(app.refs.addDialog));
    app.refs.cancelSettingsDialog.addEventListener("click", () => closeDialog(app.refs.settingsDialog));
    app.refs.cancelEditDialog.addEventListener("click", () => closeDialog(app.refs.editDialog));

    app.refs.searchInput?.addEventListener("input", () => {
      app.setSearchQuery(app.refs.searchInput.value);
    });
    app.refs.searchInput?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      app.searchWithEngine(app.refs.searchInput.value);
    });
    app.refs.searchEngineSelect?.addEventListener("change", () => {
      app.store.state.layout.searchEngine = sanitizeSearchEngine(app.refs.searchEngineSelect.value);
      app.saveState();
      syncSearchEngineFields();
    });
    app.refs.clearSearchButton?.addEventListener("click", () => {
      app.setSearchQuery("");
      app.refs.searchInput?.focus();
    });
    app.refs.profileSelect?.addEventListener("change", () => {
      switchProfile(app.refs.profileSelect.value);
    });
    app.refs.createProfileButton?.addEventListener("click", () => {
      createProfileFromCurrent();
    });
    app.refs.renameProfileButton?.addEventListener("click", () => {
      renameCurrentProfile();
    });
    app.refs.layoutPresetSelect?.addEventListener("change", () => {
      applyLayoutPreset(app.refs.layoutPresetSelect.value);
    });
    app.refs.themeSelect?.addEventListener("change", () => {
      app.store.state.layout.theme = sanitizeTheme(app.refs.themeSelect.value);
      app.applyLayout();
      app.saveState();
      updateAppearanceHint();
    });
    app.refs.panelOpacityInput?.addEventListener("input", () => {
      app.store.state.layout.panelOpacity = clampNumber(
        Number(app.refs.panelOpacityInput.value),
        PANEL_OPACITY_MIN,
        PANEL_OPACITY_MAX,
        78
      );
      app.applyLayout();
      app.saveState();
      updateAppearanceHint();
    });
    app.refs.settingsSearchEngineSelect?.addEventListener("change", () => {
      app.store.state.layout.searchEngine = sanitizeSearchEngine(app.refs.settingsSearchEngineSelect.value);
      app.saveState();
      syncSearchEngineFields();
    });
    app.refs.dismissIssueCenter?.addEventListener("click", () => app.clearIssues?.());
    app.refs.clearIssuesButton?.addEventListener("click", () => app.clearIssues?.());
    app.refs.batchSelectGroupButton?.addEventListener("click", () => {
      app.selectCurrentGroupItems();
    });
    app.refs.batchSelectAllButton?.addEventListener("click", () => {
      app.selectAllItems();
    });
    app.refs.batchMoveButton?.addEventListener("click", () => {
      app.moveSelectedItems(app.refs.batchGroupSelect?.value);
    });
    app.refs.batchResizeButton?.addEventListener("click", () => {
      app.resizeSelectedItems(app.refs.batchSizeSelect?.value || "1x1");
    });
    app.refs.batchDeleteButton?.addEventListener("click", () => {
      app.deleteSelectedItems();
    });
    app.refs.batchClearButton?.addEventListener("click", () => app.clearSelection());

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
        if (tile.dataset.recentOnly === "true") return;
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

    window.addEventListener("blur", () => {
      hideMenus();
      if (app.store.state.app.autoHideOnBlur && !hasOpenDialog()) {
        void app.desktopPanel?.closeWindow?.();
      }
    });

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
      app.store.state.layout.layoutPreset = "custom";
      app.applyLayout();
      app.saveState();
      app.render();
      if (app.refs.layoutPresetSelect) app.refs.layoutPresetSelect.value = "custom";
    });

    app.refs.windowWidthInput.addEventListener("input", () => {
      app.store.state.layout.windowWidth = clampNumber(
        Number(app.refs.windowWidthInput.value),
        WINDOW_WIDTH_MIN,
        WINDOW_WIDTH_MAX,
        360
      );
      app.store.state.layout.layoutPreset = "custom";
      app.saveState();
      if (app.refs.layoutPresetSelect) app.refs.layoutPresetSelect.value = "custom";
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

    app.refs.showItemLabelInput?.addEventListener("change", () => {
      app.store.state.layout.showItemLabel = app.refs.showItemLabelInput.checked;
      app.store.state.layout.layoutPreset = "custom";
      app.applyLayout();
      app.saveState();
      app.render();
      if (app.refs.layoutPresetSelect) app.refs.layoutPresetSelect.value = "custom";
    });

    app.refs.showSearchInput?.addEventListener("change", () => {
      app.store.state.layout.showSearch = app.refs.showSearchInput.checked;
      if (!app.store.state.layout.showSearch) app.runtime.searchQuery = "";
      app.saveState();
      app.render();
    });

    app.refs.showRecentInput?.addEventListener("change", () => {
      app.store.state.layout.showRecent = app.refs.showRecentInput.checked;
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
      app.store.state.layout.layoutPreset = "custom";
      app.updateTrackCountHint();
      app.applyLayout();
      app.saveState();
      app.render();
      if (app.refs.layoutPresetSelect) app.refs.layoutPresetSelect.value = "custom";
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

    app.refs.autoHideOnBlurInput?.addEventListener("change", () => {
      app.store.state.app.autoHideOnBlur = app.refs.autoHideOnBlurInput.checked;
      app.saveState();
      void syncNativeWindowBehavior();
    });

    app.refs.snapEdgeSelect?.addEventListener("change", () => {
      app.store.state.app.snapEdge = sanitizeSnapEdge(app.refs.snapEdgeSelect.value);
      app.saveState();
      void syncNativeWindowBehavior();
    });

    app.refs.snapDistanceInput?.addEventListener("input", () => {
      app.store.state.app.snapDistance = clampNumber(
        Number(app.refs.snapDistanceInput.value),
        SNAP_DISTANCE_MIN,
        SNAP_DISTANCE_MAX,
        14
      );
      updateWindowBehaviorHints();
      app.saveState();
      void syncNativeWindowBehavior();
    });

    app.refs.revealDelayInput?.addEventListener("input", () => {
      app.store.state.app.revealDelay = clampNumber(
        Number(app.refs.revealDelayInput.value),
        REVEAL_DELAY_MIN,
        REVEAL_DELAY_MAX,
        250
      );
      updateWindowBehaviorHints();
      app.saveState();
      void syncNativeWindowBehavior();
    });

    app.refs.globalShortcutEnabledInput?.addEventListener("change", () => {
      app.store.state.app.globalShortcutEnabled = app.refs.globalShortcutEnabledInput.checked;
      app.saveState();
      void syncWindowBehavior();
    });

    app.refs.globalShortcutInput?.addEventListener("change", () => {
      app.store.state.app.globalShortcut = sanitizeShortcut(app.refs.globalShortcutInput.value || DEFAULT_GLOBAL_SHORTCUT);
      app.refs.globalShortcutInput.value = app.store.state.app.globalShortcut;
      app.saveState();
      void syncWindowBehavior();
    });

    app.refs.autoBackupEnabledInput?.addEventListener("change", () => {
      app.store.state.app.autoBackupEnabled = app.refs.autoBackupEnabledInput.checked;
      app.saveState();
      updateBackupStatus();
    });

    app.refs.backupRetentionInput?.addEventListener("input", () => {
      app.store.state.app.backupRetention = clampNumber(
        Number(app.refs.backupRetentionInput.value),
        BACKUP_RETENTION_MIN,
        BACKUP_RETENTION_MAX,
        5
      );
      app.saveState();
      updateBackupStatus();
    });

    app.refs.chooseBackupDirectoryButton?.addEventListener("click", async () => {
      const result = await app.desktopPanel?.chooseBackupDirectory?.();
      if (result?.canceled || !result?.directory) return;
      app.store.state.app.backupDirectory = result.directory;
      app.store.state.app.autoBackupEnabled = true;
      app.saveState();
      app.showDragToast(`备份目录已设置为 ${result.directory}`);
      await syncSettingsDialogFields();
    });

    app.refs.backupNowButton?.addEventListener("click", () => void writeAutomaticBackup("手动备份"));
    app.refs.restorePointButton?.addEventListener("click", () => restoreLatestPoint());

    app.refs.exportDataButton?.addEventListener("click", () => void exportDataToFile());
    app.refs.importDataButton?.addEventListener("click", () => void importDataFromFile());
    app.refs.importDesktopButton?.addEventListener("click", () => void importShortcutLocation("desktop"));
    app.refs.importStartMenuButton?.addEventListener("click", () => void importShortcutLocation("startMenu"));
    app.refs.autoGroupButton.addEventListener("click", () => {
      autoGroupByContent();
      app.saveState();
      app.render();
    });
    app.refs.closeWindowButton.addEventListener("click", () => app.desktopPanel?.closeWindow?.());

    app.bindExternalShortcutDrop();
  }

  function scheduleAutomaticBackup() {
    clearTimeout(backupTimer);
    if (!app.store.state.app.autoBackupEnabled || !app.store.state.app.backupDirectory) return;
    backupTimer = setTimeout(() => {
      void writeAutomaticBackup("自动备份", { silent: true });
    }, 1200);
  }

  function syncProfileOptions() {
    if (!app.refs.profileSelect) return;
    syncActiveProfileState(app.store.state);
    const currentValue = app.refs.profileSelect.value;
    app.refs.profileSelect.innerHTML = "";
    app.store.state.profiles.forEach((profile) => {
      const option = document.createElement("option");
      option.value = profile.id;
      option.textContent = profile.name;
      app.refs.profileSelect.appendChild(option);
    });
    app.refs.profileSelect.value = app.store.state.activeProfileId || currentValue;
    if (app.refs.profileNameInput) {
      const activeProfile = getActiveProfile();
      app.refs.profileNameInput.value = activeProfile?.name || "默认配置";
    }
    updateProfileStatus();
  }

  function switchProfile(profileId) {
    if (!profileId || profileId === app.store.state.activeProfileId) return;
    if (!applyProfileSnapshot(app.store.state, profileId)) return;
    app.runtime.searchQuery = "";
    app.runtime.recentPage = 0;
    app.runtime.selectedItemIds.clear();
    app.runtime.selectionAnchorGroupId = null;
    app.applyLayout();
    app.desktopPanel?.setWindowSize?.(app.store.state.layout.windowWidth);
    app.saveState();
    app.render();
    void syncSettingsDialogFields();
    app.showDragToast(`已切换到 ${getActiveProfile()?.name || "配置"}`);
  }

  function createProfileFromCurrent() {
    syncActiveProfileState(app.store.state);
    const requestedName = app.refs.profileNameInput?.value.trim();
    const name = requestedName || getNextProfileName(app.store.state);
    const profile = createProfileSnapshot(app.store.state, { name });
    app.store.state.profiles.push(profile);
    app.store.state.activeProfileId = profile.id;
    app.saveState();
    syncProfileOptions();
    app.showDragToast(`已创建配置：${profile.name}`);
  }

  function renameCurrentProfile() {
    const profile = getActiveProfile();
    const nextName = app.refs.profileNameInput?.value.trim();
    if (!profile || !nextName) return;
    profile.name = nextName;
    app.saveState();
    syncProfileOptions();
    app.showDragToast(`已重命名为 ${nextName}`);
  }

  function getActiveProfile() {
    return app.store.state.profiles?.find((profile) => profile.id === app.store.state.activeProfileId) || null;
  }

  function updateProfileStatus() {
    if (!app.refs.profileStatus) return;
    const profile = getActiveProfile();
    const count = app.store.state.profiles?.length || 1;
    app.refs.profileStatus.textContent = `当前：${profile?.name || "默认配置"}；共 ${count} 个配置。切换前会自动保存当前图标、分组和布局。`;
  }

  function applyLayoutPreset(value) {
    const presetName = sanitizeLayoutPreset(value);
    const preset = LAYOUT_PRESETS[presetName];
    if (!preset) {
      app.store.state.layout.layoutPreset = "custom";
      app.saveState();
      return;
    }

    app.store.state.layout.layoutPreset = presetName;
    app.store.state.layout.iconSize = preset.iconSize;
    app.store.state.layout.windowWidth = preset.windowWidth;
    app.store.state.layout.trackCount = preset.trackCount;
    app.store.state.layout.showItemLabel = preset.showItemLabel;
    app.applyLayout();
    app.saveState();
    app.render();
    void app.desktopPanel?.setWindowSize?.(app.store.state.layout.windowWidth);
    void syncSettingsDialogFields();
  }

  function updateAppearanceHint() {
    if (!app.refs.appearanceHint) return;
    const theme = THEME_OPTIONS[app.store.state.layout.theme] || THEME_OPTIONS.aurora;
    app.refs.appearanceHint.textContent = `当前主题：${theme.label}；面板透明度 ${app.store.state.layout.panelOpacity}%。`;
  }

  function syncSearchEngineFields() {
    const engine = sanitizeSearchEngine(app.store.state.layout.searchEngine);
    app.store.state.layout.searchEngine = engine;
    if (app.refs.searchEngineSelect) app.refs.searchEngineSelect.value = engine;
    if (app.refs.settingsSearchEngineSelect) app.refs.settingsSearchEngineSelect.value = engine;
    if (app.refs.searchEngineHint) {
      const label = app.refs.settingsSearchEngineSelect?.selectedOptions?.[0]?.textContent || engine;
      app.refs.searchEngineHint.textContent = `搜索框中按 Enter 会使用 ${label} 搜索当前关键词。`;
    }
  }

  function createRestorePoint(label = "恢复点") {
    const point = {
      id: crypto.randomUUID(),
      label: String(label || "恢复点"),
      createdAt: new Date().toISOString(),
      content: buildExportPayload(app.store)
    };
    app.store.state.ui.restorePoints = [point, ...(app.store.state.ui.restorePoints || [])].slice(0, 3);
    saveStateNow();
    updateBackupStatus();
    return point;
  }

  async function writeAutomaticBackup(label = "自动备份", { silent = false } = {}) {
    const config = app.store.state.app;
    const retention = clampNumber(config.backupRetention, BACKUP_RETENTION_MIN, BACKUP_RETENTION_MAX, 5);
    if (!config.autoBackupEnabled || !config.backupDirectory) {
      if (!silent) {
        app.showDragToast("请先开启自动备份并选择备份目录");
        app.reportIssue?.("备份未配置", "需要先在设置中选择备份目录");
      }
      updateBackupStatus();
      return null;
    }

    try {
      const result = await app.desktopPanel?.writeBackupFile?.(
        buildExportPayload(app.store),
        config.backupDirectory,
        retention
      );
      config.backupRetention = retention;
      config.lastBackupAt = new Date().toISOString();
      config.lastBackupPath = String(result?.filePath || "");
      saveStateNow();
      updateBackupStatus();
      if (!silent) app.showDragToast(`${label}完成`);
      return result;
    } catch {
      updateBackupStatus();
      if (!silent) app.showDragToast("备份失败，请检查目录权限");
      app.reportIssue?.("备份失败", "请检查备份目录是否存在且可写");
      return null;
    }
  }

  function restoreLatestPoint() {
    const [latestPoint] = app.store.state.ui.restorePoints || [];
    if (!latestPoint?.content) {
      app.showDragToast("暂无可恢复的导入前状态");
      app.reportIssue?.("暂无恢复点", "恢复点会在导入数据前自动创建");
      return;
    }

    try {
      const nextState = app.hydrateState(extractImportedState(JSON.parse(latestPoint.content)));
      app.store.state = mergeLocalRecoveryState(nextState, app.store.state);
      saveStateNow();
      app.applyLayout();
      app.desktopPanel?.setSnapEnabled?.(app.store.state.app.snapToEdge);
      void app.syncWindowBehavior?.();
      app.render();
      if (app.refs.settingsDialog.open) void syncSettingsDialogFields();
      app.showDragToast(`已恢复：${latestPoint.label}`);
    } catch {
      app.showDragToast("恢复失败，该恢复点不可用");
      app.reportIssue?.("恢复失败", "恢复点内容无法解析");
    }
  }

  function updateBackupStatus() {
    if (app.refs.autoBackupEnabledInput) {
      app.refs.autoBackupEnabledInput.checked = !!app.store.state.app.autoBackupEnabled;
    }
    if (app.refs.backupRetentionInput) {
      app.refs.backupRetentionInput.value = String(
        clampNumber(app.store.state.app.backupRetention, BACKUP_RETENTION_MIN, BACKUP_RETENTION_MAX, 5)
      );
    }
    if (!app.refs.backupStatus) return;

    const { backupDirectory, lastBackupAt, lastBackupPath } = app.store.state.app;
    const restoreCount = app.store.state.ui.restorePoints?.length || 0;
    if (!backupDirectory) {
      app.refs.backupStatus.textContent = `尚未配置备份目录，当前有 ${restoreCount} 个导入前恢复点。`;
      return;
    }

    const lastBackupText = lastBackupAt ? new Date(lastBackupAt).toLocaleString() : "尚未备份";
    const locationText = lastBackupPath || backupDirectory;
    app.refs.backupStatus.textContent = `目录：${locationText}；最近备份：${lastBackupText}；保留 ${app.store.state.app.backupRetention} 份；恢复点 ${restoreCount} 个。`;
  }

  function mergeLocalRecoveryState(nextState, currentState) {
    nextState.ui.restorePoints = Array.isArray(currentState.ui?.restorePoints)
      ? currentState.ui.restorePoints
      : [];
    nextState.app.autoBackupEnabled = currentState.app?.autoBackupEnabled === true;
    nextState.app.backupDirectory = String(currentState.app?.backupDirectory || "");
    nextState.app.backupRetention = clampNumber(
      currentState.app?.backupRetention,
      BACKUP_RETENTION_MIN,
      BACKUP_RETENTION_MAX,
      5
    );
    nextState.app.lastBackupAt = String(currentState.app?.lastBackupAt || "");
    nextState.app.lastBackupPath = String(currentState.app?.lastBackupPath || "");
    return nextState;
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
    syncProfileOptions();
    if (app.refs.layoutPresetSelect) {
      app.refs.layoutPresetSelect.value = sanitizeLayoutPreset(app.store.state.layout.layoutPreset);
    }
    if (app.refs.themeSelect) {
      app.refs.themeSelect.value = sanitizeTheme(app.store.state.layout.theme);
    }
    if (app.refs.panelOpacityInput) {
      app.refs.panelOpacityInput.value = String(
        clampNumber(app.store.state.layout.panelOpacity, PANEL_OPACITY_MIN, PANEL_OPACITY_MAX, 78)
      );
    }
    updateAppearanceHint();
    syncSearchEngineFields();
    app.refs.iconSizeInput.value = String(app.store.state.layout.iconSize);
    app.refs.windowWidthInput.value = String(
      clampNumber(app.store.state.layout.windowWidth, WINDOW_WIDTH_MIN, WINDOW_WIDTH_MAX, 360)
    );
    app.refs.showAddTileInput.checked = !!app.store.state.layout.showAddTile;
    app.refs.showGroupTitleInput.checked = !!app.store.state.layout.showGroupTitle;
    if (app.refs.showItemLabelInput) app.refs.showItemLabelInput.checked = app.store.state.layout.showItemLabel !== false;
    if (app.refs.showSearchInput) app.refs.showSearchInput.checked = app.store.state.layout.showSearch !== false;
    if (app.refs.showRecentInput) app.refs.showRecentInput.checked = app.store.state.layout.showRecent !== false;
    app.refs.layoutDirectionInput.value = app.store.state.layout.flowDirection === "rtl" ? "rtl" : "ltr";
    app.refs.trackCountInput.value = String(app.store.state.layout.trackCount);
    app.updateTrackCountHint();
    app.refs.snapEdgeInput.checked = !!app.store.state.app.snapToEdge;
    if (app.refs.autoHideOnBlurInput) app.refs.autoHideOnBlurInput.checked = !!app.store.state.app.autoHideOnBlur;
    if (app.refs.snapEdgeSelect) app.refs.snapEdgeSelect.value = sanitizeSnapEdge(app.store.state.app.snapEdge);
    if (app.refs.snapDistanceInput) {
      app.refs.snapDistanceInput.value = String(app.store.state.app.snapDistance || 14);
    }
    if (app.refs.revealDelayInput) {
      app.refs.revealDelayInput.value = String(app.store.state.app.revealDelay || 250);
    }
    updateWindowBehaviorHints();
    if (app.refs.globalShortcutEnabledInput) {
      app.refs.globalShortcutEnabledInput.checked = !!app.store.state.app.globalShortcutEnabled;
    }
    if (app.refs.globalShortcutInput) {
      app.refs.globalShortcutInput.value = app.store.state.app.globalShortcut || DEFAULT_GLOBAL_SHORTCUT;
    }
    if (app.refs.launchAtLoginInput) {
      try {
        app.refs.launchAtLoginInput.checked = Boolean(await app.desktopPanel?.getLaunchAtLogin?.());
      } catch {
        app.refs.launchAtLoginInput.checked = false;
      }
    }
    updateBackupStatus();
  }

  async function openSettings() {
    hideMenus();
    await syncSettingsDialogFields();
    showDialogAtPoint(app.refs.settingsDialog);
  }

  async function syncWindowBehavior() {
    await syncNativeWindowBehavior();
    await syncGlobalShortcut();
  }

  async function syncNativeWindowBehavior() {
    await app.desktopPanel?.configureWindowBehavior?.({
      autoHideEnabled: !!app.store.state.app.autoHideOnBlur,
      snapEdge: sanitizeSnapEdge(app.store.state.app.snapEdge),
      snapDistance: clampNumber(app.store.state.app.snapDistance, SNAP_DISTANCE_MIN, SNAP_DISTANCE_MAX, 14),
      revealDelayMs: clampNumber(app.store.state.app.revealDelay, REVEAL_DELAY_MIN, REVEAL_DELAY_MAX, 250)
    });
  }

  async function syncGlobalShortcut() {
    const enabled = !!app.store.state.app.globalShortcutEnabled;
    const shortcut = sanitizeShortcut(app.store.state.app.globalShortcut || DEFAULT_GLOBAL_SHORTCUT);
    app.store.state.app.globalShortcut = shortcut;

    if (app.refs.globalShortcutStatus) {
      app.refs.globalShortcutStatus.textContent = enabled ? "正在注册快捷键..." : "全局快捷键已关闭。";
    }

    try {
      const result = await app.desktopPanel?.configureGlobalShortcut?.(enabled, shortcut);
      const applied = Boolean(result?.enabled);
      app.store.state.app.globalShortcutEnabled = applied;
      if (app.refs.globalShortcutEnabledInput) app.refs.globalShortcutEnabledInput.checked = applied;
      if (app.refs.globalShortcutStatus) {
        app.refs.globalShortcutStatus.textContent = applied
          ? `已启用：${shortcut} 显示或隐藏面板。`
          : "全局快捷键已关闭。";
      }
      app.saveState();
    } catch {
      app.store.state.app.globalShortcutEnabled = false;
      if (app.refs.globalShortcutEnabledInput) app.refs.globalShortcutEnabledInput.checked = false;
      if (app.refs.globalShortcutStatus) {
        app.refs.globalShortcutStatus.textContent = "快捷键注册失败，可能被其他应用占用。";
      }
      app.saveState();
    }
  }

  function updateWindowBehaviorHints() {
    if (app.refs.snapDistanceHint) {
      app.refs.snapDistanceHint.textContent = `当前吸附距离 ${app.store.state.app.snapDistance || 14} px。`;
    }
    if (app.refs.revealDelayHint) {
      app.refs.revealDelayHint.textContent = `当前唤出延迟 ${app.store.state.app.revealDelay || 250} ms。`;
    }
  }

  function hideMenus() {
    app.refs.appContextMenu.hidden = true;
    app.refs.itemContextMenu.hidden = true;
  }

  function hasOpenDialog() {
    return [app.refs.addDialog, app.refs.settingsDialog, app.refs.editDialog].some((dialog) => dialog?.open);
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

  async function importShortcutLocation(source) {
    try {
      const shortcuts = (await app.desktopPanel?.scanShortcutLocations?.([source])) || [];
      if (!Array.isArray(shortcuts) || !shortcuts.length) {
        app.showDragToast("没有找到可导入的快捷方式");
        app.reportIssue?.("没有找到快捷方式", "可尝试拖拽单个快捷方式到面板中");
        return;
      }

      const targetGroupId = app.store.state.groups[0]?.id || DEFAULT_GROUP_ID;
      await app.addResolvedShortcutsToGroup(targetGroupId, shortcuts);
      app.showDragToast(`已导入 ${shortcuts.length} 个快捷方式`);
    } catch {
      app.showDragToast("批量导入失败，请稍后重试");
      app.reportIssue?.("批量导入失败", "请稍后重试或检查快捷方式位置权限");
    }
  }

  function shouldAutoSearchOfficialLink(type) {
    return type === "add" && app.runtime.addDialogSource === "menu";
  }

  function removeItem(groupId, itemId) {
    const group = app.findGroup(groupId);
    if (!group) return;
    group.items = group.items.filter((item) => item.id !== itemId);
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
