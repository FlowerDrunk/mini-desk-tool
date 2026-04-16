const STORAGE_KEY = "desktop-panel-state-v6";
const DEFAULT_GROUP_ID = "group-default";
const NEW_AUTO_GROUP = "__new_auto_group__";
const TOP_DRAG_HEIGHT = 132;

const WINDOW_PRESETS = {
  small: { width: 360, height: 560 },
  medium: { width: 434, height: 640 },
  large: { width: 520, height: 760 }
};

const SIZE_META = {
  "1x1": { col: 1, row: 1, scale: 1 },
  "1x2": { col: 1, row: 2, scale: 1.12 },
  "2x2": { col: 2, row: 2, scale: 1.28 }
};

const defaultState = {
  layout: {
    iconSize: 58,
    gap: 14,
    showGroupTitle: true
  },
  app: {
    snapToEdge: true
  },
  groups: [
    {
      id: DEFAULT_GROUP_ID,
      name: "常用",
      items: [
        { id: crypto.randomUUID(), title: "知乎", url: "https://www.zhihu.com", size: "1x1" },
        { id: crypto.randomUUID(), title: "腾讯视频", url: "https://v.qq.com", size: "1x2" }
      ]
    }
  ]
};

const appShell = document.querySelector("#appShell");
const windowTopSensor = document.querySelector("#windowTopSensor");
const windowDragHandle = document.querySelector("#windowDragHandle");
const workspace = document.querySelector("#workspace");
const groupsContainer = document.querySelector("#groups");
const itemTemplate = document.querySelector("#itemTemplate");

const addDialog = document.querySelector("#addDialog");
const addForm = document.querySelector("#addForm");
const groupSelect = document.querySelector("#groupSelect");
const cancelAddDialog = document.querySelector("#cancelAddDialog");

const settingsDialog = document.querySelector("#settingsDialog");
const iconSizeInput = document.querySelector("#iconSizeInput");
const gapInput = document.querySelector("#gapInput");
const showGroupTitleInput = document.querySelector("#showGroupTitleInput");
const snapEdgeInput = document.querySelector("#snapEdgeInput");
const autoGroupButton = document.querySelector("#autoGroupButton");
const minWindowButton = document.querySelector("#minWindow");
const closeWindowButton = document.querySelector("#closeWindow");
const cancelSettingsDialog = document.querySelector("#cancelSettingsDialog");

const appContextMenu = document.querySelector("#appContextMenu");
const itemContextMenu = document.querySelector("#itemContextMenu");

let state = loadState();
let dragData = null;
let activeItemContext = null;
let windowDragActive = false;
let dragLayerVisible = false;
let externalDragDepth = 0;

applyLayout();
applyTopDragMetrics();
window.desktopPanel?.setSnapEnabled?.(state.app.snapToEdge);
render();
bindEvents();
bindTopDragHandle();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return migrateFromLegacyArray(parsed);

    const layout = {
      iconSize: clampNumber(parsed.layout?.iconSize, 42, 76, 58),
      gap: clampNumber(parsed.layout?.gap, 8, 24, 14),
      showGroupTitle: parsed.layout?.showGroupTitle !== false
    };

    const appConfig = {
      snapToEdge: parsed.app?.snapToEdge !== false
    };

    const groups = Array.isArray(parsed.groups)
      ? parsed.groups
          .map((group) => ({
            id: group.id || crypto.randomUUID(),
            name: group.name || "未命名组",
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
  const size = SIZE_META[item.size] ? item.size : "1x1";
  return {
    id: item.id || crypto.randomUUID(),
    title: item.title,
    url: normalizeUrl(item.url),
    size
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function bindEvents() {
  cancelAddDialog.addEventListener("click", () => addDialog.close());
  cancelSettingsDialog.addEventListener("click", () => settingsDialog.close());

  addForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const formData = new FormData(addForm);
    const title = String(formData.get("title") || "").trim();
    const url = normalizeUrl(String(formData.get("url") || "").trim());
    const groupId = String(formData.get("groupId") || "");

    if (!title || !url) return;

    const actualGroupId = ensureGroupBySelection(groupId, title, url);
    const targetGroup = findGroup(actualGroupId) || state.groups[0];

    targetGroup.items.push({
      id: crypto.randomUUID(),
      title,
      url,
      size: "1x1"
    });

    saveState();
    render();
    addDialog.close();
  });

  workspace.addEventListener("contextmenu", (event) => {
    event.preventDefault();

    const tile = event.target.closest(".tile");
    if (tile) {
      hideMenus();
      activeItemContext = {
        groupId: tile.dataset.groupId,
        itemId: tile.dataset.itemId
      };
      openMenu(itemContextMenu, event.clientX, event.clientY);
      return;
    }

    hideMenus();
    openMenu(appContextMenu, event.clientX, event.clientY);
  });

  workspace.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    if (event.target.closest(".tile") || event.target.closest(".add-tile")) return;
    if (event.target.closest(".context-menu")) return;
    hideMenus();
  });

  workspace.addEventListener("dblclick", (event) => {
    if (event.target.closest(".tile") || event.target.closest(".add-tile")) return;
    openSettings();
  });

  bindExternalShortcutDrop();

  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (event.target.closest(".context-menu")) return;
    hideMenus();
  }, true);

  window.addEventListener("blur", () => hideMenus());

  appContextMenu.addEventListener("click", (event) => {
    const action = event.target.dataset.action;
    if (!action) return;

    hideMenus();

    if (action === "open-settings") openSettings();
    if (action === "add-icon") openAddDialog();
    if (action === "toggle-snap") {
      state.app.snapToEdge = !state.app.snapToEdge;
      window.desktopPanel?.setSnapEnabled?.(state.app.snapToEdge);
      saveState();
    }

    if (action === "window-small") window.desktopPanel?.setWindowSize?.(WINDOW_PRESETS.small.width, WINDOW_PRESETS.small.height);
    if (action === "window-medium") window.desktopPanel?.setWindowSize?.(WINDOW_PRESETS.medium.width, WINDOW_PRESETS.medium.height);
    if (action === "window-large") window.desktopPanel?.setWindowSize?.(WINDOW_PRESETS.large.width, WINDOW_PRESETS.large.height);
  });

  itemContextMenu.addEventListener("click", (event) => {
    const action = event.target.dataset.action;
    if (!action || !activeItemContext) return;

    const context = activeItemContext;
    hideMenus();

    const item = findItem(context.groupId, context.itemId);
    if (!item) return;

    if (action.startsWith("size-")) {
      const next = action.replace("size-", "");
      if (SIZE_META[next]) {
        item.size = next;
      }
    }

    if (action === "delete-item") {
      removeItem(context.groupId, context.itemId);
      return;
    }

    saveState();
    render();
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
  });

  showGroupTitleInput.addEventListener("change", () => {
    state.layout.showGroupTitle = showGroupTitleInput.checked;
    saveState();
    render();
  });

  snapEdgeInput.addEventListener("change", () => {
    state.app.snapToEdge = snapEdgeInput.checked;
    window.desktopPanel?.setSnapEnabled?.(state.app.snapToEdge);
    saveState();
  });

  autoGroupButton.addEventListener("click", () => {
    autoGroupByContent();
    saveState();
    render();
  });

  minWindowButton.addEventListener("click", () => window.desktopPanel?.minimizeWindow?.());
  closeWindowButton.addEventListener("click", () => window.desktopPanel?.closeWindow?.());
}

function bindTopDragHandle() {
  const finishWindowDrag = async () => {
    if (!windowDragActive) return;
    windowDragActive = false;
    await window.desktopPanel?.snapAfterDrag?.();
  };

  const beginWindowDrag = (event) => {
    if (event?.button !== undefined && event.button !== 0) return;
    if (event?.clientY !== undefined && (event.clientY < 0 || event.clientY > TOP_DRAG_HEIGHT)) return;
    if (!dragLayerVisible) return;
    windowDragActive = true;
  };

  const showDragLayer = () => {
    dragLayerVisible = true;
    appShell.classList.add("is-drag-ready");
  };

  const hideDragLayer = () => {
    if (windowDragActive) return;
    dragLayerVisible = false;
    appShell.classList.remove("is-drag-ready");
  };

  windowTopSensor.addEventListener("mouseenter", showDragLayer);
  windowDragHandle.addEventListener("mouseenter", showDragLayer);

  appShell.addEventListener("mouseleave", () => {
    hideDragLayer();
  });

  window.addEventListener("blur", () => {
    void finishWindowDrag();
    dragLayerVisible = false;
    appShell.classList.remove("is-drag-ready");
  });

  appShell.addEventListener("pointerdown", beginWindowDrag);
  window.addEventListener("pointerup", () => void finishWindowDrag());
}

function render() {
  ensureValidGroups();
  groupsContainer.innerHTML = "";

  state.groups.forEach((group, groupIndex) => {
    const section = document.createElement("section");
    section.className = "group";

    if (state.layout.showGroupTitle) {
      const title = document.createElement("h3");
      title.className = "group-title";
      title.textContent = group.name;
      section.appendChild(title);
    }

    const grid = document.createElement("div");
    grid.className = "group-grid";
    grid.dataset.groupId = group.id;
    bindGridDropEvents(grid, group.id);

    group.items.forEach((item, index) => {
      const node = createItemNode(item, group.id, index);
      grid.appendChild(node);
    });

    if (groupIndex === state.groups.length - 1) {
      grid.appendChild(createAddTile());
    }

    section.appendChild(grid);
    groupsContainer.appendChild(section);
  });

  refreshGroupOptions();
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

  const host = safeHost(item.url);
  const favicon = host ? `https://www.google.com/s2/favicons?domain=${host}&sz=128` : "";
  icon.src = favicon || makeFallbackIcon(item.title);
  icon.addEventListener("error", () => {
    icon.src = makeFallbackIcon(item.title);
  }, { once: true });

  node.addEventListener("click", (event) => {
    if (event.target === deleteButton) return;
    openUrl(item.url);
  });

  deleteButton.addEventListener("click", (event) => {
    event.stopPropagation();
    removeItem(groupId, item.id);
  });

  node.addEventListener("dragstart", () => {
    dragData = { itemId: item.id, fromGroupId: groupId };
    node.classList.add("dragging");
  });

  node.addEventListener("dragend", () => {
    dragData = null;
    node.classList.remove("dragging");
    document.querySelectorAll(".group-grid").forEach((el) => el.classList.remove("drop-target"));
  });

  return node;
}

function createAddTile() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "add-tile no-drag";
  button.innerHTML = "<span class='add-circle'>+</span><p class='label'>添加图标</p>";
  button.addEventListener("click", () => openAddDialog());
  return button;
}

function bindGridDropEvents(grid, toGroupId) {
  grid.addEventListener("dragover", (event) => {
    if (!dragData && !isExternalFileDrag(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    grid.classList.add("drop-target");
  });

  grid.addEventListener("dragleave", () => grid.classList.remove("drop-target"));

  grid.addEventListener("drop", async (event) => {
    event.preventDefault();
    grid.classList.remove("drop-target");

    if (hasDroppedShortcutFiles(event)) {
      event.stopPropagation();
      await importDroppedShortcuts(event, toGroupId, getDropIndex(grid, event));
      return;
    }

    if (!dragData) return;

    const dropTile = event.target.closest(".tile");
    const toGroup = findGroup(toGroupId);
    if (!toGroup) return;

    const dropIndex = dropTile ? Number(dropTile.dataset.index) : toGroup.items.length;
    moveItem(dragData.fromGroupId, toGroupId, dragData.itemId, dropIndex);
  });
}

function getDropIndex(grid, event) {
  const dropTile = event.target.closest(".tile");
  if (dropTile?.dataset.index) return Number(dropTile.dataset.index);
  return findGroup(grid.dataset.groupId)?.items.length ?? 0;
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

  addResolvedShortcutsToGroup(targetGroupId, shortcuts, dropIndex);
  externalDragDepth = 0;
  clearAllDropTargets();
}

function addResolvedShortcutsToGroup(targetGroupId, shortcuts, dropIndex) {
  const group = findGroup(targetGroupId) || findGroup(DEFAULT_GROUP_ID) || state.groups[0];
  if (!group) return;

  const normalizedShortcuts = shortcuts
    .filter((shortcut) => shortcut && typeof shortcut.title === "string" && typeof shortcut.url === "string")
    .map((shortcut) => ({
      id: crypto.randomUUID(),
      title: shortcut.title.trim() || "快捷方式",
      url: normalizeUrl(shortcut.url),
      size: "1x1"
    }))
    .filter((shortcut) => shortcut.url);

  if (!normalizedShortcuts.length) return;

  const insertAt = Number.isInteger(dropIndex)
    ? clampNumber(dropIndex, 0, group.items.length, group.items.length)
    : group.items.length;

  group.items.splice(insertAt, 0, ...normalizedShortcuts);
  saveState();
  render();
}

function clearAllDropTargets() {
  document.querySelectorAll(".group-grid").forEach((el) => el.classList.remove("drop-target"));
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
  const types = Array.from(event.dataTransfer?.types || []);
  return types.includes("Files");
}

function hasDroppedShortcutFiles(event) {
  const files = Array.from(event.dataTransfer?.files || []);
  return files.some((file) => String(file?.path || "").toLowerCase().endsWith(".lnk"));
}

function moveItem(fromGroupId, toGroupId, itemId, dropIndex) {
  const fromGroup = findGroup(fromGroupId);
  const toGroup = findGroup(toGroupId);
  if (!fromGroup || !toGroup) return;

  const fromIndex = fromGroup.items.findIndex((item) => item.id === itemId);
  if (fromIndex < 0) return;

  const [moved] = fromGroup.items.splice(fromIndex, 1);
  const safeIndex = clampNumber(dropIndex, 0, toGroup.items.length, toGroup.items.length);
  toGroup.items.splice(safeIndex, 0, moved);

  if (!fromGroup.items.length && fromGroup.id !== DEFAULT_GROUP_ID) {
    state.groups = state.groups.filter((group) => group.id !== fromGroup.id);
  }

  saveState();
  render();
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

function refreshGroupOptions() {
  groupSelect.innerHTML = "";

  state.groups.forEach((group) => {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = group.name;
    groupSelect.appendChild(option);
  });

  const autoOption = document.createElement("option");
  autoOption.value = NEW_AUTO_GROUP;
  autoOption.textContent = "新建自动分组";
  groupSelect.appendChild(autoOption);
}

function ensureGroupBySelection(selectedGroupId, title, url) {
  if (selectedGroupId && selectedGroupId !== NEW_AUTO_GROUP) return selectedGroupId;
  if (selectedGroupId === NEW_AUTO_GROUP) {
    const newGroupName = uniqueGroupName(inferGroupName(title, url));
    const newGroup = { id: crypto.randomUUID(), name: newGroupName, items: [] };
    state.groups.push(newGroup);
    return newGroup.id;
  }

  return state.groups[0].id;
}

function openAddDialog() {
  hideMenus();
  addForm.reset();
  refreshGroupOptions();
  addDialog.showModal();
}

function openSettings() {
  hideMenus();
  iconSizeInput.value = String(state.layout.iconSize);
  gapInput.value = String(state.layout.gap);
  showGroupTitleInput.checked = !!state.layout.showGroupTitle;
  snapEdgeInput.checked = !!state.app.snapToEdge;
  settingsDialog.showModal();
}

function hideMenus() {
  appContextMenu.hidden = true;
  itemContextMenu.hidden = true;
  activeItemContext = null;
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
  const tileBase = Math.max(84, iconSize + 28);

  document.documentElement.style.setProperty("--icon-size", `${iconSize}px`);
  document.documentElement.style.setProperty("--gap", `${gap}px`);
  document.documentElement.style.setProperty("--tile-base-size", `${tileBase}px`);
}

function applyTopDragMetrics() {
  document.documentElement.style.setProperty("--top-drag-height", `${TOP_DRAG_HEIGHT}px`);
  document.documentElement.style.setProperty("--workspace-top-padding", "18px");
  document.documentElement.style.setProperty("--workspace-top-padding-expanded", `${TOP_DRAG_HEIGHT + 12}px`);
}

function autoGroupByContent() {
  const allItems = state.groups.flatMap((group) => group.items);
  if (!allItems.length) return;

  const grouped = new Map();
  allItems.forEach((item) => {
    const groupName = inferGroupName(item.title, item.url);
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
  if (!state.groups.length) {
    state.groups.push({ id: DEFAULT_GROUP_ID, name: "常用", items: [] });
  }

  const hasDefault = state.groups.some((group) => group.id === DEFAULT_GROUP_ID);
  if (!hasDefault) {
    state.groups.unshift({ id: DEFAULT_GROUP_ID, name: "常用", items: [] });
  }
}

function findGroup(groupId) {
  return state.groups.find((group) => group.id === groupId);
}

function findItem(groupId, itemId) {
  const group = findGroup(groupId);
  if (!group) return null;
  return group.items.find((item) => item.id === itemId) || null;
}

function inferGroupName(title, url) {
  const normalized = `${title} ${safeHost(url)}`.toLowerCase();
  const mappings = [
    { keys: ["zhihu", "wiki", "docs", "stackoverflow"], name: "知识" },
    { keys: ["bilibili", "v.qq", "iqiyi", "youku", "youtube", "netflix"], name: "影音" },
    { keys: ["github", "gitlab", "gitee", "npm"], name: "开发" },
    { keys: ["weibo", "xiaohongshu", "news", "toutiao"], name: "资讯" },
    { keys: ["taobao", "jd", "tmall", "amazon", "pinduoduo"], name: "购物" },
    { keys: ["mail", "gmail", "outlook", "qq.com"], name: "邮箱" }
  ];

  for (const mapping of mappings) {
    if (mapping.keys.some((key) => normalized.includes(key))) {
      return mapping.name;
    }
  }

  const host = safeHost(url);
  if (!host) return "常用";
  const parts = host.split(".").filter(Boolean);
  if (parts.length >= 2) return `${parts[parts.length - 2].toUpperCase()} 组`;
  return "常用";
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

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
