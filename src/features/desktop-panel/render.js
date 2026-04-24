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
    app.refs.groupsContainer.innerHTML = "";
    app.clearDropIndicator();

    app.store.state.groups.forEach((group, groupIndex) => {
      const section = document.createElement("section");
      section.className = "group";
      section.dataset.groupId = group.id;

      if (app.store.state.layout.showGroupTitle) {
        section.appendChild(createGroupTitleNode(group));
      }

      const grid = document.createElement("div");
      grid.className = "group-grid";
      grid.dataset.groupId = group.id;
      grid.dataset.flow = app.store.state.layout.flowDirection;
      app.bindGridDropEvents(grid, section, group.id);

      group.items.forEach((item, index) => {
        grid.appendChild(createItemNode(item, group.id, index));
      });

      if (app.store.state.layout.showAddTile && groupIndex === app.store.state.groups.length - 1) {
        grid.appendChild(createAddTile());
      }

      section.appendChild(grid);
      app.refs.groupsContainer.appendChild(section);
    });

    app.refreshGroupOptions(app.refs.groupSelect);
    app.refreshGroupOptions(app.refs.editGroupSelect, false);
  }

  function createGroupTitleNode(group) {
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

    const title = document.createElement("h3");
    title.className = "group-title";
    title.dataset.groupId = group.id;
    title.textContent = group.name;
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
      app.openUrl(item.url);
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
}
