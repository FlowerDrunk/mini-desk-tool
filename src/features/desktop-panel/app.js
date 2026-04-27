import {
  clampNumber,
  ensureValidGroups,
  findGroup,
  findItem,
  findItemById,
  hydrateState,
  loadState,
  normalizeUrl,
  safeHost,
  saveState,
  SIZE_META,
  WINDOW_WIDTH_MAX,
  WINDOW_WIDTH_MIN,
  SEARCH_ENGINES
} from "./model.js";
import { registerDialogFeature } from "./dialogs.js";
import { registerDragDropFeature } from "./drag-drop.js";
import { registerIconFeature } from "./icons.js";
import { registerRenderFeature } from "./render.js";
import { registerWindowShellFeature } from "./window-shell.js";

export function createDesktopPanelApp({ desktopPanel = window.desktopPanel } = {}) {
  const refs = createRefs();
  const app = {
    desktopPanel,
    refs,
    sizeMeta: SIZE_META,
    store: {
      state: loadState()
    },
    runtime: {
      dragData: null,
      pointerDrag: null,
      preventNextClickItemId: null,
      preventNextClickTimer: null,
      dragPreviewElement: null,
      activeItemContext: null,
      lastMenuPoint: null,
      externalDragDepth: 0,
      editingGroupId: null,
      addDialogSource: "tile",
      dropIndicator: null,
      dragToastTimer: null,
      issues: [],
      searchQuery: "",
      recentPage: 0,
      selectionMode: false,
      selectionLongPressTimer: null,
      selectedItemIds: new Set(),
      selectionAnchorGroupId: null,
      settingsNavActiveTimer: null,
      settingsSectionFocusTimer: null,
      shortcutEscapeArmed: false,
      pendingEditOriginalIconUrl: "",
      iconPickers: {
        add: createIconPickerState({
          grid: refs.addIconSuggestionsGrid,
          refreshButton: refs.addRefreshIconsButton
        }),
        edit: createIconPickerState({
          grid: refs.editIconSuggestionsGrid,
          refreshButton: refs.editRefreshIconsButton
        })
      }
    },
    hydrateState,
    normalizeUrl,
    safeHost,
    clampNumber,
    saveState: () => saveState(app.store),
    ensureValidGroups: () => ensureValidGroups(app.store),
    findGroup: (groupId) => findGroup(app.store, groupId),
    findItem: (groupId, itemId) => findItem(app.store, groupId, itemId),
    findItemById: (itemId) => findItemById(app.store, itemId),
    rememberItem(itemId) {
      if (!itemId || !app.findItemById(itemId)) return;
      const recent = app.store.state.ui.recentItemIds.filter((id) => id !== itemId);
      recent.unshift(itemId);
      app.store.state.ui.recentItemIds = recent.slice(0, 10);
      app.runtime.recentPage = 0;
      app.saveState();
    },
    openItem(itemId, url) {
      app.rememberItem(itemId);
      app.openUrl(url);
      if (app.store.state.layout.showRecent !== false) app.render();
    },
    openUrl(url) {
      if (!url) return;
      if (app.desktopPanel?.openUrl) {
        app.desktopPanel.openUrl(url);
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    },
    searchWithEngine(query) {
      const trimmed = String(query || "").trim();
      if (!trimmed) return;
      const engine = SEARCH_ENGINES[app.store.state.layout.searchEngine] || SEARCH_ENGINES.bing;
      app.openUrl(`${engine.url}${encodeURIComponent(trimmed)}`);
    }
  };

  registerRenderFeature(app);
  registerIconFeature(app);
  registerDragDropFeature(app);
  registerDialogFeature(app);
  registerWindowShellFeature(app);

  return {
    initialize() {
      app.applyLayout();
      app.desktopPanel?.setWindowSize?.(
        clampNumber(app.store.state.layout.windowWidth, WINDOW_WIDTH_MIN, WINDOW_WIDTH_MAX, 360)
      );
      app.desktopPanel?.setSnapEnabled?.(app.store.state.app.snapToEdge);
      void app.syncWindowBehavior?.();
      app.render();
      app.bindEvents();
      app.bindDragBand();
      app.renderIconSuggestions("add");
      app.renderIconSuggestions("edit");
      return app;
    },
    app
  };
}

function createRefs() {
  return {
    appShell: document.querySelector("#appShell"),
    windowDragBand: document.querySelector("#windowDragBand"),
    workspace: document.querySelector("#workspace"),
    searchInput: document.querySelector("#searchInput"),
    searchEngineSelect: document.querySelector("#searchEngineSelect"),
    clearSearchButton: document.querySelector("#clearSearchButton"),
    batchToolbar: document.querySelector("#batchToolbar"),
    batchCount: document.querySelector("#batchCount"),
    batchGroupSelect: document.querySelector("#batchGroupSelect"),
    batchSizeSelect: document.querySelector("#batchSizeSelect"),
    batchSelectGroupButton: document.querySelector("#batchSelectGroupButton"),
    batchSelectAllButton: document.querySelector("#batchSelectAllButton"),
    batchMoveButton: document.querySelector("#batchMoveButton"),
    batchResizeButton: document.querySelector("#batchResizeButton"),
    batchDeleteButton: document.querySelector("#batchDeleteButton"),
    batchClearButton: document.querySelector("#batchClearButton"),
    groupsContainer: document.querySelector("#groups"),
    itemTemplate: document.querySelector("#itemTemplate"),
    addDialog: document.querySelector("#addDialog"),
    addForm: document.querySelector("#addForm"),
    addTitleInput: document.querySelector("#addTitleInput"),
    addDescriptionInput: document.querySelector("#addDescriptionInput"),
    addUrlInput: document.querySelector("#addUrlInput"),
    groupSelect: document.querySelector("#groupSelect"),
    addIconSuggestionsGrid: document.querySelector("#addIconSuggestions"),
    addIconSearchStatus: document.querySelector("#addIconSearchStatus"),
    addRefreshIconsButton: document.querySelector("#addRefreshIconsButton"),
    addLinkSearchStatus: document.querySelector("#addLinkSearchStatus"),
    cancelAddDialog: document.querySelector("#cancelAddDialog"),
    settingsDialog: document.querySelector("#settingsDialog"),
    settingsNav: document.querySelector("#settingsNav"),
    profileSelect: document.querySelector("#profileSelect"),
    profileNameInput: document.querySelector("#profileNameInput"),
    createProfileButton: document.querySelector("#createProfileButton"),
    renameProfileButton: document.querySelector("#renameProfileButton"),
    profileStatus: document.querySelector("#profileStatus"),
    layoutPresetSelect: document.querySelector("#layoutPresetSelect"),
    themeSelect: document.querySelector("#themeSelect"),
    customThemeFields: document.querySelector("#customThemeFields"),
    customThemeNameInput: document.querySelector("#customThemeNameInput"),
    customThemeAccentInput: document.querySelector("#customThemeAccentInput"),
    customThemeAccent2Input: document.querySelector("#customThemeAccent2Input"),
    customThemeSurfaceInput: document.querySelector("#customThemeSurfaceInput"),
    panelOpacityInput: document.querySelector("#panelOpacityInput"),
    fontFamilySelect: document.querySelector("#fontFamilySelect"),
    textColorInput: document.querySelector("#textColorInput"),
    appearanceHint: document.querySelector("#appearanceHint"),
    settingsSearchEngineSelect: document.querySelector("#settingsSearchEngineSelect"),
    searchEngineHint: document.querySelector("#searchEngineHint"),
    iconSizeInput: document.querySelector("#iconSizeInput"),
    windowWidthInput: document.querySelector("#windowWidthInput"),
    showAddTileInput: document.querySelector("#showAddTileInput"),
    showGroupTitleInput: document.querySelector("#showGroupTitleInput"),
    showItemLabelInput: document.querySelector("#showItemLabelInput"),
    showSearchInput: document.querySelector("#showSearchInput"),
    showRecentInput: document.querySelector("#showRecentInput"),
    layoutDirectionInput: document.querySelector("#layoutDirectionInput"),
    trackCountInput: document.querySelector("#trackCountInput"),
    trackCountHint: document.querySelector("#trackCountHint"),
    snapEdgeInput: document.querySelector("#snapEdgeInput"),
    launchAtLoginInput: document.querySelector("#launchAtLoginInput"),
    autoHideOnBlurInput: document.querySelector("#autoHideOnBlurInput"),
    snapEdgeSelect: document.querySelector("#snapEdgeSelect"),
    snapDistanceInput: document.querySelector("#snapDistanceInput"),
    snapDistanceHint: document.querySelector("#snapDistanceHint"),
    revealDelayInput: document.querySelector("#revealDelayInput"),
    revealDelayHint: document.querySelector("#revealDelayHint"),
    globalShortcutEnabledInput: document.querySelector("#globalShortcutEnabledInput"),
    globalShortcutInput: document.querySelector("#globalShortcutInput"),
    globalShortcutStatus: document.querySelector("#globalShortcutStatus"),
    dragToast: document.querySelector("#dragToast"),
    issueCenter: document.querySelector("#issueCenter"),
    issueList: document.querySelector("#issueList"),
    dismissIssueCenter: document.querySelector("#dismissIssueCenter"),
    importDesktopButton: document.querySelector("#importDesktopButton"),
    importStartMenuButton: document.querySelector("#importStartMenuButton"),
    exportDataButton: document.querySelector("#exportDataButton"),
    importDataButton: document.querySelector("#importDataButton"),
    autoGroupButton: document.querySelector("#autoGroupButton"),
    closeWindowButton: document.querySelector("#closeWindow"),
    autoBackupEnabledInput: document.querySelector("#autoBackupEnabledInput"),
    backupRetentionInput: document.querySelector("#backupRetentionInput"),
    backupStatus: document.querySelector("#backupStatus"),
    chooseBackupDirectoryButton: document.querySelector("#chooseBackupDirectoryButton"),
    backupNowButton: document.querySelector("#backupNowButton"),
    restorePointButton: document.querySelector("#restorePointButton"),
    clearIssuesButton: document.querySelector("#clearIssuesButton"),
    cancelSettingsDialog: document.querySelector("#cancelSettingsDialog"),
    editDialog: document.querySelector("#editDialog"),
    editForm: document.querySelector("#editForm"),
    editTitleInput: document.querySelector("#editTitleInput"),
    editDescriptionInput: document.querySelector("#editDescriptionInput"),
    editUrlInput: document.querySelector("#editUrlInput"),
    editGroupSelect: document.querySelector("#editGroupSelect"),
    editSizeSelect: document.querySelector("#editSizeSelect"),
    editIconModeSelect: document.querySelector("#editIconModeSelect"),
    editIconModeHint: document.querySelector("#editIconModeHint"),
    editCustomIconField: document.querySelector("#editCustomIconField"),
    editCustomIconInput: document.querySelector("#editCustomIconInput"),
    editIconSuggestionsGrid: document.querySelector("#editIconSuggestions"),
    editIconSearchStatus: document.querySelector("#editIconSearchStatus"),
    editRefreshIconsButton: document.querySelector("#editRefreshIconsButton"),
    editLinkSearchStatus: document.querySelector("#editLinkSearchStatus"),
    cancelEditDialog: document.querySelector("#cancelEditDialog"),
    appContextMenu: document.querySelector("#appContextMenu"),
    itemContextMenu: document.querySelector("#itemContextMenu")
  };
}

function createIconPickerState({ grid, refreshButton }) {
  return {
    suggestions: [],
    selectedUrl: "",
    batchIndex: 0,
    refreshCooldownUntil: 0,
    refreshCooldownTimer: null,
    searchTimer: null,
    searchRequestId: 0,
    linkSearchTimer: null,
    linkSearchRequestId: 0,
    grid,
    refreshButton
  };
}
