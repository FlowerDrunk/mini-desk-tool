import { escapeHtml, normalizeUrl, repairDisplayText, safeHost } from "./model.js";

export function registerIconFeature(app) {
  app.setIconSearchStatus = setIconSearchStatus;
  app.setLinkSearchStatus = setLinkSearchStatus;
  app.cancelOfficialLinkSearch = cancelOfficialLinkSearch;
  app.renderIconSuggestions = renderIconSuggestions;
  app.scheduleIconSuggestionSearch = scheduleIconSuggestionSearch;
  app.scheduleOfficialLinkSearch = scheduleOfficialLinkSearch;
  app.rotateIconSuggestions = rotateIconSuggestions;
  app.selectSuggestedIcon = selectSuggestedIcon;
  app.getOriginalIconCandidate = getOriginalIconCandidate;
  app.refreshItemIcon = refreshItemIcon;

  function getIconPicker(type) {
    return app.runtime.iconPickers[type === "edit" ? "edit" : "add"];
  }

  function setIconSearchStatus(type, text) {
    const target = type === "edit" ? app.refs.editIconSearchStatus : app.refs.addIconSearchStatus;
    if (target) target.textContent = text;
  }

  function setLinkSearchStatus(type, text) {
    const target = type === "edit" ? app.refs.editLinkSearchStatus : app.refs.addLinkSearchStatus;
    if (target) target.textContent = text;
  }

  function cancelOfficialLinkSearch(type) {
    const picker = getIconPicker(type);
    clearTimeout(picker.linkSearchTimer);
    picker.linkSearchTimer = null;
    picker.linkSearchRequestId += 1;
  }

  function getDisplayedSuggestionLimit(type) {
    return type === "edit" ? 3 : 4;
  }

  function getDisplayedSuggestions(type, suggestions) {
    const originalCandidate = getOriginalIconCandidate(type);
    const recommendationLimit = getDisplayedSuggestionLimit(type);
    const picker = getIconPicker(type);
    const start = picker.batchIndex * recommendationLimit;
    let recommended = suggestions.slice(start, start + recommendationLimit);

    if (!recommended.length && suggestions.length) {
      picker.batchIndex = 0;
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
    const picker = getIconPicker(type);
    clearTimeout(picker.refreshCooldownTimer);

    if (!picker.refreshCooldownUntil || picker.refreshCooldownUntil <= Date.now()) {
      updateRefreshButtonState(type);
      return;
    }

    picker.refreshCooldownTimer = setTimeout(() => {
      updateRefreshButtonState(type);
      scheduleRefreshCooldownTick(type);
    }, 250);
  }

  function updateRefreshButtonState(type) {
    const picker = getIconPicker(type);
    if (!picker.refreshButton) return;

    const batchCount = getAvailableBatchCount(type, picker.suggestions);
    const remainingMs = Math.max(0, picker.refreshCooldownUntil - Date.now());
    const remainingSeconds = Math.ceil(remainingMs / 1000);

    picker.refreshButton.disabled = batchCount <= 1 || remainingMs > 0;
    picker.refreshButton.textContent = remainingMs > 0 ? `${remainingSeconds}s 后可换` : "换一批";
  }

  function rotateIconSuggestions(type) {
    const picker = getIconPicker(type);
    const batchCount = getAvailableBatchCount(type, picker.suggestions);
    if (batchCount <= 1) {
      updateRefreshButtonState(type);
      return;
    }

    if (picker.refreshCooldownUntil > Date.now()) {
      updateRefreshButtonState(type);
      return;
    }

    picker.batchIndex = (picker.batchIndex + 1) % batchCount;
    picker.refreshCooldownUntil = Date.now() + 3000;
    updateRefreshButtonState(type);
    scheduleRefreshCooldownTick(type);
    renderIconSuggestions(type);
  }

  function getOriginalIconCandidate(type) {
    if (type === "edit") {
      const item = app.runtime.activeItemContext
        ? app.findItem(app.runtime.activeItemContext.groupId, app.runtime.activeItemContext.itemId)
        : null;
      const url = String(item?.shortcutIcon || app.runtime.pendingEditOriginalIconUrl || "").trim();
      if (!url) return null;
      return { id: "original-icon", name: "原始图标", url, isOriginal: true };
    }

    const urlValue = normalizeUrl(String(app.refs.addUrlInput.value || "").trim());
    const host = safeHost(urlValue);
    if (!host) return null;
    return {
      id: "original-icon",
      name: "原始图标",
      url: `https://icons.duckduckgo.com/ip3/${host}.ico`,
      isOriginal: true
    };
  }

  function selectSuggestedIcon(type, candidate) {
    if (!candidate?.url) return;
    const picker = getIconPicker(type);
    picker.selectedUrl = candidate.url;

    if (type === "edit") {
      app.refs.editIconModeSelect.value = "custom";
      app.refs.editCustomIconInput.value = candidate.url;
      app.syncEditDialogFields();
      return;
    }

    renderIconSuggestions(type);
  }

  function renderIconSuggestions(type) {
    const picker = getIconPicker(type);
    const mergedSuggestions = getDisplayedSuggestions(type, picker.suggestions);

    if (!picker.grid) return;
    picker.grid.innerHTML = "";

    if (!mergedSuggestions.length) {
      const empty = document.createElement("div");
      empty.className = "icon-suggestion-empty";
      empty.textContent = "输入描述后会在这里显示推荐图标。";
      picker.grid.appendChild(empty);
      return;
    }

    mergedSuggestions.forEach((candidate) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "icon-suggestion-card";
      if (candidate.isOriginal) button.classList.add("is-original");
      if (candidate.url && candidate.url === picker.selectedUrl) button.classList.add("is-selected");
      button.innerHTML = `<img src="${candidate.url}" alt="${escapeHtml(candidate.name)}"><span>${escapeHtml(candidate.name)}</span>`;
      button.addEventListener("click", () => selectSuggestedIcon(type, candidate));
      picker.grid.appendChild(button);
    });

    updateRefreshButtonState(type);
  }

  function scheduleIconSuggestionSearch(type, rawDescription, options = {}) {
    const description = repairDisplayText(String(rawDescription || "").trim());
    const picker = getIconPicker(type);
    clearTimeout(picker.searchTimer);

    if (!description) {
      picker.suggestions = [];
      picker.selectedUrl = type === "edit" && app.refs.editIconModeSelect.value === "custom"
        ? app.refs.editCustomIconInput.value.trim()
        : "";
      setIconSearchStatus(type, "输入描述后自动搜索");
      renderIconSuggestions(type);
      return;
    }

    setIconSearchStatus(type, "正在搜索图标...");
    picker.searchTimer = setTimeout(() => {
      void runIconSuggestionSearch(type, description, options);
    }, 320);
  }

  async function runIconSuggestionSearch(type, description, options = {}) {
    const picker = getIconPicker(type);
    const requestId = ++picker.searchRequestId;
    let suggestions = [];

    try {
      suggestions = (await app.desktopPanel?.searchIconSuggestions?.(description)) || [];
    } catch {
      suggestions = [];
    }

    if (requestId !== picker.searchRequestId) return;

    picker.suggestions = Array.isArray(suggestions)
      ? suggestions
          .filter((item) => item && typeof item.url === "string" && item.url)
          .map((item, index) => ({
            id: item.id || `${description}-${index}`,
            name: repairDisplayText(String(item.name || description).trim() || description),
            url: String(item.url || "").trim()
          }))
      : [];
    picker.batchIndex = 0;

    const preferredUrl =
      type === "edit"
        ? String(options.preferUrl || app.refs.editCustomIconInput.value || "").trim()
        : picker.selectedUrl;
    const visibleSuggestions = getDisplayedSuggestions(type, picker.suggestions);

    if (preferredUrl && visibleSuggestions.some((item) => item.url === preferredUrl)) {
      picker.selectedUrl = preferredUrl;
    } else if (options.autoSelectFirst && visibleSuggestions[0]) {
      picker.selectedUrl = visibleSuggestions[0].url;
      if (type === "edit") {
        app.refs.editIconModeSelect.value = "custom";
        app.refs.editCustomIconInput.value = visibleSuggestions[0].url;
      }
    }

    const totalCount = picker.suggestions.length + (getOriginalIconCandidate(type) ? 1 : 0);
    setIconSearchStatus(type, totalCount ? `已准备 ${totalCount} 个候选图标` : "没有找到合适图标");
    updateRefreshButtonState(type);
    renderIconSuggestions(type);
  }

  async function refreshItemIcon(groupId, itemId) {
    const item = app.findItem(groupId, itemId);
    if (!item) return { ok: false, reason: "图标不存在" };
    if (item.iconMode === "custom" && item.customIcon) {
      item.iconFailureReason = "当前使用自定义图标，已保留不覆盖";
      item.iconUpdatedAt = new Date().toISOString();
      app.saveState();
      app.updateIconResourceFields?.();
      return { ok: false, reason: "当前使用自定义图标，已保留不覆盖" };
    }

    const query = repairDisplayText(`${item.title} ${item.description || ""} ${safeHost(item.url)}`.trim());
    let suggestions = [];
    try {
      suggestions = (await app.desktopPanel?.searchIconSuggestions?.(query)) || [];
    } catch {
      setIconRefreshFailure(item, "搜索图标失败，请稍后重试");
      return { ok: false, reason: "搜索图标失败，请稍后重试" };
    }

    const candidate = Array.isArray(suggestions)
      ? suggestions.find((entry) => entry?.url && entry.url !== item.customIcon)
      : null;
    if (!candidate?.url) {
      setIconRefreshFailure(item, "没有找到可用候选图标");
      return { ok: false, reason: "没有找到可用候选图标" };
    }

    const latest = app.findItem(groupId, itemId);
    if (!latest) return { ok: false, reason: "图标已不存在" };
    if (latest.iconMode === "custom" && latest.customIcon) {
      setIconRefreshFailure(latest, "当前使用自定义图标，已保留不覆盖");
      return { ok: false, reason: "当前使用自定义图标，已保留不覆盖" };
    }

    latest.iconMode = "custom";
    latest.customIcon = String(candidate.url || "").trim();
    latest.iconSource = repairDisplayText(String(candidate.name || "候选图标").trim() || "候选图标");
    latest.iconUpdatedAt = new Date().toISOString();
    latest.iconFailureReason = "";
    app.saveState();
    app.updateIconResourceFields?.();
    app.render();
    return { ok: true, name: repairDisplayText(String(candidate.name || latest.title || "候选图标")) };
  }

  function setIconRefreshFailure(item, reason) {
    item.iconFailureReason = reason;
    item.iconUpdatedAt = new Date().toISOString();
    app.saveState();
    app.updateIconResourceFields?.();
  }

  function scheduleOfficialLinkSearch(type, rawDescription) {
    const description = repairDisplayText(String(rawDescription || "").trim());
    const picker = getIconPicker(type);
    clearTimeout(picker.linkSearchTimer);

    if (!description) {
      setLinkSearchStatus(type, "根据描述自动补全官方链接");
      return;
    }

    setLinkSearchStatus(type, "正在查找官方链接...");
    picker.linkSearchTimer = setTimeout(() => {
      void runOfficialLinkSearch(type, description);
    }, 360);
  }

  async function runOfficialLinkSearch(type, description) {
    if (!app.shouldAutoSearchOfficialLink(type)) return;

    const picker = getIconPicker(type);
    const requestId = ++picker.linkSearchRequestId;
    const cleanDescription = description.trim().replace(/\s+/g, " ").toLowerCase();
    let url = "";

    try {
      url = (await app.desktopPanel?.searchOfficialUrl?.(cleanDescription)) || "";
      if (!url && cleanDescription !== description) {
        url = (await app.desktopPanel?.searchOfficialUrl?.(description)) || "";
      }
    } catch {
      url = "";
    }

    if (requestId !== picker.linkSearchRequestId) return;

    if (!url) {
      setLinkSearchStatus(type, "没有找到明确官网，你也可以手动填写");
      return;
    }

    const normalizedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    if (type === "edit") {
      app.refs.editUrlInput.value = normalizedUrl;
    } else {
      app.refs.addUrlInput.value = normalizedUrl;
    }
    setLinkSearchStatus(type, "已自动补全官方链接");
  }
}
