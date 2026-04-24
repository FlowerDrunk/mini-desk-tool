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
  WINDOW_WIDTH_MIN
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
    openUrl(url) {
      if (!url) return;
      if (app.desktopPanel?.openUrl) {
        app.desktopPanel.openUrl(url);
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
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
    iconSizeInput: document.querySelector("#iconSizeInput"),
    windowWidthInput: document.querySelector("#windowWidthInput"),
    showAddTileInput: document.querySelector("#showAddTileInput"),
    showGroupTitleInput: document.querySelector("#showGroupTitleInput"),
    layoutDirectionInput: document.querySelector("#layoutDirectionInput"),
    trackCountInput: document.querySelector("#trackCountInput"),
    trackCountHint: document.querySelector("#trackCountHint"),
    snapEdgeInput: document.querySelector("#snapEdgeInput"),
    launchAtLoginInput: document.querySelector("#launchAtLoginInput"),
    dragToast: document.querySelector("#dragToast"),
    exportDataButton: document.querySelector("#exportDataButton"),
    importDataButton: document.querySelector("#importDataButton"),
    autoGroupButton: document.querySelector("#autoGroupButton"),
    closeWindowButton: document.querySelector("#closeWindow"),
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
