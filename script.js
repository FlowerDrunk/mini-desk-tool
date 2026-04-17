const STORAGE_KEY = "desktop-panel-state-v7";
const LEGACY_STORAGE_KEYS = ["desktop-panel-state-v6"];
const DEFAULT_GROUP_ID = "group-default";
const NEW_AUTO_GROUP = "__new_auto_group__";

const SIZE_META = {
  "1x1": { scale: 1 },
  "1x2": { scale: 1.12 },
  "2x2": { scale: 1.28 }
};

const DISPLAY_TEXT_REPAIRS = {
  "甯哥敤": "常用",
  "鐭ヤ箮": "知乎",
  "鑵捐瑙嗛": "腾讯视频",
  "鏈懡鍚嶇粍": "未命名组",
  "蹇嵎鏂瑰紡": "快捷方式",
  "鐭ヨ瘑": "知识",
  "褰遍煶": "影音",
  "寮€鍙?": "开发",
  "璧勮": "资讯",
  "璐墿": "购物",
  "閭": "邮箱"
};
const TRACK_COUNT_MIN = 1;
const TRACK_COUNT_MAX = 4;

const defaultState = {
  layout: { iconSize: 58, gap: 14, showGroupTitle: true, showAddTile: false, flowDirection: "ltr", trackCount: 3 },
  app: { snapToEdge: true },
  groups: [
    {
      id: DEFAULT_GROUP_ID,
      name: "常用",
      items: [
        { id: crypto.randomUUID(), title: "知乎", description: "", url: "https://www.zhihu.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" },
        { id: crypto.randomUUID(), title: "腾讯视频", description: "", url: "https://v.qq.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" }
      ]
    }
  ]
};

const appShell = document.querySelector("#appShell");
const windowDragBand = document.querySelector("#windowDragBand");
const workspace = document.querySelector("#workspace");
const groupsContainer = document.querySelector("#groups");
const itemTemplate = document.querySelector("#itemTemplate");

const addDialog = document.querySelector("#addDialog");
const addForm = document.querySelector("#addForm");
const addTitleInput = document.querySelector("#addTitleInput");
const addDescriptionInput = document.querySelector("#addDescriptionInput");
const addUrlInput = document.querySelector("#addUrlInput");
const groupSelect = document.querySelector("#groupSelect");
const addIconSuggestionsGrid = document.querySelector("#addIconSuggestions");
const addIconSearchStatus = document.querySelector("#addIconSearchStatus");
const addRefreshIconsButton = document.querySelector("#addRefreshIconsButton");
const addLinkSearchStatus = document.querySelector("#addLinkSearchStatus");
const cancelAddDialog = document.querySelector("#cancelAddDialog");

const settingsDialog = document.querySelector("#settingsDialog");
const iconSizeInput = document.querySelector("#iconSizeInput");
const gapInput = document.querySelector("#gapInput");
const showAddTileInput = document.querySelector("#showAddTileInput");
const showGroupTitleInput = document.querySelector("#showGroupTitleInput");
const layoutDirectionInput = document.querySelector("#layoutDirectionInput");
const trackCountInput = document.querySelector("#trackCountInput");
const trackCountHint = document.querySelector("#trackCountHint");
const snapEdgeInput = document.querySelector("#snapEdgeInput");
const launchAtLoginInput = document.querySelector("#launchAtLoginInput");
const dragToast = document.querySelector("#dragToast");
const autoGroupButton = document.querySelector("#autoGroupButton");
const closeWindowButton = document.querySelector("#closeWindow");
const cancelSettingsDialog = document.querySelector("#cancelSettingsDialog");

const editDialog = document.querySelector("#editDialog");
const editForm = document.querySelector("#editForm");
const editTitleInput = document.querySelector("#editTitleInput");
const editDescriptionInput = document.querySelector("#editDescriptionInput");
const editUrlInput = document.querySelector("#editUrlInput");
const editGroupSelect = document.querySelector("#editGroupSelect");
const editSizeSelect = document.querySelector("#editSizeSelect");
const editIconModeSelect = document.querySelector("#editIconModeSelect");
const editIconModeHint = document.querySelector("#editIconModeHint");
const editCustomIconField = document.querySelector("#editCustomIconField");
const editCustomIconInput = document.querySelector("#editCustomIconInput");
const editIconSuggestionsGrid = document.querySelector("#editIconSuggestions");
const editIconSearchStatus = document.querySelector("#editIconSearchStatus");
const editRefreshIconsButton = document.querySelector("#editRefreshIconsButton");
const editLinkSearchStatus = document.querySelector("#editLinkSearchStatus");
const cancelEditDialog = document.querySelector("#cancelEditDialog");

const appContextMenu = document.querySelector("#appContextMenu");
const itemContextMenu = document.querySelector("#itemContextMenu");

let state = loadState();
let dragData = null;
let activeItemContext = null;
let externalDragDepth = 0;
let editingGroupId = null;
let addIconSuggestions = [];
let selectedAddIconUrl = "";
let editIconSuggestions = [];
let selectedEditIconUrl = "";
let addIconBatchIndex = 0;
let editIconBatchIndex = 0;
let addRefreshCooldownUntil = 0;
let editRefreshCooldownUntil = 0;
let addRefreshCooldownTimer = null;
let editRefreshCooldownTimer = null;
let addIconSearchTimer = null;
let editIconSearchTimer = null;
let addIconSearchRequestId = 0;
let editIconSearchRequestId = 0;
let addLinkSearchTimer = null;
let editLinkSearchTimer = null;
let addLinkSearchRequestId = 0;
let editLinkSearchRequestId = 0;
let addDialogSource = "tile";
let dropIndicator = null;
let dragToastTimer = null;
let pendingEditOriginalIconUrl = "";

applyLayout();
window.desktopPanel?.setSnapEnabled?.(state.app.snapToEdge);
render();
bindEvents();
bindDragBand();
renderIconSuggestions("add");
renderIconSuggestions("edit");

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || LEGACY_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return migrateFromLegacyArray(parsed);

    const layout = {
      iconSize: clampNumber(parsed.layout?.iconSize, 42, 76, 58),
      gap: clampNumber(parsed.layout?.gap, 8, 24, 14),
      showGroupTitle: parsed.layout?.showGroupTitle !== false,
      showAddTile: parsed.layout?.showAddTile === true,
      flowDirection: parsed.layout?.flowDirection === "rtl" ? "rtl" : "ltr",
      trackCount: clampNumber(parsed.layout?.trackCount, TRACK_COUNT_MIN, TRACK_COUNT_MAX, 3)
    };
    const appConfig = { snapToEdge: parsed.app?.snapToEdge !== false };
    const groups = Array.isArray(parsed.groups)
      ? parsed.groups
          .map((group) => ({
            id: group.id || crypto.randomUUID(),
            name: repairDisplayText(String(group.name || "未命名组").trim() || "未命名组"),
            items: Array.isArray(group.items)
              ? group.items
                  .filter((item) => item && typeof item.title === "string" && typeof item.url === "string")
                  .map((item) => normalizeItem(item))
              : []
          }))
          .filter((group) => group.items.length || group.id === DEFAULT_GROUP_ID)
      : [];

    if (!groups.length) groups.push(structuredClone(defaultState.groups[0]));
    return { layout, app: appConfig, groups };
  } catch {
    return structuredClone(defaultState);
  }
}

function migrateFromLegacyArray(items) {
  return {
    layout: structuredClone(defaultState.layout),
    app: structuredClone(defaultState.app),
    groups: [
      {
        id: DEFAULT_GROUP_ID,
        name: "常用",
        items: items
          .filter((item) => item && typeof item.title === "string" && typeof item.url === "string")
          .map((item) => normalizeItem({ ...item, size: "1x1" }))
      }
    ]
  };
}

function normalizeItem(item) {
  return {
    id: item.id || crypto.randomUUID(),
    title: repairDisplayText(String(item.title || "").trim() || "未命名"),
    description: repairDisplayText(String(item.description || "").trim()),
    url: normalizeUrl(String(item.url || "").trim()),
    size: SIZE_META[item.size] ? item.size : "1x1",
    iconMode: item.iconMode === "custom" ? "custom" : "default",
    customIcon: String(item.customIcon || "").trim(),
    shortcutIcon: String(item.shortcutIcon || "").trim()
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function bindEvents() {
  cancelAddDialog.addEventListener("click", () => addDialog.close());
  cancelSettingsDialog.addEventListener("click", () => settingsDialog.close());
  cancelEditDialog.addEventListener("click", () => editDialog.close());

  addForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(addForm);
    const title = String(formData.get("title") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const url = normalizeUrl(String(formData.get("url") || "").trim());
    const groupId = String(formData.get("groupId") || "");
    if (!title || !url) return;

    const actualGroupId = ensureGroupBySelection(groupId, title, url);
    const targetGroup = findGroup(actualGroupId) || state.groups[0];
    const nextItem = {
      id: crypto.randomUUID(),
      title,
      description,
      url,
      size: "1x1",
      iconMode: selectedAddIconUrl ? "custom" : "default",
      customIcon: selectedAddIconUrl,
      shortcutIcon: ""
    };
    const insertIndex = addDialogSource === "menu" ? 0 : targetGroup.items.length;
    targetGroup.items.splice(insertIndex, 0, nextItem);
    saveState();
    render();
    addDialog.close();
  });

  editForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!activeItemContext) return;

    const item = findItem(activeItemContext.groupId, activeItemContext.itemId);
    if (!item) return;

    const nextGroupId = String(editGroupSelect.value || "");
    const nextTitle = editTitleInput.value.trim();
    const nextDescription = editDescriptionInput.value.trim();
    const nextUrl = normalizeUrl(editUrlInput.value.trim());
    const nextSize = editSizeSelect.value;
    const nextIconMode = editIconModeSelect.value === "custom" ? "custom" : "default";
    const nextCustomIcon = editCustomIconInput.value.trim();

    if (!nextTitle || !nextUrl || !SIZE_META[nextSize]) return;

    item.title = nextTitle;
    item.description = nextDescription;
    item.url = nextUrl;
    item.size = nextSize;
    item.iconMode = nextIconMode;
    item.customIcon = nextIconMode === "custom" ? nextCustomIcon : "";

    if (nextGroupId && nextGroupId !== activeItemContext.groupId) {
      moveItem(activeItemContext.groupId, nextGroupId, item.id, findGroup(nextGroupId)?.items.length ?? 0, false);
      activeItemContext = { groupId: nextGroupId, itemId: item.id };
    }

    saveState();
    render();
    editDialog.close();
  });

  editIconModeSelect.addEventListener("change", () => syncEditDialogFields());
  editCustomIconInput.addEventListener("input", () => {
    selectedEditIconUrl = editCustomIconInput.value.trim();
    renderIconSuggestions("edit");
  });

  addUrlInput.addEventListener("input", () => {
    renderIconSuggestions("add");
  });

  addRefreshIconsButton?.addEventListener("click", () => rotateIconSuggestions("add"));
  editRefreshIconsButton?.addEventListener("click", () => rotateIconSuggestions("edit"));

  addDescriptionInput.addEventListener("input", () => {
    if (shouldAutoSearchOfficialLink("add")) {
      scheduleOfficialLinkSearch("add", addDescriptionInput.value);
    } else {
      cancelOfficialLinkSearch("add");
      setLinkSearchStatus("add", "当前入口不自动搜索官网，请手动填写地址或路径");
    }
    scheduleIconSuggestionSearch("add", addDescriptionInput.value, { autoSelectFirst: true });
  });

  editDescriptionInput.addEventListener("input", () => {
    cancelOfficialLinkSearch("edit");
    setLinkSearchStatus("edit", "编辑时不自动搜索官网，请按需手动修改地址");
    scheduleIconSuggestionSearch("edit", editDescriptionInput.value, {
      preferUrl: editCustomIconInput.value.trim(),
      autoSelectFirst: !editCustomIconInput.value.trim()
    });
  });

  workspace.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const tile = event.target.closest(".tile");
    hideMenus();
    if (tile) {
      activeItemContext = { groupId: tile.dataset.groupId, itemId: tile.dataset.itemId };
      openMenu(itemContextMenu, event.clientX, event.clientY);
      return;
    }
    openMenu(appContextMenu, event.clientX, event.clientY);
  });

  workspace.addEventListener("dblclick", (event) => {
    const title = event.target.closest(".group-title");
    if (!title) return;
    beginRenameGroup(title.dataset.groupId);
  });

  workspace.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    if (event.target.closest(".tile") || event.target.closest(".add-tile") || event.target.closest(".context-menu")) return;
    hideMenus();
  });

  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (event.target.closest(".context-menu")) return;
    hideMenus();
  }, true);

  window.addEventListener("blur", () => {
    hideMenus();
    appShell.classList.remove("is-window-dragging");
  });

  appContextMenu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    const action = button?.dataset.action;
    if (!action) return;
    hideMenus();

    if (action === "open-settings") openSettings();
    if (action === "add-icon") openAddDialog("menu");
  });

  itemContextMenu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    const action = button?.dataset.action;
    if (!action || !activeItemContext) return;
    const context = activeItemContext;
    const item = findItem(context.groupId, context.itemId);
    hideMenus();
    if (!item) return;

    if (action === "edit-item") {
      openEditDialog(context.groupId, context.itemId);
      return;
    }

    if (action === "duplicate-item") {
      const group = findGroup(context.groupId);
      if (!group) return;
      const index = group.items.findIndex((entry) => entry.id === item.id);
      group.items.splice(index + 1, 0, { ...structuredClone(item), id: crypto.randomUUID() });
      saveState();
      render();
      return;
    }

    if (action === "delete-item") removeItem(context.groupId, context.itemId);
  });

  iconSizeInput.addEventListener("input", () => {
    state.layout.iconSize = clampNumber(Number(iconSizeInput.value), 42, 76, 58);
    applyLayout();
    saveState();
    render();
  });

  gapInput.addEventListener("input", () => {
    state.layout.gap = clampNumber(Number(gapInput.value), 8, 24, 14);
    applyLayout();
    saveState();
    render();
  });

  showAddTileInput.addEventListener("change", () => {
    state.layout.showAddTile = showAddTileInput.checked;
    saveState();
    render();
  });

  showGroupTitleInput.addEventListener("change", () => {
    state.layout.showGroupTitle = showGroupTitleInput.checked;
    saveState();
    render();
  });

  layoutDirectionInput.addEventListener("change", () => {
    state.layout.flowDirection = layoutDirectionInput.value === "rtl" ? "rtl" : "ltr";
    applyLayout();
    saveState();
    render();
  });

  trackCountInput.addEventListener("input", () => {
    state.layout.trackCount = clampNumber(Number(trackCountInput.value), TRACK_COUNT_MIN, TRACK_COUNT_MAX, 3);
    updateTrackCountHint();
    applyLayout();
    saveState();
    render();
  });

  snapEdgeInput.addEventListener("change", () => {
    state.app.snapToEdge = snapEdgeInput.checked;
    window.desktopPanel?.setSnapEnabled?.(state.app.snapToEdge);
    saveState();
  });

  launchAtLoginInput?.addEventListener("change", async () => {
    const nextValue = launchAtLoginInput.checked;
    try {
      const applied = await window.desktopPanel?.setLaunchAtLogin?.(nextValue);
      launchAtLoginInput.checked = Boolean(applied);
    } catch {
      launchAtLoginInput.checked = !nextValue;
    }
  });

  autoGroupButton.addEventListener("click", () => {
    autoGroupByContent();
    saveState();
    render();
  });

  closeWindowButton.addEventListener("click", () => window.desktopPanel?.closeWindow?.());

  bindExternalShortcutDrop();
}

function bindDragBand() {
  windowDragBand.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    appShell.classList.add("is-window-dragging");
  });

  window.addEventListener("pointerup", () => {
    appShell.classList.remove("is-window-dragging");
  });
}

function render() {
  ensureValidGroups();
  groupsContainer.innerHTML = "";
  clearDropIndicator();

  state.groups.forEach((group, groupIndex) => {
    const section = document.createElement("section");
    section.className = "group";
    section.dataset.groupId = group.id;

    if (state.layout.showGroupTitle) section.appendChild(createGroupTitleNode(group));

    const grid = document.createElement("div");
    grid.className = "group-grid";
    grid.dataset.groupId = group.id;
    grid.dataset.flow = state.layout.flowDirection;
    bindGridDropEvents(grid, section, group.id);

    group.items.forEach((item, index) => {
      grid.appendChild(createItemNode(item, group.id, index));
    });

    if (state.layout.showAddTile && groupIndex === state.groups.length - 1) grid.appendChild(createAddTile());

    section.appendChild(grid);
    groupsContainer.appendChild(section);
  });

  refreshGroupOptions(groupSelect);
  refreshGroupOptions(editGroupSelect, false);
}

function createGroupTitleNode(group) {
  if (editingGroupId === group.id) {
    const input = document.createElement("input");
    input.className = "group-title-input";
    input.value = group.name;
    input.maxLength = 24;
    input.addEventListener("blur", () => finishRenameGroup(group.id, input.value));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") finishRenameGroup(group.id, input.value);
      if (event.key === "Escape") {
        editingGroupId = null;
        render();
      }
    });
    queueMicrotask(() => input.focus());
    queueMicrotask(() => input.select());
    return input;
  }

  const title = document.createElement("h3");
  title.className = "group-title";
  title.dataset.groupId = group.id;
  title.textContent = group.name;
  return title;
}

function beginRenameGroup(groupId) {
  editingGroupId = groupId;
  render();
}

function finishRenameGroup(groupId, value) {
  const group = findGroup(groupId);
  editingGroupId = null;
  if (group && value.trim()) group.name = value.trim();
  saveState();
  render();
}

function createItemNode(item, groupId, index) {
  const node = itemTemplate.content.firstElementChild.cloneNode(true);
  node.dataset.itemId = item.id;
  node.dataset.groupId = groupId;
  node.dataset.index = String(index);
  node.dataset.size = item.size;

  const icon = node.querySelector(".icon");
  const label = node.querySelector(".label");
  const deleteButton = node.querySelector(".delete");
  const meta = SIZE_META[item.size] || SIZE_META["1x1"];
  node.style.setProperty("--item-icon-size", `${Math.round(state.layout.iconSize * meta.scale)}px`);

  label.textContent = item.title;
  icon.alt = `${item.title} 图标`;
  setItemIcon(icon, item);

  node.addEventListener("click", (event) => {
    if (event.target === deleteButton) return;
    openUrl(item.url);
  });

  deleteButton.addEventListener("click", (event) => {
    event.stopPropagation();
    removeItem(groupId, item.id);
  });

  // 为图标容器添加拖拽事件
  node.addEventListener("dragstart", () => {
    dragData = { itemId: item.id, fromGroupId: groupId };
    node.classList.add("dragging");
  });

  node.addEventListener("dragend", () => {
    dragData = null;
    node.classList.remove("dragging");
    clearAllDropTargets();
    // 拖拽完成后重新渲染界面
    render();
  });

  // 为子元素添加样式，确保它们不会阻止拖拽事件
  const iconWrap = node.querySelector(".icon-wrap");
  
  if (iconWrap) {
    iconWrap.style.pointerEvents = "none";
  }
  
  if (label) {
    label.style.pointerEvents = "none";
  }

  return node;
}

function setItemIcon(icon, item) {
  const sources = [];
  if (item.iconMode === "custom" && item.customIcon) sources.push(item.customIcon);
  if (item.shortcutIcon) sources.push(item.shortcutIcon);

  const host = safeHost(item.url);
  if (host) {
    sources.push(`https://icons.duckduckgo.com/ip3/${host}.ico`);
    sources.push(`https://www.google.com/s2/favicons?domain=${host}&sz=128`);
  }

  sources.push(makeFallbackIcon(item.title));
  let index = 0;
  icon.src = sources[index];
  icon.onerror = () => {
    index += 1;
    if (index < sources.length) icon.src = sources[index];
  };
}

function getOriginalIconCandidate(type) {
  if (type === "edit") {
    const item = activeItemContext ? findItem(activeItemContext.groupId, activeItemContext.itemId) : null;
    const url = String(
      item?.shortcutIcon ||
      pendingEditOriginalIconUrl ||
      ""
    ).trim();
    if (!url) return null;
    return { id: "original-icon", name: "原始图标", url, isOriginal: true };
  }

  const urlValue = normalizeUrl(String(addUrlInput.value || "").trim());
  const host = safeHost(urlValue);
  if (!host) return null;
  return {
    id: "original-icon",
    name: "原始图标",
    url: `https://icons.duckduckgo.com/ip3/${host}.ico`,
    isOriginal: true
  };
}

function setIconSearchStatus(type, text) {
  const target = type === "edit" ? editIconSearchStatus : addIconSearchStatus;
  if (target) target.textContent = text;
}

function setLinkSearchStatus(type, text) {
  const target = type === "edit" ? editLinkSearchStatus : addLinkSearchStatus;
  if (target) target.textContent = text;
}

function cancelOfficialLinkSearch(type) {
  if (type === "edit") {
    clearTimeout(editLinkSearchTimer);
    editLinkSearchTimer = null;
    editLinkSearchRequestId += 1;
    return;
  }

  clearTimeout(addLinkSearchTimer);
  addLinkSearchTimer = null;
  addLinkSearchRequestId += 1;
}

function getIconSuggestionState(type) {
  return type === "edit"
    ? {
        suggestions: editIconSuggestions,
        selectedUrl: selectedEditIconUrl,
        grid: editIconSuggestionsGrid,
        batchIndex: editIconBatchIndex,
        refreshButton: editRefreshIconsButton
      }
    : {
        suggestions: addIconSuggestions,
        selectedUrl: selectedAddIconUrl,
        grid: addIconSuggestionsGrid,
        batchIndex: addIconBatchIndex,
        refreshButton: addRefreshIconsButton
      };
}

function getDisplayedSuggestionLimit(type) {
  return type === "edit" ? 3 : 4;
}

function getDisplayedSuggestions(type, suggestions) {
  const originalCandidate = getOriginalIconCandidate(type);
  const recommendationLimit = getDisplayedSuggestionLimit(type);
  const batchIndex = type === "edit" ? editIconBatchIndex : addIconBatchIndex;
  const start = batchIndex * recommendationLimit;
  let recommended = suggestions.slice(start, start + recommendationLimit);

  if (!recommended.length && suggestions.length) {
    if (type === "edit") editIconBatchIndex = 0;
    else addIconBatchIndex = 0;
    recommended = suggestions.slice(0, recommendationLimit);
  }

  const merged = [];
  if (originalCandidate) merged.push(originalCandidate);
  recommended.forEach((item) => {
    if (!item?.url) return;
    if (merged.some((existing) => existing.url === item.url)) return;
    merged.push(item);
  });
  return merged;
}

function getAvailableBatchCount(type, suggestions) {
  const limit = getDisplayedSuggestionLimit(type);
  return Math.max(1, Math.ceil((suggestions?.length || 0) / limit));
}

function scheduleRefreshCooldownTick(type) {
  const timerKey = type === "edit" ? "edit" : "add";
  const currentTimer = timerKey === "edit" ? editRefreshCooldownTimer : addRefreshCooldownTimer;
  clearTimeout(currentTimer);

  const cooldownUntil = timerKey === "edit" ? editRefreshCooldownUntil : addRefreshCooldownUntil;
  if (!cooldownUntil || cooldownUntil <= Date.now()) {
    updateRefreshButtonState(type);
    return;
  }

  const nextTimer = setTimeout(() => {
    updateRefreshButtonState(type);
    scheduleRefreshCooldownTick(type);
  }, 250);

  if (timerKey === "edit") editRefreshCooldownTimer = nextTimer;
  else addRefreshCooldownTimer = nextTimer;
}

function updateRefreshButtonState(type) {
  const button = type === "edit" ? editRefreshIconsButton : addRefreshIconsButton;
  const suggestions = type === "edit" ? editIconSuggestions : addIconSuggestions;
  if (!button) return;

  const batchCount = getAvailableBatchCount(type, suggestions);
  const cooldownUntil = type === "edit" ? editRefreshCooldownUntil : addRefreshCooldownUntil;
  const remainingMs = Math.max(0, cooldownUntil - Date.now());
  const remainingSeconds = Math.ceil(remainingMs / 1000);

  button.disabled = batchCount <= 1 || remainingMs > 0;
  button.textContent = remainingMs > 0 ? `${remainingSeconds}s 后可换` : "换一批";
}

function rotateIconSuggestions(type) {
  const suggestions = type === "edit" ? editIconSuggestions : addIconSuggestions;
  const batchCount = getAvailableBatchCount(type, suggestions);
  if (batchCount <= 1) {
    updateRefreshButtonState(type);
    return;
  }

  const cooldownUntil = type === "edit" ? editRefreshCooldownUntil : addRefreshCooldownUntil;
  if (cooldownUntil > Date.now()) {
    updateRefreshButtonState(type);
    return;
  }

  if (type === "edit") {
    editIconBatchIndex = (editIconBatchIndex + 1) % batchCount;
    editRefreshCooldownUntil = Date.now() + 3000;
  } else {
    addIconBatchIndex = (addIconBatchIndex + 1) % batchCount;
    addRefreshCooldownUntil = Date.now() + 3000;
  }

  updateRefreshButtonState(type);
  scheduleRefreshCooldownTick(type);
  renderIconSuggestions(type);
}

function selectSuggestedIcon(type, candidate) {
  if (!candidate?.url) return;

  if (type === "edit") {
    selectedEditIconUrl = candidate.url;
    editIconModeSelect.value = "custom";
    editCustomIconInput.value = candidate.url;
    syncEditDialogFields();
    return;
  }

  selectedAddIconUrl = candidate.url;
  renderIconSuggestions("add");
}

function renderIconSuggestions(type) {
  const { suggestions, selectedUrl, grid } = getIconSuggestionState(type);
  if (!grid) return;

  grid.innerHTML = "";
  const mergedSuggestions = getDisplayedSuggestions(type, suggestions);

  if (!mergedSuggestions.length) {
    const empty = document.createElement("div");
    empty.className = "icon-suggestion-empty";
    empty.textContent = type === "edit" ? "修改描述后会在这里显示 4 个 iconfont 图标候选。" : "输入描述后会在这里显示 4 个 iconfont 图标候选。";
    grid.appendChild(empty);
    return;
  }

  mergedSuggestions.forEach((candidate) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "icon-suggestion-card";
    if (candidate.isOriginal) button.classList.add("is-original");
    if (candidate.url && candidate.url === selectedUrl) button.classList.add("is-selected");
    button.innerHTML = `<img src="${candidate.url}" alt="${escapeHtml(candidate.name)}"><span>${escapeHtml(candidate.name)}</span>`;
    button.addEventListener("click", () => selectSuggestedIcon(type, candidate));
    grid.appendChild(button);
  });

  updateRefreshButtonState(type);
}

function scheduleIconSuggestionSearch(type, rawDescription, options = {}) {
  const description = repairDisplayText(String(rawDescription || "").trim());
  const timerKey = type === "edit" ? "edit" : "add";
  const timer = timerKey === "edit" ? editIconSearchTimer : addIconSearchTimer;
  clearTimeout(timer);

  if (!description) {
    if (type === "edit") {
      editIconSuggestions = [];
      if (!editIconModeSelect.value || editIconModeSelect.value === "default") selectedEditIconUrl = "";
    } else {
      addIconSuggestions = [];
      selectedAddIconUrl = "";
    }
    setIconSearchStatus(type, "输入描述后自动搜索");
    renderIconSuggestions(type);
    return;
  }

  setIconSearchStatus(type, "正在搜索 iconfont 图标...");
  const nextTimer = setTimeout(() => {
    void runIconSuggestionSearch(type, description, options);
  }, 320);

  if (timerKey === "edit") {
    editIconSearchTimer = nextTimer;
  } else {
    addIconSearchTimer = nextTimer;
  }
}

async function runIconSuggestionSearch(type, description, options = {}) {
  const requestId = type === "edit" ? ++editIconSearchRequestId : ++addIconSearchRequestId;
  let suggestions = [];
  try {
    suggestions = (await window.desktopPanel?.searchIconSuggestions?.(description)) || [];
  } catch {
    suggestions = [];
  }

  if (type === "edit" && requestId !== editIconSearchRequestId) return;
  if (type === "add" && requestId !== addIconSearchRequestId) return;

  const normalized = Array.isArray(suggestions)
    ? suggestions
        .filter((item) => item && typeof item.url === "string" && item.url)
        .map((item, index) => ({
          id: item.id || `${description}-${index}`,
          name: repairDisplayText(String(item.name || description).trim() || description),
          url: String(item.url || "").trim()
        }))
    : [];
  if (type === "edit") {
    editIconSuggestions = normalized;
    editIconBatchIndex = 0;
    const preferredUrl = String(options.preferUrl || editCustomIconInput.value || "").trim();
    const visibleSuggestions = getDisplayedSuggestions(type, normalized);
    if (preferredUrl && visibleSuggestions.some((item) => item.url === preferredUrl)) {
      selectedEditIconUrl = preferredUrl;
    } else if (options.autoSelectFirst && visibleSuggestions[0]) {
      selectedEditIconUrl = visibleSuggestions[0].url;
      editIconModeSelect.value = "custom";
      editCustomIconInput.value = visibleSuggestions[0].url;
    }
  } else {
    addIconSuggestions = normalized;
    addIconBatchIndex = 0;
    const visibleSuggestions = getDisplayedSuggestions(type, normalized);
    if (visibleSuggestions.some((item) => item.url === selectedAddIconUrl)) {
      selectedAddIconUrl = selectedAddIconUrl;
    } else if (options.autoSelectFirst && visibleSuggestions[0]) {
      selectedAddIconUrl = visibleSuggestions[0].url;
    }
  }

  const totalCount = normalized.length + (getOriginalIconCandidate(type) ? 1 : 0);
  setIconSearchStatus(type, totalCount ? `已准备 ${totalCount} 个候选图标` : "没有找到合适图标，可以稍后手动修改");
  updateRefreshButtonState(type);
  renderIconSuggestions(type);
}

function scheduleOfficialLinkSearch(type, rawDescription) {
  const description = repairDisplayText(String(rawDescription || "").trim());
  const timerKey = type === "edit" ? "edit" : "add";
  const timer = timerKey === "edit" ? editLinkSearchTimer : addLinkSearchTimer;
  clearTimeout(timer);

  if (!description) {
    setLinkSearchStatus(type, "根据描述自动填充官方链接");
    return;
  }

  setLinkSearchStatus(type, "正在查找官方链接...");
  const nextTimer = setTimeout(() => {
    void runOfficialLinkSearch(type, description);
  }, 360);

  if (timerKey === "edit") {
    editLinkSearchTimer = nextTimer;
  } else {
    addLinkSearchTimer = nextTimer;
  }
}

async function runOfficialLinkSearch(type, description) {
  if (!shouldAutoSearchOfficialLink(type)) return;
  const requestId = type === "edit" ? ++editLinkSearchRequestId : ++addLinkSearchRequestId;
  let url = "";
  
  // 清理和标准化描述文本，提高搜索准确度
  let cleanDescription = description
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
  
  try {
    // 尝试使用清理后的描述进行搜索
    url = (await window.desktopPanel?.searchOfficialUrl?.(cleanDescription)) || "";
    
    // 如果没有找到，尝试使用原始描述
    if (!url && cleanDescription !== description) {
      url = (await window.desktopPanel?.searchOfficialUrl?.(description)) || "";
    }
  } catch {
    url = "";
  }

  if (type === "edit" && requestId !== editLinkSearchRequestId) return;
  if (type === "add" && requestId !== addLinkSearchRequestId) return;

  if (url) {
    // 标准化URL格式
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }
    
    if (type === "edit") {
      editUrlInput.value = url;
    } else {
      addUrlInput.value = url;
    }
    setLinkSearchStatus(type, "已自动填充官方链接");
    return;
  }

  setLinkSearchStatus(type, "没有找到明确官网，你也可以手动填写");
}

function createAddTile() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "add-tile no-drag";
  button.innerHTML = "<span class='add-circle'>+</span><p class='label'>添加图标</p>";
  button.addEventListener("click", () => openAddDialog("tile"));
  return button;
}

function shouldAutoSearchOfficialLink(type) {
  return type === "add" && addDialogSource === "menu";
}

function bindGridDropEvents(grid, groupSection, toGroupId) {
  const activateDropTarget = (event) => {
    if (!dragData && !isExternalFileDrag(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    grid.classList.add("drop-target");
    groupSection.classList.add("group-drop-target");
    updateDropIndicator(grid, event);
  };

  grid.addEventListener("dragover", activateDropTarget);
  groupSection.addEventListener("dragover", activateDropTarget);

  const handleDragLeave = (event) => {
    if (groupSection.contains(event.relatedTarget)) return;
    grid.classList.remove("drop-target");
    grid.classList.remove("drop-full");
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

    if (hasDroppedShortcutFiles(event)) {
      event.stopPropagation();
      await importDroppedShortcuts(event, toGroupId, getDropIndex(grid, event));
      return;
    }

    if (!dragData) return;
    const toGroup = findGroup(toGroupId);
    if (!toGroup) return;
    const isCrossGroup = dragData.fromGroupId !== toGroupId;
    let dropIndex;
    if (isCrossGroup || toGroup.items.length === 0) {
      dropIndex = toGroup.items.length;
    } else {
      dropIndex = getDropIndex(grid, event);
    }
    // 不立即渲染，等待dragend事件后再渲染
    moveItem(dragData.fromGroupId, toGroupId, dragData.itemId, dropIndex, false);
  };

  grid.addEventListener("drop", (event) => void handleDrop(event));
  groupSection.addEventListener("drop", (event) => void handleDrop(event));
}

function getDropIndex(grid, event) {
  const group = findGroup(grid.dataset.groupId);
  const tiles = Array.from(grid.querySelectorAll(".tile"));
  if (!group) return 0;
  if (!tiles.length) return 0;

  const direction = state.layout.flowDirection === "rtl" ? "rtl" : "ltr";
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
    .filter((filePath) => filePath && filePath.toLowerCase().endsWith(".lnk"));
}

async function importDroppedShortcuts(event, targetGroupId, dropIndex) {
  const filePaths = extractDroppedFilePaths(event);
  if (!filePaths.length) return;
  const shortcuts = await window.desktopPanel?.resolveLnkFiles?.(filePaths);
  if (!Array.isArray(shortcuts) || !shortcuts.length) return;
  await addResolvedShortcutsToGroup(targetGroupId, shortcuts, dropIndex);
  externalDragDepth = 0;
  clearAllDropTargets();
}

async function addResolvedShortcutsToGroup(targetGroupId, shortcuts, dropIndex) {
  const group = findGroup(targetGroupId) || findGroup(DEFAULT_GROUP_ID) || state.groups[0];
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
  saveState();
  render();
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
  const located = findItemById(itemId);
  if (!located?.item) return;

  const item = located.item;
  const query = item.description || item.title;
  let suggestions = [];
  try {
    suggestions = (await window.desktopPanel?.searchIconSuggestions?.(query)) || [];
  } catch {
    suggestions = [];
  }

  if (!Array.isArray(suggestions) || !suggestions[0]?.url) return;

  const latest = findItemById(itemId);
  if (!latest?.item) return;
  latest.item.iconMode = "custom";
  latest.item.customIcon = suggestions[0].url;
  saveState();
  render();
}

function clearAllDropTargets() {
  document.querySelectorAll(".group-grid").forEach((grid) => grid.classList.remove("drop-target", "drop-full"));
  document.querySelectorAll(".group").forEach((group) => group.classList.remove("group-drop-target"));
  clearDropIndicator();
}

function bindExternalShortcutDrop() {
  const onDragEnter = (event) => {
    if (!isExternalFileDrag(event)) return;
    externalDragDepth += 1;
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
    externalDragDepth = Math.max(0, externalDragDepth - 1);
    if (externalDragDepth > 0) return;
    clearAllDropTargets();
  };

  const onDrop = async (event) => {
    if (!isExternalFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    externalDragDepth = 0;
    clearAllDropTargets();

    const targetGroupId = event.target.closest(".group-grid")?.dataset.groupId || DEFAULT_GROUP_ID;
    const dropGrid = event.target.closest(".group-grid");
    const dropIndex = dropGrid ? getDropIndex(dropGrid, event) : undefined;
    await importDroppedShortcuts(event, targetGroupId, dropIndex);
  };

  window.addEventListener("dragenter", onDragEnter, true);
  window.addEventListener("dragover", onDragOver, true);
  window.addEventListener("dragleave", onDragLeave, true);
  window.addEventListener("drop", (event) => void onDrop(event), true);
}

function isExternalFileDrag(event) {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
}

function hasDroppedShortcutFiles(event) {
  return Array.from(event.dataTransfer?.files || []).some((file) => String(file?.path || "").toLowerCase().endsWith(".lnk"));
}

function moveItem(fromGroupId, toGroupId, itemId, dropIndex, shouldRender = true) {
  const fromGroup = findGroup(fromGroupId);
  const toGroup = findGroup(toGroupId);
  if (!fromGroup || !toGroup) return { ok: false, reason: "missing-group" };

  const fromIndex = fromGroup.items.findIndex((item) => item.id === itemId);
  if (fromIndex < 0) return { ok: false, reason: "missing-item" };

  const [moved] = fromGroup.items.splice(fromIndex, 1);
  let safeIndex = clampNumber(dropIndex, 0, toGroup.items.length, toGroup.items.length);
  if (fromGroupId === toGroupId && fromIndex < safeIndex) safeIndex -= 1;
  toGroup.items.splice(safeIndex, 0, moved);

  if (!fromGroup.items.length && fromGroup.id !== DEFAULT_GROUP_ID) {
    state.groups = state.groups.filter((group) => group.id !== fromGroup.id);
  }

  saveState();
  if (shouldRender) render();
  return { ok: true };
}

function updateDropIndicator(grid, event) {
  if (!dragData || isExternalFileDrag(event)) return;
  const tiles = Array.from(grid.querySelectorAll(".tile"));
  const group = findGroup(grid.dataset.groupId);
  const isCrossGroup = dragData.fromGroupId !== grid.dataset.groupId;

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
  if (dropIndicator?.element === targetTile && dropIndicator.position === (before ? "before" : "after")) return;

  clearDropIndicator();
  targetTile.classList.add(before ? "drop-before" : "drop-after");
  dropIndicator = { element: targetTile, position: before ? "before" : "after" };
}

function clearDropIndicator() {
  if (!dropIndicator?.element) return;
  dropIndicator.element.classList.remove("drop-before", "drop-after");
  dropIndicator = null;
}

function showDragToast(message) {
  if (!dragToast) return;
  dragToast.textContent = message;
  dragToast.hidden = false;
  dragToast.classList.add("is-visible");
  clearTimeout(dragToastTimer);
  dragToastTimer = setTimeout(() => {
    dragToast.classList.remove("is-visible");
    dragToast.hidden = true;
  }, 1800);
}

function removeItem(groupId, itemId) {
  const group = findGroup(groupId);
  if (!group) return;
  group.items = group.items.filter((item) => item.id !== itemId);
  if (!group.items.length && group.id !== DEFAULT_GROUP_ID) {
    state.groups = state.groups.filter((entry) => entry.id !== group.id);
  }
  ensureValidGroups();
  saveState();
  render();
}

function refreshGroupOptions(select, includeAuto = true) {
  if (!select) return;
  select.innerHTML = "";
  state.groups.forEach((group) => {
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
    const newGroupName = uniqueGroupName(inferGroupName(title, url, ""));
    const newGroup = { id: crypto.randomUUID(), name: newGroupName, items: [] };
    state.groups.push(newGroup);
    return newGroup.id;
  }
  return state.groups[0].id;
}

function openAddDialog(source = "tile") {
  hideMenus();
  addForm.reset();
  addDialogSource = source === "menu" ? "menu" : "tile";
  cancelOfficialLinkSearch("add");
  addIconBatchIndex = 0;
  addRefreshCooldownUntil = 0;
  clearTimeout(addRefreshCooldownTimer);
  refreshGroupOptions(groupSelect);
  addIconSuggestions = [];
  selectedAddIconUrl = "";
  pendingEditOriginalIconUrl = "";
  setIconSearchStatus("add", "输入描述后自动搜索");
  setLinkSearchStatus("add", shouldAutoSearchOfficialLink("add") ? "根据描述自动填充官方链接" : "当前入口不自动搜索官网，请手动填写地址或路径");
  renderIconSuggestions("add");
  addDialog.showModal();
}

function openEditDialog(groupId, itemId) {
  const item = findItem(groupId, itemId);
  if (!item) return;
  activeItemContext = { groupId, itemId };
  cancelOfficialLinkSearch("edit");
  editIconBatchIndex = 0;
  editRefreshCooldownUntil = 0;
  clearTimeout(editRefreshCooldownTimer);
  refreshGroupOptions(editGroupSelect, false);
  editTitleInput.value = item.title;
  editDescriptionInput.value = item.description || "";
  editUrlInput.value = item.url;
  editGroupSelect.value = groupId;
  editSizeSelect.value = item.size;
  editIconModeSelect.value = item.iconMode || "default";
  editCustomIconInput.value = item.customIcon || "";
  selectedEditIconUrl = item.iconMode === "custom" ? item.customIcon || "" : "";
  pendingEditOriginalIconUrl = item.shortcutIcon || `https://icons.duckduckgo.com/ip3/${safeHost(item.url)}.ico`;
  syncEditDialogFields(item.shortcutIcon);
  setLinkSearchStatus("edit", "编辑时不自动搜索官网，请按需手动修改地址");
  scheduleIconSuggestionSearch("edit", item.description || "", {
    preferUrl: selectedEditIconUrl,
    autoSelectFirst: false
  });
  editDialog.showModal();
}

function syncEditDialogFields(shortcutIcon = "") {
  const isCustom = editIconModeSelect.value === "custom";
  editCustomIconField.hidden = !isCustom;
  editCustomIconInput.toggleAttribute("required", isCustom);
  if (!isCustom) selectedEditIconUrl = "";
  editIconModeHint.textContent = shortcutIcon
    ? "默认会优先保留该快捷方式原有图标。"
    : "默认会优先使用更清晰的网页站点图标。";
  renderIconSuggestions("edit");
}

async function openSettings() {
  hideMenus();
  iconSizeInput.value = String(state.layout.iconSize);
  gapInput.value = String(state.layout.gap);
  showAddTileInput.checked = !!state.layout.showAddTile;
  showGroupTitleInput.checked = !!state.layout.showGroupTitle;
  layoutDirectionInput.value = state.layout.flowDirection === "rtl" ? "rtl" : "ltr";
  trackCountInput.value = String(state.layout.trackCount);
  updateTrackCountHint();
  snapEdgeInput.checked = !!state.app.snapToEdge;
  if (launchAtLoginInput) {
    try {
      launchAtLoginInput.checked = Boolean(await window.desktopPanel?.getLaunchAtLogin?.());
    } catch {
      launchAtLoginInput.checked = false;
    }
  }
  settingsDialog.showModal();
}

function hideMenus() {
  appContextMenu.hidden = true;
  itemContextMenu.hidden = true;
}

function openMenu(menu, x, y) {
  menu.hidden = false;
  const maxX = window.innerWidth - menu.offsetWidth - 8;
  const maxY = window.innerHeight - menu.offsetHeight - 8;
  menu.style.left = `${Math.max(6, Math.min(x, maxX))}px`;
  menu.style.top = `${Math.max(6, Math.min(y, maxY))}px`;
}

function applyLayout() {
  const iconSize = clampNumber(state.layout.iconSize, 42, 76, 58);
  const gap = clampNumber(state.layout.gap, 8, 24, 14);
  const trackCount = clampNumber(state.layout.trackCount, TRACK_COUNT_MIN, TRACK_COUNT_MAX, 3);
  const tileBase = Math.max(84, iconSize + 28);
  document.documentElement.style.setProperty("--icon-size", `${iconSize}px`);
  document.documentElement.style.setProperty("--gap", `${gap}px`);
  document.documentElement.style.setProperty("--tile-base-size", `${tileBase}px`);
  document.documentElement.style.setProperty("--track-count", String(trackCount));
  appShell.dataset.flow = state.layout.flowDirection === "rtl" ? "rtl" : "ltr";
  updateTrackCountHint();
}

function updateTrackCountHint() {
  if (!trackCountHint) return;
  const directionText = state.layout.flowDirection === "rtl" ? "从右到左" : "从左到右";
  trackCountHint.textContent = `当前按 ${directionText} 排列，每排显示 ${clampNumber(state.layout.trackCount, TRACK_COUNT_MIN, TRACK_COUNT_MAX, 3)} 个图标`;
}

function autoGroupByContent() {
  const allItems = state.groups.flatMap((group) => group.items);
  if (!allItems.length) return;
  const grouped = new Map();
  allItems.forEach((item) => {
    const groupName = inferGroupName(item.title, item.url, item.description);
    if (!grouped.has(groupName)) grouped.set(groupName, []);
    grouped.get(groupName).push(item);
  });

  state.groups = Array.from(grouped.entries()).map(([name, items], index) => ({
    id: index === 0 ? DEFAULT_GROUP_ID : crypto.randomUUID(),
    name,
    items
  }));

  ensureValidGroups();
}

function ensureValidGroups() {
  state.groups = state.groups.filter((group) => Array.isArray(group.items));
  if (!state.groups.length) state.groups.push({ id: DEFAULT_GROUP_ID, name: "常用", items: [] });
  if (!state.groups.some((group) => group.id === DEFAULT_GROUP_ID)) {
    state.groups.unshift({ id: DEFAULT_GROUP_ID, name: "常用", items: [] });
  }
}

function findGroup(groupId) {
  return state.groups.find((group) => group.id === groupId);
}

function findItem(groupId, itemId) {
  return findGroup(groupId)?.items.find((item) => item.id === itemId) || null;
}

function findItemById(itemId) {
  for (const group of state.groups) {
    const item = group.items.find((entry) => entry.id === itemId);
    if (item) return { group, item };
  }
  return null;
}

function inferGroupName(title, url, description = "") {
  const host = safeHost(url);
  const normalized = `${title} ${description} ${host}`
    .toLowerCase()
    .replace(/\s+/g, " ");

  const mappings = [
    { name: "知识", keys: ["知乎", "知网", "百科", "维基", "wiki", "wikipedia", "docs", "文档", "教程", "课程", "题库", "stackoverflow", "csdn", "掘金"] },
    { name: "影音", keys: ["哔哩哔哩", "b站", "bilibili", "视频", "影视", "音乐", "网易云", "qq音乐", "spotify", "netflix", "youtube", "爱奇艺", "腾讯视频", "优酷", "电影", "动漫"] },
    { name: "开发", keys: ["github", "gitlab", "gitee", "npm", "代码", "开发", "api", "接口", "终端", "数据库", "docker", "postman", "vercel", "cursor", "vscode", "编程"] },
    { name: "资讯", keys: ["新闻", "资讯", "头条", "微博", "热榜", "weibo", "xiaohongshu", "小红书", "toutiao", "rss", "门户", "论坛", "社区"] },
    { name: "购物", keys: ["淘宝", "京东", "天猫", "拼多多", "购物", "商城", "下单", "amazon", "jd", "tmall", "taobao", "闲鱼"] },
    { name: "邮箱", keys: ["邮箱", "邮件", "mail", "gmail", "outlook", "qq邮箱", "163邮箱", "企业邮箱"] },
    { name: "办公", keys: ["文档", "表格", "协作", "会议", "钉钉", "飞书", "企业微信", "office", "notion", "语雀", "石墨", "日历", "网盘"] },
    { name: "AI 工具", keys: ["ai", "人工智能", "大模型", "豆包", "chatgpt", "claude", "gemini", "通义", "kimi", "copilot", "智能助手", "生成"] },
    { name: "游戏", keys: ["游戏", "steam", "epic", "xbox", "ps", "playstation", "switch", "小黑盒", "nexusmods", "game", "mod"] },
    { name: "社交", keys: ["微信", "qq", "discord", "telegram", "社交", "聊天", "消息", "即时通讯"] }
  ];

  let bestMatch = { name: "常用", score: 0 };
  mappings.forEach((mapping) => {
    const score = mapping.keys.reduce((sum, key) => {
      const normalizedKey = String(key).toLowerCase();
      if (!normalized.includes(normalizedKey)) return sum;
      return sum + (normalizedKey.length >= 3 ? 3 : 2);
    }, 0);
    if (score > bestMatch.score) bestMatch = { name: mapping.name, score };
  });

  if (bestMatch.score > 0) return bestMatch.name;
  if (!host) return "常用";
  const parts = host.split(".").filter(Boolean);
  return parts.length >= 2 ? `${parts[parts.length - 2].toUpperCase()} 组` : "常用";
}

// 修复显示文本 - (已弃用)
function repairDisplayText(value) {
  const normalized = String(value || "").trim();
  return DISPLAY_TEXT_REPAIRS[normalized] || normalized;
}

function uniqueGroupName(baseName) {
  const taken = new Set(state.groups.map((group) => group.name));
  if (!taken.has(baseName)) return baseName;
  let index = 2;
  while (taken.has(`${baseName}${index}`)) index += 1;
  return `${baseName}${index}`;
}

function openUrl(url) {
  if (!url) return;
  if (window.desktopPanel?.openUrl) {
    window.desktopPanel.openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function normalizeUrl(value) {
  if (!value) return "";
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) return value;
  if (/^[a-z]:\\/i.test(value) || value.startsWith("\\\\")) return value;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function safeHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

function makeFallbackIcon(name) {
  const text = (name || "?").trim().slice(0, 1).toUpperCase();
  const svg = `
  <svg xmlns='http://www.w3.org/2000/svg' width='128' height='128'>
    <defs>
      <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
        <stop offset='0%' stop-color='#19d3b8'/>
        <stop offset='100%' stop-color='#2f88e6'/>
      </linearGradient>
    </defs>
    <rect width='100%' height='100%' rx='26' fill='url(#g)'/>
    <text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle' font-family='Noto Sans SC, sans-serif' font-size='64' fill='white'>${escapeXml(text)}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeHtml(value) {
  return escapeXml(String(value || ""));
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
