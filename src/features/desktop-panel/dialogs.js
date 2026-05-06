import {
  buildExportPayload,
  BACKUP_RETENTION_MAX,
  BACKUP_RETENTION_MIN,
  clampNumber,
  applyProfileSnapshot,
  createProfileSnapshot,
  DEFAULT_GLOBAL_SHORTCUT,
  DEFAULT_GROUP_ID,
  DEFAULT_TEXT_COLOR,
  DRAWER_DELAY_MAX,
  DRAWER_DELAY_MIN,
  extractImportedState,
  findItem,
  getFontConfig,
  getThemeConfig,
  getNextProfileName,
  inferGroupName,
  LAYOUT_PRESETS,
  NEW_AUTO_GROUP,
  PANEL_OPACITY_MAX,
  PANEL_OPACITY_MIN,
  REVEAL_DELAY_MAX,
  REVEAL_DELAY_MIN,
  sanitizeLayoutPreset,
  sanitizeCustomTheme,
  sanitizeColor,
  sanitizeFontFamily,
  sanitizeSearchEngine,
  sanitizeDrawerTrigger,
  sanitizeSnapEdge,
  sanitizeShortcut,
  sanitizeTheme,
  SNAP_DISTANCE_MAX,
  SNAP_DISTANCE_MIN,
  syncActiveProfileState,
  TRACK_COUNT_MAX,
  TRACK_COUNT_MIN,
  uniqueGroupName,
  WINDOW_WIDTH_MAX,
  WINDOW_WIDTH_MIN
} from "./model.js";
import { keyboardEventToShortcut } from "./keyboard-shortcuts.js";

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
  app.updateIconResourceFields = updateIconResourceFields;
  app.openSettings = openSettings;
  app.syncWindowBehavior = syncWindowBehavior;
  app.checkForUpdates = checkForUpdates;
  app.hideMenus = hideMenus;
  app.hasVisibleMenu = hasVisibleMenu;
  app.openMenu = openMenu;
  app.shouldAutoSearchOfficialLink = shouldAutoSearchOfficialLink;
  app.removeItem = removeItem;
  app.autoGroupByContent = autoGroupByContent;
  app.hasOpenDialog = hasOpenDialog;

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
    app.refs.settingsNav?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-target-section]");
      if (!button) return;
      scrollToSettingsSection(button.dataset.targetSection, button);
    });

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
      syncCustomThemeFields();
      updateAppearanceHint();
    });
    [
      app.refs.customThemeNameInput,
      app.refs.customThemeAccentInput,
      app.refs.customThemeAccent2Input,
      app.refs.customThemeSurfaceInput
    ].forEach((input) => {
      input?.addEventListener("input", () => {
        applyCustomThemeFromFields();
      });
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
    app.refs.reduceMotionInput?.addEventListener("change", () => {
      app.store.state.layout.reduceMotion = app.refs.reduceMotionInput.checked;
      app.applyLayout();
      app.saveState();
      void syncWindowBehavior();
      updateAppearanceHint();
    });
    app.refs.highContrastFocusInput?.addEventListener("change", () => {
      app.store.state.layout.highContrastFocus = app.refs.highContrastFocusInput.checked;
      app.applyLayout();
      app.saveState();
      updateAppearanceHint();
    });
    app.refs.fontFamilySelect?.addEventListener("change", () => {
      app.store.state.layout.fontFamily = sanitizeFontFamily(app.refs.fontFamilySelect.value);
      app.applyLayout();
      app.saveState();
      updateAppearanceHint();
    });
    app.refs.textColorInput?.addEventListener("input", () => {
      app.store.state.layout.textColor = sanitizeColor(app.refs.textColorInput.value, DEFAULT_TEXT_COLOR);
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
    app.refs.batchRefreshIconsButton?.addEventListener("click", () => {
      void app.refreshSelectedIcons?.();
    });
    app.refs.batchDeleteButton?.addEventListener("click", () => {
      app.deleteSelectedItems();
    });
    app.refs.batchClearButton?.addEventListener("click", () => app.clearSelection());
    app.refs.clearIconFailuresButton?.addEventListener("click", () => clearIconFailureRecords());

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
      const previousIconMode = item.iconMode;
      const previousCustomIcon = item.customIcon || "";

      if (!nextTitle || !nextUrl || !app.sizeMeta[nextSize]) return;

      item.title = nextTitle;
      item.description = nextDescription;
      item.url = nextUrl;
      item.size = nextSize;
      item.iconMode = nextIconMode;
      item.customIcon = nextIconMode === "custom" ? nextCustomIcon : "";
      item.iconFailureReason = "";
      if (nextIconMode === "default") {
        item.iconSource = "";
        item.iconUpdatedAt = "";
      } else if (nextCustomIcon && (previousIconMode !== "custom" || previousCustomIcon !== nextCustomIcon)) {
        item.iconSource = "手动设置";
        item.iconUpdatedAt = new Date().toISOString();
      }

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

    document.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.target.closest(".context-menu")) return;
      const tile = event.target.closest(".tile");
      hideMenus();
      if (tile) {
        if (tile.dataset.recentOnly === "true") return;
        app.runtime.activeItemContext = { groupId: tile.dataset.groupId, itemId: tile.dataset.itemId };
        updateItemActionMenu(app.findItem(tile.dataset.groupId, tile.dataset.itemId));
        openMenu(app.refs.itemContextMenu, event.clientX, event.clientY);
        return;
      }
      openMenu(app.refs.appContextMenu, event.clientX, event.clientY);
    }, true);

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
    document.addEventListener("keydown", handleGlobalKeydown, true);

    window.addEventListener("blur", () => {
      hideMenus();
      if (app.store.state.app.drawerModeEnabled && !hasOpenDialog()) {
        app.scheduleDrawerCollapse?.({ immediate: true });
        return;
      }
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

      if (action === "refresh-icon") {
        void refreshItemIconFromMenu(context.groupId, context.itemId);
        return;
      }

      if (action === "copy-target") {
        void copyTextAction(item.url, "已复制链接/路径", "复制链接/路径失败");
        return;
      }

      if (action === "copy-keyword") {
        void copyTextAction(item.title || item.description || item.url, "已复制搜索关键词", "复制搜索关键词失败");
        return;
      }

      if (action === "open-browser") {
        app.openUrl(item.url);
        return;
      }

      if (action === "open-folder") {
        void runDesktopAction(
          () => app.desktopPanel?.openContainingFolder?.(item.url),
          "已打开所在文件夹",
          "打开所在文件夹失败"
        );
        return;
      }

      if (action === "open-admin") {
        void runDesktopAction(
          () => app.desktopPanel?.openAsAdmin?.(item.url),
          "已请求管理员身份打开",
          "以管理员身份打开失败"
        );
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

    app.refs.drawerModeEnabledInput?.addEventListener("change", () => {
      app.store.state.app.drawerModeEnabled = app.refs.drawerModeEnabledInput.checked;
      app.saveState();
      app.syncDrawerHandle?.();
      void syncNativeWindowBehavior();
    });

    app.refs.drawerEdgeSelect?.addEventListener("change", () => {
      app.store.state.app.drawerEdge = sanitizeSnapEdge(app.refs.drawerEdgeSelect.value);
      app.saveState();
      updateWindowBehaviorHints();
      app.syncDrawerHandle?.();
      void syncNativeWindowBehavior();
    });

    app.refs.drawerTriggerSelect?.addEventListener("change", () => {
      app.store.state.app.drawerTrigger = sanitizeDrawerTrigger(app.refs.drawerTriggerSelect.value);
      app.saveState();
      updateWindowBehaviorHints();
      app.syncDrawerHandle?.();
    });

    app.refs.drawerDelayInput?.addEventListener("input", () => {
      app.store.state.app.drawerCollapseDelay = clampNumber(
        Number(app.refs.drawerDelayInput.value),
        DRAWER_DELAY_MIN,
        DRAWER_DELAY_MAX,
        450
      );
      app.saveState();
      updateWindowBehaviorHints();
      void syncNativeWindowBehavior();
    });

    app.refs.globalShortcutEnabledInput?.addEventListener("change", () => {
      app.store.state.app.globalShortcutEnabled = app.refs.globalShortcutEnabledInput.checked;
      app.saveState();
      void syncWindowBehavior();
    });

    app.refs.globalShortcutInput?.addEventListener("keydown", handleGlobalShortcutCapture);
    app.refs.globalShortcutInput?.addEventListener("focus", () => {
      app.runtime.shortcutEscapeArmed = false;
      if (app.refs.globalShortcutStatus) {
        app.refs.globalShortcutStatus.textContent = "请按下快捷键组合，例如 Ctrl+Alt+Space。";
      }
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
    app.refs.importDesktopButton?.addEventListener("click", () => {
      if (!confirmInlineAction({
        id: "import-desktop",
        button: app.refs.importDesktopButton,
        status: "再次点击“导入桌面”将扫描桌面快捷方式，并添加到当前第一个分组；不会删除现有图标。",
        statusRef: app.refs.dataActionStatus,
        confirmText: "再次点击导入"
      })) return;
      void importShortcutLocation("desktop");
    });
    app.refs.importStartMenuButton?.addEventListener("click", () => void importShortcutLocation("startMenu"));
    app.refs.autoGroupButton.addEventListener("click", () => {
      autoGroupByContent();
      app.saveState();
      app.render();
    });
    app.refs.sortGroupByNameButton?.addEventListener("click", () => sortSelectedGroupByName());
    app.refs.sortAllGroupsByNameButton?.addEventListener("click", () => sortAllGroupsByName());
    app.refs.compactGroupButton?.addEventListener("click", () => compactSelectedGroup());
    app.refs.findDuplicateItemsButton?.addEventListener("click", () => findDuplicateItems());
    app.refs.suggestGroupsButton?.addEventListener("click", () => applyGroupSuggestions());
    app.refs.checkUpdatesButton?.addEventListener("click", () => {
      void checkForUpdates({ silent: false });
    });
    app.refs.installUpdateButton?.addEventListener("click", () => {
      showUpdateInstallConfirm();
    });
    app.refs.cancelUpdateInstallButton?.addEventListener("click", () => {
      hideUpdateInstallConfirm();
    });
    app.refs.confirmUpdateInstallButton?.addEventListener("click", () => {
      void installAvailableUpdate();
    });
    app.refs.copyFeedbackSummaryButton?.addEventListener("click", () => {
      void copyFeedbackSummary();
    });
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
    app.runtime.selectionMode = false;
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
    const theme = getThemeConfig(app.store.state.layout);
    const font = getFontConfig(app.store.state.layout);
    app.refs.appearanceHint.textContent = `当前主题：${theme.label}；字体：${font.label}；面板透明度 ${app.store.state.layout.panelOpacity}%。`;
  }

  function syncCustomThemeFields() {
    const customTheme = sanitizeCustomTheme(app.store.state.layout.customTheme);
    app.store.state.layout.customTheme = customTheme;
    const isCustom = sanitizeTheme(app.store.state.layout.theme) === "custom";

    if (app.refs.customThemeFields) app.refs.customThemeFields.hidden = !isCustom;
    if (app.refs.customThemeNameInput) app.refs.customThemeNameInput.value = customTheme.label;
    if (app.refs.customThemeAccentInput) app.refs.customThemeAccentInput.value = customTheme.accent;
    if (app.refs.customThemeAccent2Input) app.refs.customThemeAccent2Input.value = customTheme.accent2;
    if (app.refs.customThemeSurfaceInput) app.refs.customThemeSurfaceInput.value = customTheme.surface;
  }

  function applyCustomThemeFromFields() {
    app.store.state.layout.theme = "custom";
    if (app.refs.themeSelect) app.refs.themeSelect.value = "custom";
    app.store.state.layout.customTheme = sanitizeCustomTheme({
      label: app.refs.customThemeNameInput?.value,
      accent: app.refs.customThemeAccentInput?.value,
      accent2: app.refs.customThemeAccent2Input?.value,
      surface: app.refs.customThemeSurfaceInput?.value
    });
    syncCustomThemeFields();
    app.applyLayout();
    app.saveState();
    updateAppearanceHint();
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
    app.refs.editIconModeHint.textContent = getIconModeHint(shortcutIcon);
    app.renderIconSuggestions("edit");
  }

  function getIconModeHint(shortcutIcon = "") {
    const item = app.runtime.activeItemContext
      ? app.findItem(app.runtime.activeItemContext.groupId, app.runtime.activeItemContext.itemId)
      : null;
    if (item?.iconFailureReason) return `上次刷新失败：${item.iconFailureReason}`;
    if (item?.iconUpdatedAt) {
      const source = item.iconSource || (item.iconMode === "custom" ? "自定义图标" : "默认图标");
      return `图标来源：${source}，更新时间：${new Date(item.iconUpdatedAt).toLocaleString()}`;
    }
    return shortcutIcon
      ? "默认会优先保留该快捷方式原有图标。"
      : "默认会优先使用更清晰的网站站点图标。";
  }

  async function syncSettingsDialogFields() {
    syncProfileOptions();
    if (app.refs.layoutPresetSelect) {
      app.refs.layoutPresetSelect.value = sanitizeLayoutPreset(app.store.state.layout.layoutPreset);
    }
    if (app.refs.themeSelect) {
      app.refs.themeSelect.value = sanitizeTheme(app.store.state.layout.theme);
    }
    syncCustomThemeFields();
    if (app.refs.panelOpacityInput) {
      app.refs.panelOpacityInput.value = String(
        clampNumber(app.store.state.layout.panelOpacity, PANEL_OPACITY_MIN, PANEL_OPACITY_MAX, 78)
      );
    }
    if (app.refs.reduceMotionInput) {
      app.refs.reduceMotionInput.checked = !!app.store.state.layout.reduceMotion;
    }
    if (app.refs.highContrastFocusInput) {
      app.refs.highContrastFocusInput.checked = !!app.store.state.layout.highContrastFocus;
    }
    if (app.refs.fontFamilySelect) {
      app.refs.fontFamilySelect.value = sanitizeFontFamily(app.store.state.layout.fontFamily);
    }
    if (app.refs.textColorInput) {
      app.refs.textColorInput.value = sanitizeColor(app.store.state.layout.textColor, DEFAULT_TEXT_COLOR);
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
    if (app.refs.drawerModeEnabledInput) {
      app.refs.drawerModeEnabledInput.checked = !!app.store.state.app.drawerModeEnabled;
    }
    if (app.refs.drawerEdgeSelect) {
      app.refs.drawerEdgeSelect.value = sanitizeSnapEdge(app.store.state.app.drawerEdge);
    }
    if (app.refs.drawerTriggerSelect) {
      app.refs.drawerTriggerSelect.value = sanitizeDrawerTrigger(app.store.state.app.drawerTrigger);
    }
    if (app.refs.drawerDelayInput) {
      app.refs.drawerDelayInput.value = String(app.store.state.app.drawerCollapseDelay || 450);
    }
    updateWindowBehaviorHints();
    updateReleaseFields();
    updateOrganizeFields();
    updateIconResourceFields();
    app.syncDrawerHandle?.();
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

  function updateOrganizeFields() {
    app.refreshGroupOptions?.(app.refs.organizeGroupSelect, false);
    if (app.refs.organizeStatus && !app.refs.organizeStatus.dataset.keepMessage) {
      app.refs.organizeStatus.textContent = "整理操作只调整顺序或给出建议，不会删除图标。";
    }
  }

  function updateIconResourceFields() {
    const failures = app.store.state.groups.flatMap((group) => group.items).filter((item) => item.iconFailureReason);
    if (app.refs.iconResourceSummary) {
      app.refs.iconResourceSummary.textContent = failures.length ? `${failures.length} 条失败记录` : "暂无失败记录";
    }
    if (app.refs.iconResourceStatus && !app.refs.iconResourceStatus.dataset.keepMessage) {
      app.refs.iconResourceStatus.textContent = "清理失败记录不会删除自定义图标。";
    }
  }

  function clearIconFailureRecords() {
    let count = 0;
    app.store.state.groups.forEach((group) => {
      group.items.forEach((item) => {
        if (!item.iconFailureReason) return;
        item.iconFailureReason = "";
        count += 1;
      });
    });
    app.saveState();
    if (app.refs.iconResourceStatus) {
      app.refs.iconResourceStatus.dataset.keepMessage = "true";
      app.refs.iconResourceStatus.textContent = count ? `已清理 ${count} 条图标失败记录。` : "暂无需要清理的失败记录。";
    }
    updateIconResourceFields();
    app.showDragToast(count ? "图标失败记录已清理" : "暂无失败记录");
  }

  function sortSelectedGroupByName() {
    const groupId = app.refs.organizeGroupSelect?.value || app.store.state.groups[0]?.id;
    const group = app.findGroup(groupId);
    if (!group) return;
    if (group.items.length < 2) {
      setOrganizeStatus(`${group.name} 不需要排序。`);
      return;
    }
    const confirmed = confirmInlineAction({
      id: `sort-group:${group.id}`,
      button: app.refs.sortGroupByNameButton,
      status: `再次点击“排序本组”，将按名称整理“${group.name}”中的 ${group.items.length} 个图标；不会删除图标。`,
      confirmText: "再次点击确认"
    });
    if (!confirmed) return;

    const changed = sortGroupItemsByName(group);
    if (changed) {
      app.saveState();
      app.render();
      setOrganizeStatus(`已按名称整理“${group.name}”。`);
      app.showDragToast("分组已排序");
    } else {
      setOrganizeStatus(`“${group.name}”已经是名称顺序。`);
    }
  }

  function sortAllGroupsByName() {
    const groupsWithItems = app.store.state.groups.filter((group) => group.items.length > 1);
    if (!groupsWithItems.length) {
      setOrganizeStatus("当前没有需要排序的分组。");
      return;
    }
    const itemCount = groupsWithItems.reduce((sum, group) => sum + group.items.length, 0);
    const confirmed = confirmInlineAction({
      id: "sort-all-groups",
      button: app.refs.sortAllGroupsByNameButton,
      status: `再次点击“排序全部”，将按名称整理 ${groupsWithItems.length} 个分组中的 ${itemCount} 个图标；不会删除图标。`,
      confirmText: "再次点击确认"
    });
    if (!confirmed) return;

    const changedCount = groupsWithItems.reduce((sum, group) => sum + (sortGroupItemsByName(group) ? 1 : 0), 0);
    if (changedCount) {
      app.saveState();
      app.render();
      setOrganizeStatus(`已整理 ${changedCount} 个分组。`);
      app.showDragToast("全部分组已排序");
    } else {
      setOrganizeStatus("所有分组已经是名称顺序。");
    }
  }

  function compactSelectedGroup() {
    const groupId = app.refs.organizeGroupSelect?.value || app.store.state.groups[0]?.id;
    const group = app.findGroup(groupId);
    if (!group) return;
    if (group.items.length < 2) {
      setOrganizeStatus(`${group.name} 不需要紧凑排列。`);
      return;
    }

    const confirmed = confirmInlineAction({
      id: `compact-group:${group.id}`,
      button: app.refs.compactGroupButton,
      status: `再次点击“紧凑本组”，将把“${group.name}”中的大图标优先排列，尽量减少视觉空位；不会删除图标。`,
      confirmText: "再次点击确认"
    });
    if (!confirmed) return;

    const changed = compactGroupItems(group);
    if (changed) {
      app.saveState();
      app.render();
      setOrganizeStatus(`已紧凑排列“${group.name}”。`);
      app.showDragToast("分组已紧凑排列");
    } else {
      setOrganizeStatus(`“${group.name}”已经是紧凑顺序。`);
    }
  }

  function sortGroupItemsByName(group) {
    const before = group.items.map((item) => item.id).join("\n");
    group.items = group.items
      .map((item, index) => ({ item, index }))
      .sort((a, b) => compareItemName(a.item, b.item) || a.index - b.index)
      .map(({ item }) => item);
    return before !== group.items.map((item) => item.id).join("\n");
  }

  function compactGroupItems(group) {
    const before = group.items.map((item) => item.id).join("\n");
    group.items = group.items
      .map((item, index) => ({ item, index }))
      .sort((a, b) => getItemArea(b.item) - getItemArea(a.item) || compareItemName(a.item, b.item) || a.index - b.index)
      .map(({ item }) => item);
    return before !== group.items.map((item) => item.id).join("\n");
  }

  function getItemArea(item) {
    const meta = app.sizeMeta?.[item.size] || app.sizeMeta?.["1x1"];
    return (meta?.colSpan || 1) * (meta?.rowSpan || 1);
  }

  function compareItemName(left, right) {
    return String(left.title || "").localeCompare(String(right.title || ""), "zh-Hans-CN", {
      numeric: true,
      sensitivity: "base"
    });
  }

  function findDuplicateItems() {
    const duplicates = collectDuplicateItems();
    if (!duplicates.length) {
      setOrganizeStatus("未发现明显重复项。");
      app.showDragToast("未发现重复项");
      return;
    }

    const preview = duplicates
      .slice(0, 3)
      .map((entry) => `${entry.label}（${entry.items.length} 个）`)
      .join("；");
    const suffix = duplicates.length > 3 ? `，另有 ${duplicates.length - 3} 组` : "";
    setOrganizeStatus(`发现 ${duplicates.length} 组可能重复项：${preview}${suffix}。请手动确认后再处理。`);
    app.reportIssue?.("发现可能重复项", `${preview}${suffix}`);
  }

  function applyGroupSuggestions() {
    const suggestions = buildGroupSuggestions();
    if (!suggestions.length) {
      setOrganizeStatus("暂无可应用的分组建议。");
      app.showDragToast("暂无分组建议");
      return;
    }

    const itemCount = suggestions.reduce((sum, suggestion) => sum + suggestion.items.length, 0);
    const preview = suggestions
      .slice(0, 3)
      .map((suggestion) => `${suggestion.name} ${suggestion.items.length} 个`)
      .join("，");
    const suffix = suggestions.length > 3 ? `，另有 ${suggestions.length - 3} 组` : "";
    const confirmed = confirmInlineAction({
      id: "apply-group-suggestions",
      button: app.refs.suggestGroupsButton,
      status: `建议新建 ${suggestions.length} 个分组，移动 ${itemCount} 个图标：${preview}${suffix}。再次点击将应用建议，不会删除图标。`,
      confirmText: "再次点击应用"
    });
    if (!confirmed) return;

    suggestions.forEach((suggestion) => {
      app.store.state.groups.push({
        id: crypto.randomUUID(),
        name: uniqueGroupName(app.store, suggestion.name),
        items: suggestion.items
      });
      suggestion.items.forEach((item) => {
        const sourceGroup = app.findItemById(item.id)?.group;
        if (!sourceGroup) return;
        sourceGroup.items = sourceGroup.items.filter((entry) => entry.id !== item.id);
      });
    });

    app.ensureValidGroups();
    app.saveState();
    app.render();
    setOrganizeStatus(`已应用 ${suggestions.length} 个分组建议，移动 ${itemCount} 个图标。`);
    app.showDragToast("分组建议已应用");
  }

  function buildGroupSuggestions() {
    const suggestions = new Map();
    app.store.state.groups.forEach((group) => {
      group.items.forEach((item) => {
        const suggestedName = inferGroupName(item.title, item.url, item.description);
        if (!suggestedName || suggestedName === "常用" || suggestedName === group.name) return;
        if (!suggestions.has(suggestedName)) suggestions.set(suggestedName, []);
        suggestions.get(suggestedName).push(item);
      });
    });

    return Array.from(suggestions.entries())
      .map(([name, items]) => ({ name, items }))
      .filter((suggestion) => suggestion.items.length >= 2);
  }

  function collectDuplicateItems() {
    const maps = {
      target: new Map(),
      title: new Map()
    };

    app.store.state.groups.forEach((group) => {
      group.items.forEach((item) => {
        const located = { groupName: group.name, item };
        const targetKey = normalizeOrganizeKey(item.url);
        const titleKey = normalizeOrganizeKey(item.title);
        if (targetKey) pushDuplicateCandidate(maps.target, `目标：${item.url}`, targetKey, located);
        if (titleKey) pushDuplicateCandidate(maps.title, `名称：${item.title}`, titleKey, located);
      });
    });

    const seen = new Set();
    return Object.values(maps)
      .flatMap((map) => Array.from(map.values()).filter((entry) => entry.items.length > 1))
      .filter((entry) => {
        const ids = entry.items.map(({ item }) => item.id).sort().join("|");
        if (seen.has(ids)) return false;
        seen.add(ids);
        return true;
      });
  }

  function pushDuplicateCandidate(map, label, key, item) {
    if (!map.has(key)) map.set(key, { label, items: [] });
    map.get(key).items.push(item);
  }

  function normalizeOrganizeKey(value) {
    return String(value || "")
      .trim()
      .replace(/\\/g, "/")
      .replace(/\/+$/g, "")
      .toLowerCase();
  }

  function setOrganizeStatus(message) {
    setStatusText(app.refs.organizeStatus, message);
  }

  function confirmInlineAction({ id, button, status, statusRef = app.refs.organizeStatus, confirmText = "再次点击确认", timeout = 4200 }) {
    const sameAction = app.runtime.pendingInlineConfirm === id;
    clearInlineConfirm();
    if (sameAction) return true;

    app.runtime.pendingInlineConfirm = id;
    if (button) {
      button.dataset.confirming = "true";
      button.dataset.defaultText = button.textContent || "";
      button.textContent = confirmText;
    }
    setStatusText(statusRef, status);
    app.runtime.inlineConfirmTimer = setTimeout(() => {
      clearInlineConfirm();
      setStatusText(statusRef, statusRef === app.refs.dataActionStatus
        ? "导入桌面会扫描桌面快捷方式，执行前需要二次确认。"
        : "整理操作只调整顺序或给出建议，不会删除图标。");
    }, timeout);
    return false;
  }

  function setStatusText(statusRef, message) {
    if (!statusRef) return;
    if (message === "整理操作只调整顺序或给出建议，不会删除图标。") {
      delete statusRef.dataset.keepMessage;
    } else {
      statusRef.dataset.keepMessage = "true";
    }
    statusRef.textContent = message;
  }

  function clearInlineConfirm() {
    clearTimeout(app.runtime.inlineConfirmTimer);
    app.runtime.inlineConfirmTimer = null;
    app.runtime.pendingInlineConfirm = null;
    [
      app.refs.sortGroupByNameButton,
      app.refs.sortAllGroupsByNameButton,
      app.refs.compactGroupButton,
      app.refs.suggestGroupsButton,
      app.refs.importDesktopButton
    ].forEach((button) => {
      if (!button?.dataset.confirming) return;
      button.textContent = button.dataset.defaultText || button.textContent;
      delete button.dataset.confirming;
      delete button.dataset.defaultText;
    });
  }

  function updateReleaseFields() {
    if (app.refs.appVersionLabel) {
      app.refs.appVersionLabel.textContent = `当前版本 v${app.version}`;
    }
    if (app.refs.checkUpdatesButton) {
      app.refs.checkUpdatesButton.disabled = !!app.runtime.updateChecking || !!app.runtime.updateInstalling;
      app.refs.checkUpdatesButton.textContent = app.runtime.updateChecking ? "检查中..." : "检查更新";
    }
    if (app.refs.installUpdateButton) {
      const hasUpdate = !!app.runtime.updateInfo?.available;
      app.refs.installUpdateButton.hidden = !hasUpdate;
      app.refs.installUpdateButton.disabled = !!app.runtime.updateInstalling;
      app.refs.installUpdateButton.textContent = app.runtime.updateInstalling ? "安装中..." : "立即安装";
    }
    if (app.refs.updateInstallConfirm) {
      const visible = !!app.runtime.updateInstallConfirmVisible && !!app.runtime.updateInfo?.available && !app.runtime.updateInstalling;
      app.refs.updateInstallConfirm.hidden = !visible;
    }
    if (app.refs.updateInstallConfirmMessage && app.runtime.updateInfo?.available) {
      const version = app.runtime.updateInfo.version ? ` v${app.runtime.updateInfo.version}` : "";
      const notes = app.runtime.updateInfo.notes ? `\n${String(app.runtime.updateInfo.notes).slice(0, 120)}` : "";
      app.refs.updateInstallConfirmMessage.textContent =
        `将下载并安装新版本${version}。安装时当前应用会退出，请先保存正在编辑的内容。${notes}`;
    }
    if (app.refs.confirmUpdateInstallButton) {
      app.refs.confirmUpdateInstallButton.disabled = !!app.runtime.updateInstalling;
      app.refs.confirmUpdateInstallButton.textContent = app.runtime.updateInstalling ? "安装中..." : "下载并安装";
    }
    if (app.refs.feedbackSummaryStatus) {
      app.refs.feedbackSummaryStatus.textContent = getUpdateStatusText();
    }
  }

  function getUpdateStatusText() {
    if (app.runtime.updateInstalling) return "正在安装更新，Windows 安装流程会自动退出当前应用。";
    if (app.runtime.updateChecking) return "正在检查 GitHub Releases 更新...";
    if (app.runtime.updateInfo?.available) {
      const version = app.runtime.updateInfo.version ? ` v${app.runtime.updateInfo.version}` : "";
      const notes = app.runtime.updateInfo.notes ? `：${String(app.runtime.updateInfo.notes).slice(0, 80)}` : "";
      return `发现新版本${version}${notes}`;
    }
    if (app.runtime.updateInfo?.checked) return "当前已是最新版本。";
    if (app.runtime.updateInfo?.error) return `检查更新失败：${app.runtime.updateInfo.error}`;
    return "可手动检查 GitHub Releases 更新；反馈摘要不会包含图标、路径、备份内容或配置数据。";
  }

  function formatUpdateError(error) {
    const message = error?.message || String(error || "");
    if (/valid release json|release json|latest\.json|manifest/i.test(message)) {
      return "未获取到有效更新清单 latest.json，请确认最新 GitHub Release 已上传 latest.json、安装包和 .sig 签名文件。";
    }
    if (/fetch|network|offline|timed?\s*out|proxy|dns|connection/i.test(message)) {
      return "网络连接失败，请稍后重试，或打开 GitHub Releases 手动查看更新。";
    }
    return message || "检查更新失败，请稍后重试。";
  }

  async function checkForUpdates({ silent = false } = {}) {
    if (app.runtime.updateChecking || app.runtime.updateInstalling) return app.runtime.updateInfo;
    app.runtime.updateChecking = true;
    if (!silent) app.runtime.updateInfo = { checked: false };
    updateReleaseFields();

    try {
      const result = await app.desktopPanel?.checkForUpdate?.();
      app.runtime.updateInfo = result?.available
        ? {
            available: true,
            version: String(result.version || ""),
            notes: String(result.notes || ""),
            date: String(result.date || ""),
            checked: true
          }
        : { available: false, checked: true };
      if (app.runtime.updateInfo.available) {
        hideUpdateInstallConfirm();
        app.showDragToast(`发现新版本 v${app.runtime.updateInfo.version || ""}`.trim());
      } else if (!silent) {
        hideUpdateInstallConfirm();
        app.showDragToast("当前已是最新版本");
      }
    } catch (error) {
      const formattedError = formatUpdateError(error);
      app.runtime.updateInfo = {
        available: false,
        checked: false,
        error: formattedError,
        rawError: error?.message || String(error)
      };
      if (!silent) {
        app.showDragToast("检查更新失败");
      } else {
        app.reportIssue?.("检查更新失败", formattedError);
      }
      hideUpdateInstallConfirm();
    } finally {
      app.runtime.updateChecking = false;
      updateReleaseFields();
    }

    return app.runtime.updateInfo;
  }

  function showUpdateInstallConfirm() {
    if (!app.runtime.updateInfo?.available || app.runtime.updateInstalling) return;
    app.runtime.updateInstallConfirmVisible = true;
    updateReleaseFields();
    app.refs.confirmUpdateInstallButton?.focus();
  }

  function hideUpdateInstallConfirm() {
    app.runtime.updateInstallConfirmVisible = false;
    updateReleaseFields();
  }

  async function installAvailableUpdate() {
    if (!app.runtime.updateInfo?.available || app.runtime.updateInstalling) return;

    app.runtime.updateInstalling = true;
    app.runtime.updateInstallConfirmVisible = false;
    updateReleaseFields();

    try {
      await app.desktopPanel?.installUpdate?.((event) => {
        if (!app.refs.feedbackSummaryStatus) return;
        if (event?.event === "Started") {
          app.refs.feedbackSummaryStatus.textContent = "开始下载更新...";
        } else if (event?.event === "Progress") {
          app.refs.feedbackSummaryStatus.textContent = "正在下载更新...";
        } else if (event?.event === "Finished") {
          app.refs.feedbackSummaryStatus.textContent = "下载完成，正在安装...";
        }
      });
    } catch (error) {
      app.runtime.updateInstalling = false;
      app.runtime.updateInfo = {
        ...app.runtime.updateInfo,
        error: error?.message || String(error)
      };
      app.reportIssue?.("安装更新失败", error?.message || String(error));
      updateReleaseFields();
    }
  }

  function handleGlobalShortcutCapture(event) {
    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Escape") {
      const currentShortcut = sanitizeShortcut(app.refs.globalShortcutInput?.value || app.store.state.app.globalShortcut || DEFAULT_GLOBAL_SHORTCUT);
      if (app.runtime.shortcutEscapeArmed && currentShortcut === DEFAULT_GLOBAL_SHORTCUT) {
        app.runtime.shortcutEscapeArmed = false;
        closeDialog(app.refs.settingsDialog);
        return;
      }

      app.store.state.app.globalShortcut = DEFAULT_GLOBAL_SHORTCUT;
      if (app.refs.globalShortcutInput) app.refs.globalShortcutInput.value = DEFAULT_GLOBAL_SHORTCUT;
      app.runtime.shortcutEscapeArmed = true;
      app.saveState();
      void syncWindowBehavior();
      return;
    }

    if (event.key === "Backspace" || event.key === "Delete") {
      app.runtime.shortcutEscapeArmed = false;
      app.store.state.app.globalShortcutEnabled = false;
      app.store.state.app.globalShortcut = DEFAULT_GLOBAL_SHORTCUT;
      if (app.refs.globalShortcutEnabledInput) app.refs.globalShortcutEnabledInput.checked = false;
      if (app.refs.globalShortcutInput) app.refs.globalShortcutInput.value = "";
      app.saveState();
      void syncWindowBehavior();
      return;
    }

    const rawShortcut = keyboardEventToShortcut(event);
    if (!rawShortcut) {
      app.runtime.shortcutEscapeArmed = false;
      if (app.refs.globalShortcutStatus) {
        app.refs.globalShortcutStatus.textContent = "请继续按下一个非修饰键，例如 Ctrl+Alt+Space。";
      }
      return;
    }

    const shortcut = sanitizeShortcut(rawShortcut);
    app.store.state.app.globalShortcut = shortcut;
    app.runtime.shortcutEscapeArmed = false;
    if (app.refs.globalShortcutInput) app.refs.globalShortcutInput.value = shortcut;
    app.saveState();
    void syncWindowBehavior();
  }

  async function syncNativeWindowBehavior() {
    await app.desktopPanel?.configureWindowBehavior?.({
      autoHideEnabled: !!app.store.state.app.autoHideOnBlur,
      snapEdge: sanitizeSnapEdge(app.store.state.app.snapEdge),
      snapDistance: clampNumber(app.store.state.app.snapDistance, SNAP_DISTANCE_MIN, SNAP_DISTANCE_MAX, 14),
      revealDelayMs: clampNumber(app.store.state.app.revealDelay, REVEAL_DELAY_MIN, REVEAL_DELAY_MAX, 250),
      drawerEnabled: !!app.store.state.app.drawerModeEnabled,
      drawerEdge: sanitizeSnapEdge(app.store.state.app.drawerEdge),
      drawerDelayMs: clampNumber(app.store.state.app.drawerCollapseDelay, DRAWER_DELAY_MIN, DRAWER_DELAY_MAX, 450),
      reduceMotion: !!app.store.state.layout.reduceMotion
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
    if (app.refs.drawerModeHint) {
      const edge = edgeLabel(sanitizeSnapEdge(app.store.state.app.drawerEdge));
      const trigger = sanitizeDrawerTrigger(app.store.state.app.drawerTrigger) === "click" ? "点击" : "Hover 或点击";
      app.refs.drawerModeHint.textContent = app.store.state.app.drawerModeEnabled
        ? `收起位置：${edge}；唤出方式：${trigger}；失焦/离开后 ${app.store.state.app.drawerCollapseDelay || 450} ms 收起。`
        : "边缘收起默认关闭。";
    }
  }

  function edgeLabel(edge) {
    return {
      auto: "自动",
      left: "左侧",
      right: "右侧",
      top: "顶部",
      bottom: "底部"
    }[edge] || "自动";
  }

  function scrollToSettingsSection(sectionName, activeButton = null) {
    const section = app.refs.settingsDialog?.querySelector?.(`[data-settings-section="${sectionName}"]`);
    if (!section) return;

    section.scrollIntoView({ block: "start", behavior: app.store.state.layout.reduceMotion ? "auto" : "smooth" });
    section.setAttribute("tabindex", "-1");
    section.focus({ preventScroll: true });

    app.refs.settingsNav?.querySelectorAll(".settings-nav-button.is-active").forEach((button) => {
      button.classList.remove("is-active");
    });
    app.refs.settingsDialog?.querySelectorAll(".settings-section.is-jump-target").forEach((targetSection) => {
      targetSection.classList.remove("is-jump-target");
    });

    activeButton?.classList?.add("is-active");
    section.classList.add("is-jump-target");
    clearTimeout(app.runtime.settingsNavActiveTimer);
    clearTimeout(app.runtime.settingsSectionFocusTimer);
    app.runtime.settingsNavActiveTimer = setTimeout(() => {
      activeButton?.classList?.remove("is-active");
    }, 900);
    app.runtime.settingsSectionFocusTimer = setTimeout(() => {
      section.classList.remove("is-jump-target");
    }, 1200);
  }

  function handleGlobalKeydown(event) {
    if (event.key !== "Escape") return;
    if (event.target === app.refs.globalShortcutInput) return;

    if (hasVisibleMenu()) {
      event.preventDefault();
      event.stopPropagation();
      hideMenus();
      return;
    }

    if (app.runtime.updateInstallConfirmVisible) {
      event.preventDefault();
      event.stopPropagation();
      hideUpdateInstallConfirm();
      return;
    }

    const activeDialog = getOpenDialog();
    if (!activeDialog) return;

    event.preventDefault();
    event.stopPropagation();
    closeDialog(activeDialog);
  }

  function updateItemActionMenu(item) {
    const info = getItemActionInfo(item);
    app.refs.itemContextMenu.querySelectorAll("[data-action-type]").forEach((node) => {
      const type = node.dataset.actionType;
      const visible = type === "all" || type === "quick" || type === info.type || (type === "admin" && info.canRunAsAdmin);
      node.hidden = !visible;
    });
  }

  function getItemActionInfo(item) {
    const target = String(item?.url || "").trim();
    const isWeb = /^https?:\/\//i.test(target);
    const isLocal = !isWeb && (/^[a-z]:\\/i.test(target) || target.startsWith("\\\\"));
    const canRunAsAdmin = isLocal && /\.(exe|bat|cmd|msi)(\s|$|")?/i.test(target);
    return {
      type: isWeb ? "web" : isLocal ? "local" : "all",
      canRunAsAdmin
    };
  }

  async function copyTextAction(text, successMessage, failureMessage) {
    try {
      await copyText(String(text || ""));
      app.showDragToast(successMessage);
    } catch (error) {
      app.reportIssue(failureMessage, error?.message || String(error));
    }
  }

  async function copyFeedbackSummary() {
    try {
      await copyText(buildFeedbackSummary());
      if (app.refs.feedbackSummaryStatus) {
        app.refs.feedbackSummaryStatus.textContent = "反馈摘要已复制，可粘贴到 GitHub Issue 或聊天窗口。";
      }
      app.showDragToast("反馈摘要已复制");
    } catch (error) {
      if (app.refs.feedbackSummaryStatus) {
        app.refs.feedbackSummaryStatus.textContent = "复制失败，请稍后重试。";
      }
      app.reportIssue?.("复制反馈摘要失败", error?.message || String(error));
    }
  }

  function buildFeedbackSummary() {
    const layout = app.store.state.layout;
    const appConfig = app.store.state.app;
    const safeSettings = {
      layoutPreset: layout.layoutPreset,
      theme: layout.theme,
      fontFamily: layout.fontFamily,
      showSearch: layout.showSearch !== false,
      showRecent: layout.showRecent !== false,
      showItemLabel: layout.showItemLabel !== false,
      trackCount: layout.trackCount,
      reduceMotion: !!layout.reduceMotion,
      highContrastFocus: !!layout.highContrastFocus,
      snapToEdge: !!appConfig.snapToEdge,
      autoHideOnBlur: !!appConfig.autoHideOnBlur,
      snapEdge: appConfig.snapEdge,
      drawerModeEnabled: !!appConfig.drawerModeEnabled,
      drawerEdge: appConfig.drawerEdge,
      drawerTrigger: appConfig.drawerTrigger,
      globalShortcutEnabled: !!appConfig.globalShortcutEnabled,
      autoBackupEnabled: !!appConfig.autoBackupEnabled
    };

    return [
      "Mini Desk Tool 反馈摘要",
      `版本：v${app.version}`,
      `时间：${new Date().toISOString()}`,
      `平台：${navigator.platform || "unknown"}`,
      `用户代理：${navigator.userAgent || "unknown"}`,
      `视口：${window.innerWidth}x${window.innerHeight}`,
      "",
      "关键设置：",
      JSON.stringify(safeSettings, null, 2),
      "",
      "隐私说明：此摘要不包含图标列表、网址、文件路径、备份目录或完整配置数据。"
    ].join("\n");
  }

  async function copyText(text) {
    if (!text.trim()) throw new Error("copy text is empty");
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("clipboard API is unavailable");
  }

  async function runDesktopAction(action, successMessage, failureMessage) {
    try {
      await action?.();
      app.showDragToast(successMessage);
    } catch (error) {
      app.reportIssue(failureMessage, error?.message || String(error));
    }
  }

  async function refreshItemIconFromMenu(groupId, itemId) {
    app.showDragToast("正在刷新图标...");
    const result = await app.refreshItemIcon?.(groupId, itemId);
    if (result?.ok) {
      app.showDragToast(`图标已刷新：${result.name || "候选图标"}`);
      return;
    }
    const reason = result?.reason || "没有找到可用候选图标";
    app.showDragToast("图标刷新失败");
    app.reportIssue?.("图标刷新失败", reason);
  }

  function hideMenus() {
    app.refs.appContextMenu.hidden = true;
    app.refs.itemContextMenu.hidden = true;
  }

  function hasVisibleMenu() {
    return !app.refs.appContextMenu.hidden || !app.refs.itemContextMenu.hidden;
  }

  function hasOpenDialog() {
    return [app.refs.addDialog, app.refs.settingsDialog, app.refs.editDialog].some((dialog) => dialog?.open);
  }

  function getOpenDialog() {
    return [app.refs.editDialog, app.refs.addDialog, app.refs.settingsDialog].find((dialog) => dialog?.open) || null;
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
    if (dialog === app.refs.settingsDialog) app.runtime.shortcutEscapeArmed = false;
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
