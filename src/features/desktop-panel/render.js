import {
  clampNumber,
  DEFAULT_GAP,
  ensureValidGroups,
  escapeHtml,
  makeFallbackIcon,
  safeHost,
  SIZE_META,
  TRACK_COUNT_MAX,
  TRACK_COUNT_MIN,
  WINDOW_WIDTH_MAX,
  WINDOW_WIDTH_MIN
} from "./model.js";

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
  app.setSearchQuery = setSearchQuery;
  app.toggleGroupCollapsed = toggleGroupCollapsed;

  function applyLayout() {
    const iconSize = clampNumber(app.store.state.layout.iconSize, 42, 76, 58);
    const trackCount = clampNumber(app.store.state.layout.trackCount, TRACK_COUNT_MIN, TRACK_COUNT_MAX, 3);
    const tileBase = Math.max(84, iconSize + 28);

    document.documentElement.style.setProperty("--icon-size", `${iconSize}px`);
    document.documentElement.style.setProperty("--gap", `${DEFAULT_GAP}px`);
    document.documentElement.style.setProperty("--tile-base-size", `${tileBase}px`);
    document.documentElement.style.setProperty("--track-count", String(trackCount));
    app.refs.appShell.dataset.flow = app.store.state.layout.flowDirection === "rtl" ? "rtl" : "ltr";
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
    if (!app.store.state.layout.showSearch) app.runtime.searchQuery = "";
    app.refs.groupsContainer.innerHTML = "";
    app.clearDropIndicator();
    syncSearchControls();

    const query = normalizeSearchText(app.runtime.searchQuery);
    const isSearching = Boolean(query);
    const visibleGroups = buildVisibleGroups(query);
    const recentItems = isSearching ? [] : getRecentItems();

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

  function createItemNode(item, groupId, index) {
    const node = app.refs.itemTemplate.content.firstElementChild.cloneNode(true);
    node.draggable = false;
    node.dataset.itemId = item.id;
    node.dataset.groupId = groupId;
    node.dataset.index = String(index);
    node.dataset.size = item.size;

    const iconWrap = node.querySelector(".icon-wrap");
    const label = node.querySelector(".label");
    const deleteButton = node.querySelector(".delete");
    const meta = SIZE_META[item.size] || SIZE_META["1x1"];
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
      app.openItem(item.id, item.url);
    });

    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      app.removeItem(groupId, item.id);
    });

    node.addEventListener("pointerdown", (event) => {
      if (event.target === deleteButton) return;
      app.startPointerDrag(event, item.id, groupId, node);
    });

    if (iconWrap) iconWrap.style.pointerEvents = "none";
    if (label) label.style.pointerEvents = "none";
    return node;
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

  function setSearchQuery(value) {
    app.runtime.searchQuery = String(value || "").trim();
    render();
  }

  function syncSearchControls() {
    const showSearch = app.store.state.layout.showSearch !== false;
    app.refs.searchInput?.closest(".quick-panel")?.toggleAttribute("hidden", !showSearch);
    if (app.refs.searchInput && app.refs.searchInput.value !== app.runtime.searchQuery) {
      app.refs.searchInput.value = app.runtime.searchQuery;
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
      .filter(({ group, items }) => items.length || (!query && group.id === app.store.state.groups[0]?.id));
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
      .map(({ group, item }) => ({ group, item }))
      .slice(0, 8);
  }

  function createRecentSection(recentItems) {
    const section = document.createElement("section");
    section.className = "group recent-group";

    const title = document.createElement("div");
    title.className = "group-title";
    const name = document.createElement("span");
    name.className = "group-title-name";
    name.textContent = "最近打开";
    const meta = document.createElement("span");
    meta.className = "group-title-meta";
    meta.textContent = String(recentItems.length);
    title.append(name, meta);
    section.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "group-grid recent-grid";
    recentItems.forEach(({ group, item }) => {
      const index = group.items.findIndex((entry) => entry.id === item.id);
      grid.appendChild(createItemNode(item, group.id, index));
    });
    section.appendChild(grid);
    return section;
  }

  function createEmptyState(isSearching) {
    const empty = document.createElement("section");
    empty.className = "empty-state";
    empty.textContent = isSearching ? "没有匹配的项目" : "暂无项目";
    return empty;
  }
}
