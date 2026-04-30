import {
  clampNumber,
  DEFAULT_GAP,
  ensureValidGroups,
  escapeHtml,
  getFontConfig,
  getThemeConfig,
  SEARCH_ENGINES,
  makeFallbackIcon,
  safeHost,
  SIZE_META,
  TRACK_COUNT_MAX,
  TRACK_COUNT_MIN,
  WINDOW_WIDTH_MAX,
  WINDOW_WIDTH_MIN
} from "./model.js";

const ISSUE_CENTER_AUTO_HIDE_MS = 5000;

export function registerRenderFeature(app) {
  app.applyLayout = applyLayout;
  app.updateTrackCountHint = updateTrackCountHint;
  app.render = render;
  app.beginRenameGroup = beginRenameGroup;
  app.finishRenameGroup = finishRenameGroup;
  app.createItemNode = createItemNode;
  app.setItemIcon = setItemIcon;
  app.createAddTile = createAddTile;
  app.showDragToast = showDragToast;
  app.reportIssue = reportIssue;
  app.clearIssues = clearIssues;
  app.setSearchQuery = setSearchQuery;
  app.toggleGroupCollapsed = toggleGroupCollapsed;
  app.toggleItemSelection = toggleItemSelection;
  app.selectCurrentGroupItems = selectCurrentGroupItems;
  app.selectAllItems = selectAllItems;
  app.clearSelection = clearSelection;
  app.moveSelectedItems = moveSelectedItems;
  app.resizeSelectedItems = resizeSelectedItems;
  app.refreshSelectedIcons = refreshSelectedIcons;
  app.deleteSelectedItems = deleteSelectedItems;
  app.removeRecentItem = removeRecentItem;

  function applyLayout() {
    const iconSize = clampNumber(app.store.state.layout.iconSize, 42, 76, 58);
    const trackCount = clampNumber(app.store.state.layout.trackCount, TRACK_COUNT_MIN, TRACK_COUNT_MAX, 3);
    const tileBase = Math.max(84, iconSize + 28);

    document.documentElement.style.setProperty("--icon-size", `${iconSize}px`);
    document.documentElement.style.setProperty("--gap", `${DEFAULT_GAP}px`);
    document.documentElement.style.setProperty("--tile-base-size", `${tileBase}px`);
    document.documentElement.style.setProperty("--track-count", String(trackCount));
    const theme = getThemeConfig(app.store.state.layout);
    const font = getFontConfig(app.store.state.layout);
    const opacity = clampNumber(app.store.state.layout.panelOpacity, 58, 96, 78) / 100;
    const normalizedOpacity = (opacity - 0.58) / (0.96 - 0.58);
    document.documentElement.style.setProperty("--panel-alpha", String(opacity));
    document.documentElement.style.setProperty("--panel-alpha-soft", String(Math.max(0.2, opacity * 0.62)));
    document.documentElement.style.setProperty("--panel-alpha-strong", String(Math.min(0.98, opacity + 0.08)));
    document.documentElement.style.setProperty("--panel-bg-glow", String(0.04 + normalizedOpacity * 0.18));
    document.documentElement.style.setProperty("--panel-bg-wash", String(0.02 + normalizedOpacity * 0.16));
    document.documentElement.style.setProperty("--tile-alpha", String(0.08 + normalizedOpacity * 0.16));
    document.documentElement.style.setProperty("--theme-accent", theme.accent);
    document.documentElement.style.setProperty("--theme-accent-2", theme.accent2);
    document.documentElement.style.setProperty("--theme-accent-rgb", theme.accentRgb);
    document.documentElement.style.setProperty("--theme-accent-2-rgb", theme.accent2Rgb);
    document.documentElement.style.setProperty("--theme-surface-rgb", theme.surface);
    document.documentElement.style.setProperty("--app-font-family", font.value);
    document.documentElement.style.setProperty("--text-color", app.store.state.layout.textColor || "#ffffff");
    app.refs.appShell.dataset.flow = app.store.state.layout.flowDirection === "rtl" ? "rtl" : "ltr";
    app.refs.appShell.dataset.showLabels = app.store.state.layout.showItemLabel === false ? "false" : "true";
    app.refs.appShell.dataset.theme = app.store.state.layout.theme || "aurora";
    app.refs.appShell.dataset.reduceMotion = app.store.state.layout.reduceMotion ? "true" : "false";
    app.refs.appShell.dataset.highContrastFocus = app.store.state.layout.highContrastFocus ? "true" : "false";
    app.syncDrawerHandle?.();
    updateTrackCountHint();
  }

  function updateTrackCountHint() {
    if (!app.refs.trackCountHint) return;
    const directionText = app.store.state.layout.flowDirection === "rtl" ? "从右到左" : "从左到右";
    app.refs.trackCountHint.textContent = `当前按 ${directionText} 排列，每排显示 ${clampNumber(
      app.store.state.layout.trackCount,
      TRACK_COUNT_MIN,
      TRACK_COUNT_MAX,
      3
    )} 个图标`;
  }

  function render() {
    ensureValidGroups(app.store);
    pruneSelection();
    if (!app.store.state.layout.showSearch) app.runtime.searchQuery = "";
    app.refs.groupsContainer.innerHTML = "";
    app.clearDropIndicator();
    app.refs.appShell.dataset.selectionMode = app.runtime.selectionMode ? "true" : "false";
    syncSearchControls();
    syncBatchToolbar();

    const query = normalizeSearchText(app.runtime.searchQuery);
    const isSearching = Boolean(query);
    const visibleGroups = buildVisibleGroups(query);
    const recentItems = isSearching || app.store.state.layout.showRecent === false ? [] : getRecentItems();

    if (recentItems.length) {
      app.refs.groupsContainer.appendChild(createRecentSection(recentItems));
    }

    if (!visibleGroups.length) {
      app.refs.groupsContainer.appendChild(createEmptyState(isSearching));
    }

    visibleGroups.forEach(({ group, items }, groupIndex) => {
      const section = document.createElement("section");
      section.className = "group";
      section.dataset.groupId = group.id;

      if (app.store.state.layout.showGroupTitle) {
        section.appendChild(createGroupTitleNode(group, { isSearching, itemCount: items.length }));
      }

      const isCollapsed = !isSearching && isGroupCollapsed(group.id);
      const grid = document.createElement("div");
      grid.className = "group-grid";
      grid.dataset.groupId = group.id;
      grid.dataset.flow = app.store.state.layout.flowDirection;
      if (isCollapsed) {
        grid.hidden = true;
        section.classList.add("is-collapsed");
      } else {
        app.bindGridDropEvents(grid, section, group.id);

        items.forEach((item) => {
          const sourceIndex = group.items.findIndex((entry) => entry.id === item.id);
          grid.appendChild(createItemNode(item, group.id, sourceIndex));
        });

        if (!isSearching && app.store.state.layout.showAddTile && groupIndex === visibleGroups.length - 1) {
          grid.appendChild(createAddTile());
        }
      }

      section.appendChild(grid);
      app.refs.groupsContainer.appendChild(section);
    });

    app.refreshGroupOptions(app.refs.groupSelect);
    app.refreshGroupOptions(app.refs.editGroupSelect, false);
    app.refreshGroupOptions(app.refs.organizeGroupSelect, false);
  }

  function createGroupTitleNode(group, { isSearching = false, itemCount = group.items.length } = {}) {
    if (app.runtime.editingGroupId === group.id) {
      const input = document.createElement("input");
      input.className = "group-title-input";
      input.value = group.name;
      input.maxLength = 24;
      input.addEventListener("blur", () => finishRenameGroup(group.id, input.value));
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") finishRenameGroup(group.id, input.value);
        if (event.key === "Escape") {
          app.runtime.editingGroupId = null;
          render();
        }
      });
      queueMicrotask(() => input.focus());
      queueMicrotask(() => input.select());
      return input;
    }

    const title = document.createElement("div");
    title.className = "group-title";
    title.dataset.groupId = group.id;
    title.addEventListener("pointerdown", (event) => {
      if (isSearching || event.target.closest("button")) return;
      app.startGroupPointerDrag?.(event, group.id, title);
    });

    const name = document.createElement("span");
    name.className = "group-title-name";
    name.textContent = group.name;
    title.appendChild(name);

    const meta = document.createElement("span");
    meta.className = "group-title-meta";
    meta.textContent = isSearching ? `${itemCount}/${group.items.length}` : String(group.items.length);
    title.appendChild(meta);

    if (!isSearching) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "group-collapse-toggle no-drag";
      toggle.dataset.groupId = group.id;
      toggle.setAttribute("aria-label", isGroupCollapsed(group.id) ? "展开分组" : "折叠分组");
      toggle.textContent = isGroupCollapsed(group.id) ? "+" : "-";
      toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleGroupCollapsed(group.id);
      });
      title.appendChild(toggle);
    }

    return title;
  }

  function beginRenameGroup(groupId) {
    app.runtime.editingGroupId = groupId;
    render();
  }

  function finishRenameGroup(groupId, value) {
    const group = app.findGroup(groupId);
    app.runtime.editingGroupId = null;
    if (group && value.trim()) group.name = value.trim();
    app.saveState();
    render();
  }

  function createItemNode(item, groupId, index, { enableDrag = true, recentOnly = false, displaySize = null } = {}) {
    const node = app.refs.itemTemplate.content.firstElementChild.cloneNode(true);
    const sizeKey = SIZE_META[displaySize] ? displaySize : item.size;
    node.draggable = false;
    node.dataset.itemId = item.id;
    node.dataset.groupId = groupId;
    node.dataset.index = String(index);
    node.dataset.size = SIZE_META[sizeKey] ? sizeKey : "1x1";
    node.dataset.recentOnly = recentOnly ? "true" : "false";
    node.tabIndex = 0;
    node.setAttribute("role", "button");
    node.setAttribute("aria-label", recentOnly ? `最近打开：${item.title}` : `打开 ${item.title}`);
    node.classList.toggle("is-selected", app.runtime.selectedItemIds.has(item.id));
    node.classList.toggle("is-selection-mode", app.runtime.selectionMode && !recentOnly);

    const iconWrap = node.querySelector(".icon-wrap");
    const label = node.querySelector(".label");
    const deleteButton = node.querySelector(".delete");
    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "select-toggle no-drag";
    selectButton.setAttribute("aria-label", app.runtime.selectedItemIds.has(item.id) ? "取消选择" : "选择项目");
    selectButton.textContent = app.runtime.selectedItemIds.has(item.id) ? "✓" : "";
    node.insertBefore(selectButton, node.firstChild);
    const meta = SIZE_META[sizeKey] || SIZE_META["1x1"];
    const iconSize = Math.round(app.store.state.layout.iconSize);
    const tileBase = Math.max(84, iconSize + 28);
    const frameWidth =
      meta.colSpan === 1
        ? Math.round(iconSize * meta.widthScale)
        : tileBase * meta.colSpan + DEFAULT_GAP * (meta.colSpan - 1) - meta.frameInsetX;
    const frameHeight =
      meta.rowSpan === 1
        ? Math.round(iconSize * meta.heightScale)
        : tileBase * meta.rowSpan + DEFAULT_GAP * (meta.rowSpan - 1) - meta.frameInsetY;

    node.style.setProperty("--item-col-span", String(meta.colSpan));
    node.style.setProperty("--item-row-span", String(meta.rowSpan));
    node.style.setProperty("--item-icon-size", `${iconSize}px`);
    node.style.setProperty("--item-frame-width", `${frameWidth}px`);
    node.style.setProperty("--item-frame-height", `${frameHeight}px`);
    node.style.setProperty("--item-icon-pad-x", `${meta.iconPadX}px`);
    node.style.setProperty("--item-icon-pad-y", `${meta.iconPadY}px`);
    node.style.setProperty("--item-wrap-radius", `${meta.wrapRadius}px`);
    node.style.setProperty("--item-icon-radius", `${meta.iconRadius}px`);

    label.textContent = item.title;
    iconWrap?.setAttribute("role", "img");
    iconWrap?.setAttribute("aria-label", `${item.title} 图标`);
    setItemIcon(iconWrap, item);

    node.addEventListener("click", (event) => {
      if (app.runtime.preventNextClickItemId === item.id) {
        event.preventDefault();
        event.stopPropagation();
        app.runtime.preventNextClickItemId = null;
        return;
      }
      if (event.target === deleteButton) return;
      if (app.runtime.selectionMode && !recentOnly) {
        event.preventDefault();
        toggleItemSelection(item.id);
        return;
      }
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        app.runtime.selectionMode = true;
        toggleItemSelection(item.id);
        return;
      }
      app.openItem(item.id, item.url);
    });

    selectButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      app.runtime.selectionMode = true;
      toggleItemSelection(item.id);
    });

    node.addEventListener("keydown", (event) => {
      handleItemKeydown(event, { item, groupId, itemId: item.id, recentOnly });
    });

    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      if (recentOnly) {
        removeRecentItem(item.id);
        return;
      }
      app.removeItem(groupId, item.id);
    });

    if (enableDrag) {
      node.addEventListener("pointerdown", (event) => {
        if (event.target === deleteButton || event.target === selectButton) return;
        app.startPointerDrag(event, item.id, groupId, node, {
          onLongPress: recentOnly ? null : () => enterSelectionMode(item.id)
        });
      });
    }

    if (iconWrap) iconWrap.style.pointerEvents = "none";
    if (label) label.style.pointerEvents = "none";
    return node;
  }

  function handleItemKeydown(event, { item, groupId, itemId, recentOnly }) {
    const navigationKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
    if (navigationKeys.includes(event.key)) {
      event.preventDefault();
      focusTileFromKey(event.currentTarget, event.key);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (app.runtime.selectionMode && !recentOnly) {
        toggleItemSelection(itemId);
        return;
      }
      app.openItem(itemId, item.url);
      return;
    }

    if (event.key !== "Delete" && event.key !== "Backspace") return;

    event.preventDefault();
    const confirmed = window.confirm?.(`确定删除“${item.title}”吗？`);
    if (!confirmed) return;

    if (recentOnly) {
      removeRecentItem(itemId);
      return;
    }
    app.removeItem(groupId, itemId);
  }

  function focusTileFromKey(currentNode, key) {
    const tiles = Array.from(app.refs.groupsContainer.querySelectorAll(".tile:not([hidden])")).filter(
      (node) => node instanceof HTMLElement && node.offsetParent !== null
    );
    if (!tiles.length) return;

    const currentIndex = tiles.indexOf(currentNode);
    if (key === "Home") {
      tiles[0]?.focus();
      return;
    }
    if (key === "End") {
      tiles[tiles.length - 1]?.focus();
      return;
    }
    if (currentIndex < 0) return;

    if (key === "ArrowLeft" || key === "ArrowRight") {
      const direction = key === "ArrowLeft" ? -1 : 1;
      const nextIndex = clampNumber(currentIndex + direction, 0, tiles.length - 1, currentIndex);
      tiles[nextIndex]?.focus();
      return;
    }

    const currentRect = currentNode.getBoundingClientRect();
    const currentCenterX = currentRect.left + currentRect.width / 2;
    const currentCenterY = currentRect.top + currentRect.height / 2;
    const goingDown = key === "ArrowDown";
    const candidates = tiles
      .filter((tile) => tile !== currentNode)
      .map((tile) => {
        const rect = tile.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        return {
          tile,
          dy: centerY - currentCenterY,
          score: Math.abs(centerX - currentCenterX) + Math.abs(centerY - currentCenterY) * 0.2
        };
      })
      .filter((entry) => (goingDown ? entry.dy > 6 : entry.dy < -6))
      .sort((a, b) => a.score - b.score);

    candidates[0]?.tile.focus();
  }

  function setItemIcon(iconWrap, item) {
    const sources = [];
    if (item.iconMode === "custom" && item.customIcon) sources.push(item.customIcon);
    if (item.shortcutIcon) sources.push(item.shortcutIcon);

    const host = safeHost(item.url);
    if (host) {
      sources.push(`https://icons.duckduckgo.com/ip3/${host}.ico`);
      sources.push(`https://www.google.com/s2/favicons?domain=${host}&sz=128`);
    }

    sources.push(makeFallbackIcon(item.title));
    iconWrap?.style.setProperty("--item-icon-image", "none");

    const applyBackground = (source) => {
      iconWrap?.style.setProperty("--item-icon-image", `url(${JSON.stringify(source)})`);
    };

    const trySource = (index) => {
      if (index >= sources.length) return;

      const source = sources[index];
      const probe = new Image();
      probe.referrerPolicy = "no-referrer";
      probe.onload = () => applyBackground(source);
      probe.onerror = () => trySource(index + 1);
      probe.src = source;
    };

    trySource(0);
  }

  function createAddTile() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "add-tile no-drag";
    button.innerHTML = "<span class='add-circle'>+</span><p class='label'>添加图标</p>";
    button.addEventListener("click", () => {
      app.openAddDialog("tile");
    });
    return button;
  }

  function showDragToast(message) {
    if (!app.refs.dragToast) return;
    app.refs.dragToast.textContent = message;
    app.refs.dragToast.hidden = false;
    app.refs.dragToast.classList.add("is-visible");
    clearTimeout(app.runtime.dragToastTimer);
    app.runtime.dragToastTimer = setTimeout(() => {
      app.refs.dragToast.classList.remove("is-visible");
      app.refs.dragToast.hidden = true;
    }, 1800);
  }

  function reportIssue(message, detail = "") {
    const issue = {
      id: crypto.randomUUID(),
      message: String(message || "发生未知问题"),
      detail: String(detail || ""),
      createdAt: new Date().toLocaleString()
    };
    app.runtime.issues.unshift(issue);
    app.runtime.issues = app.runtime.issues.slice(0, 6);
    syncIssueCenter();
    scheduleIssueCenterAutoHide();
  }

  function clearIssues() {
    app.runtime.issues = [];
    clearTimeout(app.runtime.issueCenterTimer);
    app.runtime.issueCenterTimer = null;
    syncIssueCenter();
  }

  function scheduleIssueCenterAutoHide() {
    clearTimeout(app.runtime.issueCenterTimer);
    app.runtime.issueCenterTimer = setTimeout(() => {
      if (app.refs.issueCenter) app.refs.issueCenter.hidden = true;
      app.runtime.issueCenterTimer = null;
    }, ISSUE_CENTER_AUTO_HIDE_MS);
  }

  function syncIssueCenter() {
    if (!app.refs.issueCenter || !app.refs.issueList) return;
    app.refs.issueCenter.hidden = app.runtime.issues.length === 0;
    app.refs.issueList.innerHTML = "";
    app.runtime.issues.forEach((issue) => {
      const item = document.createElement("article");
      item.className = "issue-item";
      const title = document.createElement("strong");
      title.textContent = issue.message;
      const meta = document.createElement("span");
      meta.textContent = issue.detail ? `${issue.createdAt} · ${issue.detail}` : issue.createdAt;
      item.append(title, meta);
      app.refs.issueList.appendChild(item);
    });
  }

  function setSearchQuery(value) {
    app.runtime.searchQuery = String(value || "").trim();
    render();
  }

  function toggleItemSelection(itemId) {
    const located = app.findItemById(itemId);
    if (!located) return;
    app.runtime.selectionMode = true;
    app.runtime.selectionAnchorGroupId = located.group.id;
    if (app.runtime.selectedItemIds.has(itemId)) {
      app.runtime.selectedItemIds.delete(itemId);
    } else {
      app.runtime.selectedItemIds.add(itemId);
    }
    render();
  }

  function enterSelectionMode(itemId) {
    const located = app.findItemById(itemId);
    if (!located) return;
    app.runtime.selectionMode = true;
    app.runtime.selectionAnchorGroupId = located.group.id;
    app.runtime.selectedItemIds.add(itemId);
    app.runtime.preventNextClickItemId = itemId;
    clearTimeout(app.runtime.preventNextClickTimer);
    app.runtime.preventNextClickTimer = setTimeout(() => {
      app.runtime.preventNextClickItemId = null;
    }, 300);
    render();
  }

  function selectCurrentGroupItems() {
    const group = getSelectionAnchorGroup();
    if (!group) return;
    app.runtime.selectionMode = true;
    group.items.forEach((item) => app.runtime.selectedItemIds.add(item.id));
    app.runtime.selectionAnchorGroupId = group.id;
    render();
  }

  function selectAllItems() {
    app.runtime.selectionMode = true;
    app.store.state.groups.forEach((group) => {
      group.items.forEach((item) => app.runtime.selectedItemIds.add(item.id));
    });
    const firstSelected = Array.from(app.runtime.selectedItemIds)[0];
    const located = firstSelected ? app.findItemById(firstSelected) : null;
    app.runtime.selectionAnchorGroupId = located?.group.id || null;
    render();
  }

  function clearSelection() {
    app.runtime.selectedItemIds.clear();
    app.runtime.selectionAnchorGroupId = null;
    app.runtime.selectionMode = false;
    render();
  }

  function removeRecentItem(itemId) {
    app.store.state.ui.recentItemIds = app.store.state.ui.recentItemIds.filter((id) => id !== itemId);
    app.runtime.recentPage = 0;
    app.saveState();
    render();
  }

  function pruneSelection() {
    for (const itemId of Array.from(app.runtime.selectedItemIds)) {
      if (!app.findItemById(itemId)) app.runtime.selectedItemIds.delete(itemId);
    }
    if (app.runtime.selectionAnchorGroupId && !app.findGroup(app.runtime.selectionAnchorGroupId)) {
      app.runtime.selectionAnchorGroupId = null;
    }
  }

  function getSelectionAnchorGroup() {
    const anchor = app.runtime.selectionAnchorGroupId ? app.findGroup(app.runtime.selectionAnchorGroupId) : null;
    if (anchor) return anchor;

    for (const itemId of app.runtime.selectedItemIds) {
      const located = app.findItemById(itemId);
      if (located?.group) return located.group;
    }

    return null;
  }

  function syncBatchToolbar() {
    const selectedCount = app.runtime.selectedItemIds.size;
    if (!app.refs.batchToolbar) return;
    app.refs.batchToolbar.hidden = !app.runtime.selectionMode && selectedCount === 0;
    if (app.refs.batchCount) app.refs.batchCount.textContent = `已选择 ${selectedCount} 项`;
    if (app.refs.batchGroupSelect) {
      const currentValue = app.refs.batchGroupSelect.value;
      app.refs.batchGroupSelect.innerHTML = "";
      app.store.state.groups.forEach((group) => {
        const option = document.createElement("option");
        option.value = group.id;
        option.textContent = group.name;
        app.refs.batchGroupSelect.appendChild(option);
      });
      if (currentValue && app.findGroup(currentValue)) app.refs.batchGroupSelect.value = currentValue;
    }
  }

  function moveSelectedItems(targetGroupId) {
    const targetGroup = app.findGroup(targetGroupId);
    if (!targetGroup) return;
    const selected = Array.from(app.runtime.selectedItemIds)
      .map((itemId) => app.findItemById(itemId))
      .filter(Boolean);

    selected.forEach(({ group, item }) => {
      app.moveItem(group.id, targetGroup.id, item.id, targetGroup.items.length, false);
    });

    app.runtime.selectedItemIds.clear();
    app.runtime.selectionAnchorGroupId = null;
    app.runtime.selectionMode = false;
    app.ensureValidGroups();
    app.saveState();
    render();
  }

  function resizeSelectedItems(size) {
    if (!app.sizeMeta[size]) return;
    for (const itemId of app.runtime.selectedItemIds) {
      const located = app.findItemById(itemId);
      if (located?.item) located.item.size = size;
    }
    app.saveState();
    render();
  }

  async function refreshSelectedIcons() {
    const selected = Array.from(app.runtime.selectedItemIds)
      .map((itemId) => app.findItemById(itemId))
      .filter(Boolean);
    if (!selected.length) return;

    if (app.refs.batchRefreshIconsButton) {
      app.refs.batchRefreshIconsButton.disabled = true;
      app.refs.batchRefreshIconsButton.textContent = "刷新中...";
    }

    let success = 0;
    let skipped = 0;
    let failed = 0;
    for (const { group, item } of selected) {
      const result = await app.refreshItemIcon?.(group.id, item.id);
      if (result?.ok) {
        success += 1;
      } else if (String(result?.reason || "").includes("自定义图标")) {
        skipped += 1;
      } else {
        failed += 1;
      }
    }

    app.runtime.selectedItemIds.clear();
    app.runtime.selectionAnchorGroupId = null;
    app.runtime.selectionMode = false;
    render();

    const summary = `批量刷新完成：成功 ${success}，跳过 ${skipped}，失败 ${failed}`;
    app.showDragToast?.(summary);
    if (failed || skipped) app.reportIssue?.("批量刷新图标完成", summary);
  }

  function deleteSelectedItems() {
    const selectedIds = new Set(app.runtime.selectedItemIds);
    app.store.state.groups.forEach((group) => {
      group.items = group.items.filter((item) => !selectedIds.has(item.id));
    });
    app.runtime.selectedItemIds.clear();
    app.runtime.selectionAnchorGroupId = null;
    app.runtime.selectionMode = false;
    app.ensureValidGroups();
    app.saveState();
    render();
  }

  function syncSearchControls() {
    const showSearch = app.store.state.layout.showSearch !== false;
    app.refs.searchInput?.closest(".quick-panel")?.toggleAttribute("hidden", !showSearch);
    if (app.refs.searchInput && app.refs.searchInput.value !== app.runtime.searchQuery) {
      app.refs.searchInput.value = app.runtime.searchQuery;
    }
    if (app.refs.searchEngineSelect) {
      const engine = SEARCH_ENGINES[app.store.state.layout.searchEngine] ? app.store.state.layout.searchEngine : "bing";
      app.refs.searchEngineSelect.value = engine;
      app.refs.searchEngineSelect.title = `回车使用 ${SEARCH_ENGINES[engine].label} 搜索`;
    }
    if (app.refs.clearSearchButton) {
      app.refs.clearSearchButton.hidden = !app.runtime.searchQuery;
    }
  }

  function toggleGroupCollapsed(groupId) {
    const collapsed = new Set(app.store.state.ui.collapsedGroupIds);
    if (collapsed.has(groupId)) {
      collapsed.delete(groupId);
    } else {
      collapsed.add(groupId);
    }
    app.store.state.ui.collapsedGroupIds = Array.from(collapsed);
    app.saveState();
    render();
  }

  function isGroupCollapsed(groupId) {
    return app.store.state.ui.collapsedGroupIds.includes(groupId);
  }

  function buildVisibleGroups(query) {
    return app.store.state.groups
      .map((group) => {
        const items = query ? group.items.filter((item) => matchesSearch(group, item, query)) : group.items;
        return { group, items };
      })
      .filter(({ items }) => !query || items.length);
  }

  function matchesSearch(group, item, query) {
    return normalizeSearchText(`${group.name} ${item.title} ${item.description} ${item.url}`).includes(query);
  }

  function normalizeSearchText(value) {
    return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function getRecentItems() {
    return app.store.state.ui.recentItemIds
      .map((itemId) => app.findItemById(itemId))
      .filter(Boolean)
      .map(({ group, item }) => ({ group, item }));
  }

  function createRecentSection(recentItems) {
    const section = document.createElement("section");
    section.className = "group recent-group";
    const pageSize = clampNumber(app.store.state.layout.trackCount, TRACK_COUNT_MIN, TRACK_COUNT_MAX, 3);
    const pageCount = Math.max(1, Math.ceil(recentItems.length / pageSize));
    const currentPage = clampNumber(Math.trunc(app.runtime.recentPage || 0), 0, pageCount - 1, 0);
    const startIndex = currentPage * pageSize;
    const pageItems = recentItems.slice(startIndex, startIndex + pageSize);
    app.runtime.recentPage = currentPage;

    const title = document.createElement("div");
    title.className = "group-title";
    const name = document.createElement("span");
    name.className = "group-title-name";
    name.textContent = "最近打开";
    const meta = document.createElement("span");
    meta.className = "group-title-meta";
    meta.textContent =
      pageCount > 1 ? `${startIndex + 1}-${startIndex + pageItems.length}/${recentItems.length}` : String(recentItems.length);
    title.append(name, meta);

    if (pageCount > 1) {
      const pager = document.createElement("div");
      pager.className = "recent-pager no-drag";
      pager.append(
        createRecentPageButton("上一页", "‹", currentPage <= 0, () => {
          app.runtime.recentPage = Math.max(0, currentPage - 1);
          render();
        }),
        createRecentPageButton("下一页", "›", currentPage >= pageCount - 1, () => {
          app.runtime.recentPage = Math.min(pageCount - 1, currentPage + 1);
          render();
        })
      );
      title.appendChild(pager);
    }

    section.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "group-grid recent-grid";
    grid.dataset.recent = "true";
    pageItems.forEach(({ group, item }) => {
      const index = group.items.findIndex((entry) => entry.id === item.id);
      grid.appendChild(createItemNode(item, group.id, index, { enableDrag: false, recentOnly: true, displaySize: "1x1" }));
    });
    section.appendChild(grid);
    return section;
  }

  function createRecentPageButton(label, text, disabled, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "recent-page-button no-drag";
    button.disabled = disabled;
    button.setAttribute("aria-label", label);
    button.textContent = text;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    return button;
  }

  function createEmptyState(isSearching) {
    const empty = document.createElement("section");
    empty.className = "empty-state";
    empty.textContent = isSearching ? "没有匹配的项目" : "暂无项目";
    return empty;
  }
}
