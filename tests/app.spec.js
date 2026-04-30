const path = require("path");
const { test, expect } = require("@playwright/test");

const STORAGE_KEY = "desktop-panel-state-v9";
const mockScriptPath = path.join(__dirname, "helpers", "mockDesktopPanel.js");

function svgIconDataUrl(text, color = "#1d4ed8") {
  const markup = [
    "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'>",
    `<rect width='64' height='64' rx='16' fill='${color}'/>`,
    `<text x='50%' y='54%' text-anchor='middle' dominant-baseline='middle' font-family='Arial, sans-serif' font-size='24' fill='white'>${text}</text>`,
    "</svg>"
  ].join("");
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(markup)}`;
}

async function gotoApp(page) {
  await page.addInitScript({ path: mockScriptPath });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".tile")).toHaveCount(2);
}

async function gotoAppWithState(page, state) {
  await page.addInitScript({ path: mockScriptPath });
  await page.addInitScript(({ storageKey, nextState }) => {
    window.localStorage.setItem(storageKey, JSON.stringify(nextState));
  }, { storageKey: STORAGE_KEY, nextState: state });
  await page.goto("/", { waitUntil: "domcontentloaded" });
}

async function openAppContextMenu(page) {
  const coordinates = { x: 32, y: 32 };
  await page.evaluate(() => {
    const workspace = document.querySelector("#workspace");
    workspace.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 32,
      clientY: 32
    }));
  });
  await expect(page.locator("#appContextMenu")).toBeVisible();
  return coordinates;
}

async function openItemContextMenu(page, index = 0) {
  const tile = page.locator(".tile").nth(index);
  const box = await tile.boundingBox();
  if (!box) throw new Error(`Unable to resolve tile ${index} bounding box`);

  const coordinates = {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2
  };

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, {
    button: "right"
  });
  await expect(page.locator("#itemContextMenu")).toBeVisible();
  return coordinates;
}

async function openSettings(page) {
  await openAppContextMenu(page);
  await page.locator('#appContextMenu [data-action="open-settings"]').click();
  await expect.poll(async () => page.locator("#settingsDialog").evaluate((node) => node.open)).toBe(true);
}

async function longPressTile(page, selector) {
  const tile = page.locator(selector);
  const box = await tile.boundingBox();
  if (!box) throw new Error(`Unable to resolve tile ${selector} bounding box`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(620);
  await page.mouse.up();
}

async function setRangeValue(page, selector, value) {
  await page.locator(selector).evaluate((input, nextValue) => {
    input.value = String(nextValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

async function commitRangeValue(page, selector, value) {
  await page.locator(selector).evaluate((input, nextValue) => {
    input.value = String(nextValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function getStoredState(page) {
  return page.evaluate((storageKey) => JSON.parse(window.localStorage.getItem(storageKey)), STORAGE_KEY);
}

test("renders default items and opens a clicked entry", async ({ page }) => {
  await gotoApp(page);

  await page.locator(".tile").first().click();

  await expect.poll(() => page.evaluate(() => window.__desktopPanelMock.state.calls.openUrl)).toEqual([
    "https://www.zhihu.com"
  ]);
});

test("adds an item from the app menu and creates a new group", async ({ page }) => {
  await gotoApp(page);

  await page.evaluate(({ icon }) => {
    window.__desktopPanelMock.setOfficialUrl("github", "https://github.com");
    window.__desktopPanelMock.setIconSuggestions("github", [
      { id: "gh", name: "GitHub", url: icon }
    ]);
  }, {
    icon: svgIconDataUrl("GH")
  });

  await openAppContextMenu(page);
  await page.locator('#appContextMenu [data-action="add-icon"]').click();
  await expect.poll(async () => page.locator("#addDialog").evaluate((node) => node.open)).toBe(true);

  await page.fill("#addTitleInput", "GitHub");
  await page.fill("#addDescriptionInput", "github");
  await expect.poll(() => page.inputValue("#addUrlInput")).toBe("https://github.com");
  await expect.poll(() => page.locator("#addIconSuggestions .icon-suggestion-card").count()).toBeGreaterThan(0);

  await page.selectOption("#groupSelect", "__new_auto_group__");
  await page.locator('#addForm button[type="submit"]').click();

  await expect(page.locator(".group")).toHaveCount(2);
  await expect(page.locator(".tile .label")).toContainText(["GitHub"]);

  const state = await getStoredState(page);
  const addedItem = state.groups.flatMap((group) => group.items).find((item) => item.title === "GitHub");
  expect(addedItem).toBeTruthy();
  expect(addedItem.url).toBe("https://github.com");
  expect(addedItem.iconMode).toBe("custom");
});

test("positions context menus close to the cursor", async ({ page }) => {
  await gotoApp(page);

  const appMenuPoint = await openAppContextMenu(page);
  const appMenuBox = await page.locator("#appContextMenu").boundingBox();
  expect(appMenuBox).toBeTruthy();
  expect(appMenuBox.y).toBeLessThan(appMenuPoint.y);

  const itemMenuPoint = await openItemContextMenu(page, 0);
  const itemMenuBox = await page.locator("#itemContextMenu").boundingBox();
  expect(itemMenuBox).toBeTruthy();
  expect(itemMenuBox.y).toBeLessThan(itemMenuPoint.y);
});

test("opens the app context menu from non-workspace chrome", async ({ page }) => {
  await gotoApp(page);

  await page.locator("#windowDragBand").dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX: 120,
    clientY: 8
  });

  await expect(page.locator("#appContextMenu")).toBeVisible();
  await expect(page.locator("#itemContextMenu")).toBeHidden();
});

test("shows contextual quick actions for web and local items", async ({ page }) => {
  await gotoAppWithState(page, {
    layout: { iconSize: 58, windowWidth: 360, showAddTile: false, showSearch: true, trackCount: 3 },
    ui: { collapsedGroupIds: [], recentItemIds: [] },
    app: {},
    groups: [
      {
        id: "default-group",
        name: "Default",
        items: [
          { id: "web-item", title: "Docs", description: "", url: "https://docs.example.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" },
          { id: "local-item", title: "Tool", description: "", url: "C:\\\\Tools\\\\Tool.exe --safe", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" }
        ]
      }
    ]
  });

  await page.evaluate(() => {
    window.__copiedText = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText(text) {
          window.__copiedText = String(text || "");
          return Promise.resolve();
        }
      }
    });
  });

  await openItemContextMenu(page, 0);
  await expect(page.locator('#itemContextMenu [data-action="copy-target"]')).toBeVisible();
  await expect(page.locator('#itemContextMenu [data-action="open-browser"]')).toBeVisible();
  await expect(page.locator('#itemContextMenu [data-action="open-folder"]')).toBeHidden();
  await expect(page.locator('#itemContextMenu [data-action="open-admin"]')).toBeHidden();
  await page.locator('#itemContextMenu [data-action="copy-target"]').click();
  await expect.poll(() => page.evaluate(() => window.__copiedText)).toBe("https://docs.example.com");

  await openItemContextMenu(page, 0);
  await page.locator('#itemContextMenu [data-action="copy-keyword"]').click();
  await expect.poll(() => page.evaluate(() => window.__copiedText)).toBe("Docs");

  await openItemContextMenu(page, 0);
  await page.locator('#itemContextMenu [data-action="open-browser"]').click();
  await expect.poll(() => page.evaluate(() => window.__desktopPanelMock.state.calls.openUrl.at(-1))).toBe("https://docs.example.com");

  await openItemContextMenu(page, 1);
  await expect(page.locator('#itemContextMenu [data-action="open-browser"]')).toBeHidden();
  await expect(page.locator('#itemContextMenu [data-action="open-folder"]')).toBeVisible();
  await expect(page.locator('#itemContextMenu [data-action="open-admin"]')).toBeVisible();
  await page.locator('#itemContextMenu [data-action="open-folder"]').click();
  await expect.poll(() => page.evaluate(() => window.__desktopPanelMock.state.calls.openContainingFolder.at(-1))).toBe("C:\\\\Tools\\\\Tool.exe --safe");

  await openItemContextMenu(page, 1);
  await page.locator('#itemContextMenu [data-action="open-admin"]').click();
  await expect.poll(() => page.evaluate(() => window.__desktopPanelMock.state.calls.openAsAdmin.at(-1))).toBe("C:\\\\Tools\\\\Tool.exe --safe");
});

test("refreshes a single icon from the item context menu without overwriting custom icons", async ({ page }) => {
  const refreshedIcon = svgIconDataUrl("RF", "#0f766e");
  await gotoAppWithState(page, {
    layout: { iconSize: 58, windowWidth: 360, showAddTile: false, showSearch: true, trackCount: 3 },
    ui: { collapsedGroupIds: [], recentItemIds: [] },
    groups: [
      {
        id: "default-group",
        name: "Default",
        items: [
          { id: "web-item", title: "Docs", description: "reference", url: "https://docs.example.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" },
          { id: "custom-item", title: "Custom", description: "", url: "https://custom.example.com", size: "1x1", iconMode: "custom", customIcon: svgIconDataUrl("CU", "#7c3aed"), shortcutIcon: "" }
        ]
      }
    ]
  });
  await page.evaluate(({ icon }) => {
    window.__desktopPanelMock.setIconSuggestions("Docs reference docs.example.com", [
      { id: "docs-refreshed", name: "Docs Refreshed", url: icon }
    ]);
  }, { icon: refreshedIcon });

  await openItemContextMenu(page, 0);
  await page.locator('#itemContextMenu [data-action="refresh-icon"]').click();
  await expect.poll(async () => {
    const state = await getStoredState(page);
    const item = state.groups[0].items.find((entry) => entry.id === "web-item");
    return {
      customIcon: item.customIcon,
      iconSource: item.iconSource,
      iconFailureReason: item.iconFailureReason,
      hasUpdatedAt: Boolean(item.iconUpdatedAt)
    };
  }).toEqual({
    customIcon: refreshedIcon,
    iconSource: "Docs Refreshed",
    iconFailureReason: "",
    hasUpdatedAt: true
  });

  await openItemContextMenu(page, 1);
  await page.locator('#itemContextMenu [data-action="refresh-icon"]').click();
  await expect(page.locator("#issueCenter")).toContainText("当前使用自定义图标");
  await expect.poll(async () => {
    const state = await getStoredState(page);
    const item = state.groups[0].items.find((entry) => entry.id === "custom-item");
    return {
      customIcon: item.customIcon,
      iconFailureReason: item.iconFailureReason
    };
  }).toMatchObject({
    customIcon: expect.stringContaining("CU"),
    iconFailureReason: expect.stringContaining("自定义图标")
  });

  await openSettings(page);
  await expect(page.locator("#iconResourceSummary")).toContainText("1 条失败记录");
  await page.click("#clearIconFailuresButton");
  await expect(page.locator("#iconResourceStatus")).toContainText("已清理 1 条图标失败记录");
  await expect.poll(async () => {
    const state = await getStoredState(page);
    return state.groups[0].items.map((item) => item.iconFailureReason || "");
  }).toEqual(["", ""]);
});

test("reorders items through drag and drop without opening them", async ({ page }) => {
  await gotoApp(page);

  const firstTile = page.locator(".tile").nth(0);
  const secondTile = page.locator(".tile").nth(1);
  const firstBox = await firstTile.boundingBox();
  const secondBox = await secondTile.boundingBox();
  if (!firstBox || !secondBox) throw new Error("Missing tile bounds for drag reorder test");

  await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(secondBox.x + secondBox.width * 0.8, secondBox.y + secondBox.height / 2, { steps: 12 });
  await page.mouse.up();

  await expect.poll(async () => {
    const state = await getStoredState(page);
    return state.groups[0].items.map((item) => item.title);
  }).toEqual(["腾讯视频", "知乎"]);
  await expect.poll(async () => page.locator(".tile .label").allTextContents()).toEqual(["腾讯视频", "知乎"]);
  await expect.poll(() => page.evaluate(() => window.__desktopPanelMock.state.calls.openUrl)).toEqual([]);
});

test("filters items, searches with the selected engine, and records clicked recent items", async ({ page }) => {
  await gotoAppWithState(page, {
    layout: {
      iconSize: 58,
      windowWidth: 360,
      showGroupTitle: true,
      showAddTile: false,
      flowDirection: "ltr",
      trackCount: 3
    },
    ui: {
      collapsedGroupIds: [],
      recentItemIds: []
    },
    app: { snapToEdge: true },
    groups: [
      {
        id: "dev-group",
        name: "Dev",
        items: [
          { id: "github-item", title: "GitHub", description: "code hosting", url: "https://github.com", size: "2x2", iconMode: "default", customIcon: "", shortcutIcon: "" },
          { id: "docs-item", title: "Docs", description: "reference", url: "https://docs.example.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" }
        ]
      },
      {
        id: "mail-group",
        name: "Mail",
        items: [
          { id: "gmail-item", title: "Gmail", description: "mail inbox", url: "https://mail.google.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" }
        ]
      }
    ]
  });
  await expect(page.locator(".tile")).toHaveCount(3);

  await page.fill("#searchInput", "github");
  await expect(page.locator(".tile .label")).toHaveText(["GitHub"]);

  await page.selectOption("#searchEngineSelect", "baidu");
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.__desktopPanelMock.state.calls.openUrl.at(-1))).toBe(
    "https://www.baidu.com/s?wd=github"
  );

  await page.click("#clearSearchButton");
  await page.locator('.tile[data-item-id="github-item"]').click();
  await expect.poll(() => page.evaluate(() => window.__desktopPanelMock.state.calls.openUrl.at(-1))).toBe(
    "https://github.com"
  );
  await expect(page.locator(".recent-group .tile .label")).toHaveText(["GitHub"]);
  await expect(page.locator('.recent-group .tile[data-item-id="github-item"]')).toHaveAttribute("data-size", "1x1");
  await expect(page.locator('.group[data-group-id="dev-group"] .tile[data-item-id="github-item"]')).toHaveAttribute("data-size", "2x2");
});

test("supports keyboard navigation, opening, and confirmed delete for focused icons", async ({ page }) => {
  await gotoAppWithState(page, {
    layout: {
      iconSize: 58,
      windowWidth: 360,
      showGroupTitle: true,
      showAddTile: false,
      showSearch: true,
      flowDirection: "ltr",
      trackCount: 3
    },
    ui: {
      collapsedGroupIds: [],
      recentItemIds: []
    },
    app: { snapToEdge: true },
    groups: [
      {
        id: "default-group",
        name: "Default",
        items: [
          { id: "alpha-item", title: "Alpha", description: "", url: "https://alpha.example.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" },
          { id: "beta-item", title: "Beta", description: "", url: "https://beta.example.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" },
          { id: "gamma-item", title: "Gamma", description: "", url: "https://gamma.example.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" }
        ]
      }
    ]
  });

  await page.locator('.tile[data-item-id="alpha-item"]').focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => page.evaluate(() => document.activeElement?.dataset?.itemId)).toBe("beta-item");

  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.__desktopPanelMock.state.calls.openUrl.at(-1))).toBe(
    "https://beta.example.com"
  );

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('.tile[data-item-id="alpha-item"]').focus();
  await page.keyboard.press("Delete");
  await expect(page.locator('.tile[data-item-id="alpha-item"]')).toHaveCount(0);
  await expect.poll(async () => {
    const state = await getStoredState(page);
    return state.groups[0].items.map((item) => item.id);
  }).toEqual(["beta-item", "gamma-item"]);
});

test("applies reduced motion and high contrast focus settings", async ({ page }) => {
  await gotoApp(page);
  await openSettings(page);

  await page.check("#reduceMotionInput");
  await page.check("#highContrastFocusInput");

  await expect(page.locator("#appShell")).toHaveAttribute("data-reduce-motion", "true");
  await expect(page.locator("#appShell")).toHaveAttribute("data-high-contrast-focus", "true");
  await expect.poll(() => page.evaluate(() => window.__desktopPanelMock.state.windowBehavior.reduceMotion)).toBe(true);

  const state = await getStoredState(page);
  expect(state.layout.reduceMotion).toBe(true);
  expect(state.layout.highContrastFocus).toBe(true);
});

test("can hide the search box from settings", async ({ page }) => {
  await gotoApp(page);
  await expect(page.locator(".quick-panel")).toBeVisible();

  await page.fill("#searchInput", "zhihu");
  await expect(page.locator(".tile")).toHaveCount(1);

  await openSettings(page);
  await page.uncheck("#showSearchInput");
  await expect(page.locator(".quick-panel")).toBeHidden();
  await expect(page.locator(".tile")).toHaveCount(2);

  await expect.poll(async () => (await getStoredState(page)).layout.showSearch).toBe(false);
});

test("persists collapsed groups and expands them on search", async ({ page }) => {
  await gotoAppWithState(page, {
    layout: {
      iconSize: 58,
      windowWidth: 360,
      showGroupTitle: true,
      showAddTile: false,
      flowDirection: "ltr",
      trackCount: 3
    },
    ui: {
      collapsedGroupIds: [],
      recentItemIds: []
    },
    app: { snapToEdge: true },
    groups: [
      {
        id: "dev-group",
        name: "Dev",
        items: [
          { id: "github-item", title: "GitHub", description: "code hosting", url: "https://github.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" }
        ]
      }
    ]
  });

  await page.locator('.group[data-group-id="dev-group"] .group-collapse-toggle').click();
  await expect(page.locator('.group[data-group-id="dev-group"] .group-grid')).toBeHidden();
  await expect.poll(async () => (await getStoredState(page)).ui.collapsedGroupIds).toEqual(["dev-group"]);

  await page.fill("#searchInput", "github");
  await expect(page.locator('.group[data-group-id="dev-group"] .group-grid')).toBeVisible();
  await expect(page.locator(".tile .label")).toHaveText(["GitHub"]);
});

test("reorders groups by dragging group titles", async ({ page }) => {
  await gotoAppWithState(page, {
    layout: {
      iconSize: 58,
      windowWidth: 360,
      showGroupTitle: true,
      showAddTile: false,
      showSearch: true,
      flowDirection: "ltr",
      trackCount: 3
    },
    ui: { collapsedGroupIds: [], recentItemIds: [] },
    groups: [
      {
        id: "alpha-group",
        name: "Alpha",
        items: [
          { id: "alpha-item", title: "Alpha Item", description: "", url: "https://alpha.example.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" }
        ]
      },
      {
        id: "beta-group",
        name: "Beta",
        items: [
          { id: "beta-item", title: "Beta Item", description: "", url: "https://beta.example.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" }
        ]
      },
      {
        id: "gamma-group",
        name: "Gamma",
        items: [
          { id: "gamma-item", title: "Gamma Item", description: "", url: "https://gamma.example.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" }
        ]
      }
    ]
  });

  await page.evaluate(() => {
    const source = document.querySelector('.group[data-group-id="gamma-group"] .group-title');
    const target = document.querySelector('.group[data-group-id="alpha-group"]');
    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const pointer = { pointerId: 71, pointerType: "mouse", button: 0, buttons: 1, bubbles: true };
    source.dispatchEvent(new PointerEvent("pointerdown", {
      ...pointer,
      clientX: sourceRect.left + 20,
      clientY: sourceRect.top + sourceRect.height / 2
    }));
    window.dispatchEvent(new PointerEvent("pointermove", {
      ...pointer,
      clientX: sourceRect.left + 20,
      clientY: targetRect.top - 20
    }));
    window.dispatchEvent(new PointerEvent("pointerup", {
      ...pointer,
      buttons: 0,
      clientX: sourceRect.left + 20,
      clientY: targetRect.top - 20
    }));
  });

  await expect.poll(async () => {
    const state = await getStoredState(page);
    return state.groups.map((group) => group.id);
  }).toEqual(["gamma-group", "alpha-group", "beta-group"]);
  await expect(page.locator(".group-title-name")).toHaveText(["Gamma", "Alpha", "Beta"]);
});

test("imports shortcuts from desktop through settings", async ({ page }) => {
  await gotoApp(page);
  await page.evaluate(() => {
    window.__desktopPanelMock.setShortcutLocation("desktop", [
      { title: "Desktop App", url: "C:\\\\Tools\\\\DesktopApp.exe", shortcutIcon: "" },
      { title: "Desktop Site", url: "https://desktop.example.com", shortcutIcon: "" }
    ]);
  });

  await openSettings(page);
  await page.click("#importDesktopButton");
  await expect(page.locator("#importDesktopButton")).toHaveAttribute("data-confirming", "true");
  await expect(page.locator("#dataActionStatus")).toContainText("再次点击");
  await expect.poll(() => page.evaluate(() => window.__desktopPanelMock.state.calls.scanShortcutLocations.length)).toBe(0);
  await page.click("#importDesktopButton");

  await expect(page.locator(".tile .label")).toContainText(["Desktop App", "Desktop Site"]);
  await expect.poll(() => page.evaluate(() => window.__desktopPanelMock.state.calls.scanShortcutLocations)).toEqual([
    ["desktop"]
  ]);
});

test("batch moves, resizes, and deletes selected items", async ({ page }) => {
  await gotoAppWithState(page, {
    layout: {
      iconSize: 58,
      windowWidth: 360,
      showGroupTitle: true,
      showAddTile: false,
      showSearch: true,
      flowDirection: "ltr",
      trackCount: 3
    },
    ui: {
      collapsedGroupIds: [],
      recentItemIds: []
    },
    app: { snapToEdge: true },
    groups: [
      {
        id: "default-group",
        name: "Default",
        items: [
          { id: "alpha-item", title: "Alpha", description: "", url: "https://alpha.example.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" },
          { id: "beta-item", title: "Beta", description: "", url: "https://beta.example.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" }
        ]
      },
      {
        id: "tools-group",
        name: "Tools",
        items: [
          { id: "gamma-item", title: "Gamma", description: "", url: "https://gamma.example.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" }
        ]
      }
    ]
  });

  await longPressTile(page, '.tile[data-item-id="alpha-item"]');
  await expect(page.locator("#appShell")).toHaveAttribute("data-selection-mode", "true");
  await page.locator('.tile[data-item-id="beta-item"]').click();
  await expect(page.locator("#batchToolbar")).toBeVisible();
  await expect(page.locator("#batchCount")).toHaveText("已选择 2 项");

  await page.selectOption("#batchGroupSelect", "tools-group");
  await page.click("#batchMoveButton");
  await expect.poll(async () => {
    const state = await getStoredState(page);
    return state.groups.find((group) => group.id === "tools-group").items.map((item) => item.title);
  }).toEqual(["Gamma", "Alpha", "Beta"]);

  await longPressTile(page, '.tile[data-item-id="alpha-item"]');
  await page.selectOption("#batchSizeSelect", "2x2");
  await page.click("#batchResizeButton");
  await expect.poll(async () => {
    const state = await getStoredState(page);
    return state.groups.flatMap((group) => group.items).find((item) => item.id === "alpha-item").size;
  }).toBe("2x2");

  await page.click("#batchDeleteButton");
  await expect.poll(async () => {
    const state = await getStoredState(page);
    return state.groups.flatMap((group) => group.items).map((item) => item.id);
  }).toEqual(["gamma-item", "beta-item"]);
});

test("batch refreshes selected icons and skips custom icons", async ({ page }) => {
  const alphaIcon = svgIconDataUrl("AR", "#0369a1");
  const betaIcon = svgIconDataUrl("BR", "#16a34a");
  await gotoAppWithState(page, {
    layout: {
      iconSize: 58,
      windowWidth: 360,
      showGroupTitle: true,
      showAddTile: false,
      showSearch: true,
      flowDirection: "ltr",
      trackCount: 3
    },
    ui: { collapsedGroupIds: [], recentItemIds: [] },
    groups: [
      {
        id: "default-group",
        name: "Default",
        items: [
          { id: "alpha-item", title: "Alpha", description: "docs", url: "https://alpha.example.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" },
          { id: "beta-item", title: "Beta", description: "docs", url: "https://beta.example.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" },
          { id: "custom-item", title: "Custom", description: "", url: "https://custom.example.com", size: "1x1", iconMode: "custom", customIcon: svgIconDataUrl("CU", "#7c3aed"), shortcutIcon: "" }
        ]
      }
    ]
  });
  await page.evaluate(({ alpha, beta }) => {
    window.__desktopPanelMock.setIconSuggestions("Alpha docs alpha.example.com", [
      { id: "alpha-refreshed", name: "Alpha Refreshed", url: alpha }
    ]);
    window.__desktopPanelMock.setIconSuggestions("Beta docs beta.example.com", [
      { id: "beta-refreshed", name: "Beta Refreshed", url: beta }
    ]);
  }, { alpha: alphaIcon, beta: betaIcon });

  await longPressTile(page, '.tile[data-item-id="alpha-item"]');
  await page.locator('.tile[data-item-id="beta-item"]').click();
  await page.locator('.tile[data-item-id="custom-item"]').click();
  await page.click("#batchRefreshIconsButton");

  await expect.poll(async () => {
    const state = await getStoredState(page);
    return Object.fromEntries(state.groups[0].items.map((item) => [item.id, item.customIcon]));
  }).toMatchObject({
    "alpha-item": alphaIcon,
    "beta-item": betaIcon
  });
  await expect(page.locator("#issueCenter")).toContainText("成功 2，跳过 1，失败 0");
});

test("sorts groups by name and reports possible duplicates without deleting items", async ({ page }) => {
  await gotoAppWithState(page, {
    layout: {
      iconSize: 58,
      windowWidth: 360,
      showGroupTitle: true,
      showAddTile: false,
      showSearch: true,
      flowDirection: "ltr",
      trackCount: 3
    },
    ui: { collapsedGroupIds: [], recentItemIds: [] },
    groups: [
      {
        id: "dev-group",
        name: "开发",
        items: [
          { id: "beta-item", title: "Beta", description: "", url: "https://beta.example.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" },
          { id: "alpha-item", title: "Alpha", description: "", url: "https://alpha.example.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" }
        ]
      },
      {
        id: "docs-group",
        name: "文档",
        items: [
          { id: "docs-a", title: "Docs", description: "", url: "https://docs.example.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" },
          { id: "docs-b", title: "Docs Copy", description: "", url: "https://docs.example.com/", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" }
        ]
      }
    ]
  });

  await openSettings(page);
  await page.selectOption("#organizeGroupSelect", "dev-group");
  await page.click("#sortGroupByNameButton");
  await expect(page.locator("#sortGroupByNameButton")).toHaveAttribute("data-confirming", "true");
  await expect(page.locator("#organizeStatus")).toContainText("再次点击");
  await page.click("#sortGroupByNameButton");

  await expect.poll(async () => {
    const state = await getStoredState(page);
    return state.groups.find((group) => group.id === "dev-group").items.map((item) => item.title);
  }).toEqual(["Alpha", "Beta"]);
  await expect(page.locator("#organizeStatus")).toContainText("已按名称整理");

  await page.click("#findDuplicateItemsButton");
  await expect(page.locator("#organizeStatus")).toContainText("发现 1 组可能重复项");
  await expect.poll(async () => {
    const state = await getStoredState(page);
    return state.groups.flatMap((group) => group.items).map((item) => item.id).sort();
  }).toEqual(["alpha-item", "beta-item", "docs-a", "docs-b"]);
});

test("applies grouped suggestions only after inline confirmation", async ({ page }) => {
  await gotoAppWithState(page, {
    layout: {
      iconSize: 58,
      windowWidth: 360,
      showGroupTitle: true,
      showAddTile: false,
      showSearch: true,
      flowDirection: "ltr",
      trackCount: 3
    },
    ui: { collapsedGroupIds: [], recentItemIds: [] },
    groups: [
      {
        id: "default-group",
        name: "常用",
        items: [
          { id: "github-item", title: "GitHub", description: "code hosting", url: "https://github.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" },
          { id: "gitee-item", title: "Gitee", description: "code hosting", url: "https://gitee.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" },
          { id: "bilibili-item", title: "Bilibili", description: "视频", url: "https://bilibili.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" },
          { id: "tencent-video-item", title: "腾讯视频", description: "", url: "https://v.qq.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" }
        ]
      }
    ]
  });

  await openSettings(page);
  await page.click("#suggestGroupsButton");
  await expect(page.locator("#suggestGroupsButton")).toHaveAttribute("data-confirming", "true");
  await expect(page.locator("#organizeStatus")).toContainText("建议新建 2 个分组");
  await expect.poll(async () => (await getStoredState(page)).groups).toHaveLength(1);

  await page.click("#suggestGroupsButton");
  await expect.poll(async () => {
    const state = await getStoredState(page);
    return state.groups.map((group) => ({ name: group.name, items: group.items.map((item) => item.id) }));
  }).toEqual([
    { name: "常用", items: [] },
    { name: "开发", items: ["github-item", "gitee-item"] },
    { name: "影音", items: ["bilibili-item", "tencent-video-item"] }
  ]);
  await expect(page.locator("#organizeStatus")).toContainText("已应用 2 个分组建议");
});

test("compacts a group by placing larger icons first after confirmation", async ({ page }) => {
  await gotoAppWithState(page, {
    layout: {
      iconSize: 58,
      windowWidth: 420,
      showGroupTitle: true,
      showAddTile: false,
      showSearch: true,
      flowDirection: "ltr",
      trackCount: 3
    },
    ui: { collapsedGroupIds: [], recentItemIds: [] },
    groups: [
      {
        id: "default-group",
        name: "常用",
        items: [
          { id: "small-b", title: "Beta", description: "", url: "https://beta.example.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" },
          { id: "large-a", title: "Alpha Large", description: "", url: "https://alpha.example.com", size: "2x2", iconMode: "default", customIcon: "", shortcutIcon: "" },
          { id: "wide-c", title: "Charlie Wide", description: "", url: "https://charlie.example.com", size: "1x2", iconMode: "default", customIcon: "", shortcutIcon: "" }
        ]
      }
    ]
  });

  await openSettings(page);
  await page.click("#compactGroupButton");
  await expect(page.locator("#compactGroupButton")).toHaveAttribute("data-confirming", "true");
  await expect(page.locator("#organizeStatus")).toContainText("再次点击");
  await page.click("#compactGroupButton");

  await expect.poll(async () => {
    const state = await getStoredState(page);
    return state.groups[0].items.map((item) => item.id);
  }).toEqual(["large-a", "wide-c", "small-b"]);
  await expect(page.locator("#organizeStatus")).toContainText("已紧凑排列");
});

test("snaps the window only after the drag interaction finishes", async ({ page }) => {
  await gotoApp(page);

  await page.locator("#windowDragBand").dispatchEvent("pointerdown", {
    button: 0,
    buttons: 1,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true
  });
  await expect.poll(() => page.evaluate(() => window.__desktopPanelMock.state.calls.snapAfterDrag.length)).toBe(0);

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent("pointerup", {
      button: 0,
      buttons: 0,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      bubbles: true
    }));
  });
  await expect.poll(() => page.evaluate(() => window.__desktopPanelMock.state.calls.snapAfterDrag.length)).toBe(1);
});

test("positions add and edit dialogs 100px from the top", async ({ page }) => {
  await gotoApp(page);

  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Missing viewport size");

  await openAppContextMenu(page);
  await page.locator('#appContextMenu [data-action="add-icon"]').click();
  await expect.poll(async () => page.locator("#addDialog").evaluate((node) => node.open)).toBe(true);
  const addDialogBox = await page.locator("#addDialog").boundingBox();
  expect(addDialogBox).toBeTruthy();
  expect(Math.abs(addDialogBox.x + addDialogBox.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(8);
  expect(addDialogBox.y).toBeGreaterThanOrEqual(96);
  expect(addDialogBox.y).toBeLessThanOrEqual(104);

  await page.locator("#cancelAddDialog").click();
  await expect.poll(async () => page.locator("#addDialog").evaluate((node) => node.open)).toBe(false);

  await openItemContextMenu(page, 0);
  await page.locator('#itemContextMenu [data-action="edit-item"]').click();
  await expect.poll(async () => page.locator("#editDialog").evaluate((node) => node.open)).toBe(true);
  const editDialogBox = await page.locator("#editDialog").boundingBox();
  expect(editDialogBox).toBeTruthy();
  expect(Math.abs(editDialogBox.x + editDialogBox.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(8);
  expect(editDialogBox.y).toBeGreaterThanOrEqual(96);
  expect(editDialogBox.y).toBeLessThanOrEqual(104);
});

test("edits, duplicates, and deletes items through the item context menu", async ({ page }) => {
  await gotoApp(page);

  await openItemContextMenu(page, 0);
  await page.locator('#itemContextMenu [data-action="edit-item"]').click();
  await expect.poll(async () => page.locator("#editDialog").evaluate((node) => node.open)).toBe(true);

  await page.fill("#editTitleInput", "Knowledge Hub");
  await page.fill("#editDescriptionInput", "reference site");
  await page.fill("#editUrlInput", "docs.example.com");
  await page.selectOption("#editSizeSelect", "2x2");
  await page.locator('#editForm button[type="submit"]').click();

  await expect(page.locator(".tile").first()).toHaveAttribute("data-size", "2x2");
  await expect(page.locator(".tile .label").first()).toHaveText("Knowledge Hub");

  await openItemContextMenu(page, 0);
  await page.locator('#itemContextMenu [data-action="duplicate-item"]').click();
  await expect(page.locator(".tile")).toHaveCount(3);

  await openItemContextMenu(page, 1);
  await page.locator('#itemContextMenu [data-action="delete-item"]').click();
  await expect(page.locator(".tile")).toHaveCount(2);

  const state = await getStoredState(page);
  const editedItems = state.groups[0].items.filter((item) => item.title === "Knowledge Hub");
  expect(editedItems).toHaveLength(1);
  expect(editedItems[0].url).toBe("https://docs.example.com");
});

test("updates settings and calls desktop integration hooks", async ({ page }) => {
  await gotoApp(page);
  await openSettings(page);

  await page.check("#showAddTileInput");
  await page.uncheck("#showGroupTitleInput");
  await page.selectOption("#layoutDirectionInput", "rtl");
  await setRangeValue(page, "#trackCountInput", 9);
  await commitRangeValue(page, "#windowWidthInput", 420);
  await page.uncheck("#snapEdgeInput");
  await page.check("#launchAtLoginInput");

  await expect(page.locator(".add-tile")).toHaveCount(1);
  await expect(page.locator(".group-title")).toHaveCount(0);
  await expect(page.locator("#appShell")).toHaveAttribute("data-flow", "rtl");

  await expect.poll(() => page.evaluate(() => ({
    lastWindowSize: window.__desktopPanelMock.state.calls.setWindowSize.at(-1),
    lastSnapEnabled: window.__desktopPanelMock.state.calls.setSnapEnabled.at(-1),
    setLaunchAtLogin: window.__desktopPanelMock.state.calls.setLaunchAtLogin,
    trackCount: getComputedStyle(document.documentElement).getPropertyValue("--track-count").trim()
  }))).toEqual({
    lastWindowSize: [420, undefined],
    lastSnapEnabled: false,
    setLaunchAtLogin: [true],
    trackCount: "9"
  });
});

test("shows release info, checks updates, installs updates, and copies a privacy-safe feedback summary", async ({ page }) => {
  await gotoAppWithState(page, {
    layout: {
      iconSize: 58,
      windowWidth: 360,
      showGroupTitle: true,
      showAddTile: false,
      showSearch: true,
      showRecent: true,
      flowDirection: "ltr",
      trackCount: 3,
      layoutPreset: "standard",
      theme: "aurora"
    },
    ui: {
      collapsedGroupIds: [],
      recentItemIds: []
    },
    app: {
      snapToEdge: true,
      drawerModeEnabled: true,
      drawerEdge: "right",
      drawerTrigger: "click",
      autoBackupEnabled: true,
      backupDirectory: "C:\\\\Private\\\\Backups"
    },
    groups: [
      {
        id: "default-group",
        name: "Private Group",
        items: [
          { id: "secret-item", title: "Secret", description: "", url: "C:\\\\Private\\\\Secret.exe", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" }
        ]
      }
    ]
  });

  await page.evaluate(() => {
    window.__copiedText = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText(text) {
          window.__copiedText = String(text || "");
          return Promise.resolve();
        }
      }
    });
  });

  await openSettings(page);
  await expect(page.locator("#appVersionLabel")).toHaveText("当前版本 v1.2.2");

  await page.evaluate(() => {
    window.__desktopPanelMock.setUpdateResult({ available: false, checked: true });
  });
  await page.click("#checkUpdatesButton");
  await expect(page.locator("#feedbackSummaryStatus")).toContainText("当前已是最新版本");

  await page.evaluate(() => {
    window.__desktopPanelMock.setUpdateResult({
      available: true,
      version: "1.2.3",
      notes: "自动更新测试版本"
    });
  });
  await page.click("#checkUpdatesButton");
  await expect(page.locator("#feedbackSummaryStatus")).toContainText("发现新版本 v1.2.3");
  await expect(page.locator("#installUpdateButton")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.click("#installUpdateButton");
  await expect.poll(() => page.evaluate(() => window.__desktopPanelMock.state.calls.installUpdate.length)).toBe(1);
  await expect(page.locator("#feedbackSummaryStatus")).toContainText("下载完成");

  await page.click("#copyFeedbackSummaryButton");
  const summary = await page.evaluate(() => window.__copiedText);
  expect(summary).toContain("Mini Desk Tool 反馈摘要");
  expect(summary).toContain("版本：v1.2.2");
  expect(summary).toContain('"drawerModeEnabled": true');
  expect(summary).not.toContain("Secret.exe");
  expect(summary).not.toContain("Private Group");
  expect(summary).not.toContain("Private\\\\Backups");
  await expect(page.locator("#feedbackSummaryStatus")).toContainText("反馈摘要已复制");
});

test("shows an update check failure without closing settings", async ({ page }) => {
  await gotoApp(page);
  await openSettings(page);

  await page.evaluate(() => {
    window.__desktopPanelMock.setUpdateResult(new Error("Could not fetch a valid release JSON from the remote"));
  });
  await page.click("#checkUpdatesButton");

  await expect(page.locator("#settingsDialog")).toHaveJSProperty("open", true);
  await expect(page.locator("#feedbackSummaryStatus")).toContainText("检查更新失败");
  await expect(page.locator("#feedbackSummaryStatus")).toContainText("latest.json");
  await expect(page.locator("#feedbackSummaryStatus")).toContainText(".sig 签名文件");
});

test("navigates settings sections with the floating icon rail", async ({ page }) => {
  await gotoApp(page);
  await openSettings(page);

  await expect(page.locator("#settingsNav")).toBeVisible();
  const appearanceLabel = page.locator('.settings-nav-button[data-target-section="appearance"] .settings-nav-label');
  await expect(appearanceLabel).toHaveCSS("opacity", "0");
  await page.locator('.settings-nav-button[data-target-section="appearance"]').hover();
  await expect(appearanceLabel).toHaveCSS("opacity", "1");

  await page.locator('.settings-nav-button[data-target-section="window"]').click();
  await expect(page.locator('.settings-nav-button[data-target-section="window"]')).toHaveClass(/is-active/);
  await expect(page.locator('[data-settings-section="window"]')).toHaveClass(/is-jump-target/);
  await expect.poll(() => page.evaluate(() => document.activeElement?.dataset?.settingsSection)).toBe("window");
  await expect.poll(() => page.evaluate(() => {
    const section = document.querySelector('[data-settings-section="window"]');
    const form = document.querySelector("#settingsForm");
    const sectionRect = section.getBoundingClientRect();
    const formRect = form.getBoundingClientRect();
    return sectionRect.top >= formRect.top && sectionRect.top < formRect.bottom;
  })).toBe(true);
});

test("closes menus and dialogs with Escape", async ({ page }) => {
  await gotoApp(page);

  await openAppContextMenu(page);
  await page.keyboard.press("Escape");
  await expect(page.locator("#appContextMenu")).toBeHidden();

  await openAppContextMenu(page);
  await page.locator('#appContextMenu [data-action="add-icon"]').click();
  await expect.poll(async () => page.locator("#addDialog").evaluate((node) => node.open)).toBe(true);
  await page.keyboard.press("Escape");
  await expect.poll(async () => page.locator("#addDialog").evaluate((node) => node.open)).toBe(false);

  await openItemContextMenu(page, 0);
  await page.locator('#itemContextMenu [data-action="edit-item"]').click();
  await expect.poll(async () => page.locator("#editDialog").evaluate((node) => node.open)).toBe(true);
  await page.keyboard.press("Escape");
  await expect.poll(async () => page.locator("#editDialog").evaluate((node) => node.open)).toBe(false);

  await openSettings(page);
  await page.keyboard.press("Escape");
  await expect.poll(async () => page.locator("#settingsDialog").evaluate((node) => node.open)).toBe(false);
});

test("configures window behavior settings", async ({ page }) => {
  await gotoApp(page);
  await openSettings(page);

  await page.check("#autoHideOnBlurInput");
  await page.selectOption("#snapEdgeSelect", "left");
  await setRangeValue(page, "#snapDistanceInput", 24);
  await setRangeValue(page, "#revealDelayInput", 400);
  await page.check("#drawerModeEnabledInput");
  await page.selectOption("#drawerEdgeSelect", "left");
  await page.selectOption("#drawerTriggerSelect", "click");
  await setRangeValue(page, "#drawerDelayInput", 800);
  await expect.poll(() => page.evaluate(() => window.__desktopPanelMock.state.calls.configureWindowBehavior.at(-1))).toEqual({
    autoHideEnabled: true,
    snapEdge: "left",
    snapDistance: 24,
    revealDelayMs: 400,
    drawerEnabled: true,
    drawerEdge: "left",
    drawerDelayMs: 800,
    reduceMotion: false
  });
  await expect(page.locator("#snapDistanceHint")).toHaveText("当前吸附距离 24 px。");
  await expect(page.locator("#revealDelayHint")).toHaveText("当前唤出延迟 400 ms。");

  await page.check("#globalShortcutEnabledInput");
  await expect.poll(() => page.evaluate(() => window.__desktopPanelMock.state.calls.configureGlobalShortcut.at(-1))).toEqual({
    enabled: true,
    shortcut: "CommandOrControl+Alt+Space"
  });
  await expect(page.locator("#globalShortcutStatus")).toContainText("已启用");

  await page.locator("#globalShortcutInput").focus();
  await page.keyboard.press("Control+Shift+M");
  await expect.poll(() => page.evaluate(() => window.__desktopPanelMock.state.calls.configureGlobalShortcut.at(-1))).toEqual({
    enabled: true,
    shortcut: "CommandOrControl+Shift+M"
  });

  await page.click("#cancelSettingsDialog");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect.poll(() => page.evaluate(() => window.__desktopPanelMock.state.calls.setDrawerCollapsed.at(-1))).toBe(true);

  const state = await getStoredState(page);
  expect(state.app.autoHideOnBlur).toBe(true);
  expect(state.app.snapEdge).toBe("left");
  expect(state.app.snapDistance).toBe(24);
  expect(state.app.revealDelay).toBe(400);
  expect(state.app.drawerModeEnabled).toBe(true);
  expect(state.app.drawerEdge).toBe("left");
  expect(state.app.drawerCollapseDelay).toBe(800);
  expect(state.app.drawerTrigger).toBe("click");
  expect(state.app.globalShortcutEnabled).toBe(true);
  expect(state.app.globalShortcut).toBe("CommandOrControl+Shift+M");
});

test("shows and expands the drawer handle when drawer mode is enabled", async ({ page }) => {
  await gotoApp(page);
  await openSettings(page);

  await page.check("#drawerModeEnabledInput");
  await page.selectOption("#drawerEdgeSelect", "right");
  await page.selectOption("#drawerTriggerSelect", "click");
  await setRangeValue(page, "#drawerDelayInput", 0);
  await page.click("#cancelSettingsDialog");
  await expect.poll(async () => page.locator("#settingsDialog").evaluate((node) => node.open)).toBe(false);

  await expect(page.locator("#drawerHandle")).toHaveAttribute("aria-hidden", "false");
  await expect.poll(() => page.locator("#appShell").evaluate((node) => node.dataset.drawerCollapsed)).toBe("false");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect.poll(() => page.locator("#appShell").evaluate((node) => node.dataset.drawerCollapsed)).toBe("true");
  await expect(page.locator("#drawerHandle")).toBeVisible();

  await page.locator("#drawerHandle").click();
  await expect.poll(() => page.evaluate(() => window.__desktopPanelMock.state.calls.setDrawerCollapsed.at(-1))).toBe(false);
  await expect.poll(() => page.locator("#appShell").evaluate((node) => node.dataset.drawerCollapsed)).toBe("false");
});

test("uses hover intent before expanding the drawer handle", async ({ page }) => {
  await gotoApp(page);
  await openSettings(page);

  await page.check("#drawerModeEnabledInput");
  await page.selectOption("#drawerEdgeSelect", "right");
  await setRangeValue(page, "#drawerDelayInput", 0);
  await page.click("#cancelSettingsDialog");
  await expect.poll(async () => page.locator("#settingsDialog").evaluate((node) => node.open)).toBe(false);
  await page.evaluate(() => {
    document.querySelector("#appShell").dataset.drawerCollapsed = "true";
    return window.desktopPanel.setDrawerCollapsed(true);
  });
  await expect.poll(() => page.locator("#appShell").evaluate((node) => node.dataset.drawerCollapsed)).toBe("true");

  await page.locator("#drawerHandle").hover();
  await page.waitForTimeout(80);
  await expect.poll(() => page.evaluate(() => window.__desktopPanelMock.state.calls.setDrawerCollapsed.at(-1))).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__desktopPanelMock.state.calls.setDrawerCollapsed.at(-1))).toBe(false);
});

test("records global shortcuts from keyboard input", async ({ page }) => {
  await gotoApp(page);
  await openSettings(page);

  await page.check("#globalShortcutEnabledInput");
  await page.locator("#globalShortcutInput").focus();
  await page.keyboard.press("Control+Alt+KeyK");

  await expect(page.locator("#globalShortcutInput")).toHaveValue("CommandOrControl+Alt+K");
  await expect.poll(() => page.evaluate(() => window.__desktopPanelMock.state.calls.configureGlobalShortcut.at(-1))).toEqual({
    enabled: true,
    shortcut: "CommandOrControl+Alt+K"
  });

  await page.keyboard.press("Escape");
  await expect(page.locator("#globalShortcutInput")).toHaveValue("CommandOrControl+Alt+Space");
  await page.keyboard.press("Escape");
  await expect.poll(async () => page.locator("#settingsDialog").evaluate((node) => node.open)).toBe(false);
});

test("applies layout presets and appearance settings", async ({ page }) => {
  await gotoApp(page);
  await openSettings(page);

  await page.selectOption("#layoutPresetSelect", "wide");
  await expect.poll(() => page.evaluate(() => ({
    trackCount: getComputedStyle(document.documentElement).getPropertyValue("--track-count").trim(),
    lastWindowSize: window.__desktopPanelMock.state.calls.setWindowSize.at(-1),
    showLabels: document.querySelector("#appShell").dataset.showLabels
  }))).toEqual({
    trackCount: "4",
    lastWindowSize: [520, undefined],
    showLabels: "true"
  });

  await page.selectOption("#layoutPresetSelect", "compact");
  await expect.poll(() => page.evaluate(() => ({
    trackCount: getComputedStyle(document.documentElement).getPropertyValue("--track-count").trim(),
    lastWindowSize: window.__desktopPanelMock.state.calls.setWindowSize.at(-1),
    showLabels: document.querySelector("#appShell").dataset.showLabels
  }))).toEqual({
    trackCount: "3",
    lastWindowSize: [300, undefined],
    showLabels: "false"
  });

  await page.selectOption("#themeSelect", "sand");
  await setRangeValue(page, "#panelOpacityInput", 88);
  await page.selectOption("#fontFamilySelect", "mono");
  await page.locator("#textColorInput").evaluate((input) => {
    input.value = "#ffe7a3";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#appearanceHint")).toContainText("暖沙金");
  await expect.poll(() => page.evaluate(() => ({
    theme: document.querySelector("#appShell").dataset.theme,
    accent: getComputedStyle(document.documentElement).getPropertyValue("--theme-accent").trim(),
    surface: getComputedStyle(document.documentElement).getPropertyValue("--theme-surface-rgb").trim(),
    font: getComputedStyle(document.documentElement).getPropertyValue("--app-font-family").trim(),
    textColor: getComputedStyle(document.documentElement).getPropertyValue("--text-color").trim(),
    searchColor: getComputedStyle(document.querySelector("#searchInput")).color,
    settingsTitleColor: getComputedStyle(document.querySelector("#settingsDialog h2")).color,
    alpha: getComputedStyle(document.documentElement).getPropertyValue("--panel-alpha").trim()
  }))).toEqual({
    theme: "sand",
    accent: "#ffd27a",
    surface: "34, 27, 20",
    font: "\"Cascadia Mono\", \"Consolas\", monospace",
    textColor: "#ffe7a3",
    searchColor: "rgb(255, 231, 163)",
    settingsTitleColor: "rgb(255, 231, 163)",
    alpha: "0.88"
  });
  const transparencyVars = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    return {
      soft: Number(styles.getPropertyValue("--panel-alpha-soft")),
      glow: Number(styles.getPropertyValue("--panel-bg-glow")),
      tile: Number(styles.getPropertyValue("--tile-alpha"))
    };
  });
  expect(transparencyVars.soft).toBeGreaterThan(0.54);
  expect(transparencyVars.glow).toBeGreaterThan(0.18);
  expect(transparencyVars.tile).toBeGreaterThan(0.2);

  const state = await getStoredState(page);
  expect(state.layout.layoutPreset).toBe("compact");
  expect(state.layout.theme).toBe("sand");
  expect(state.layout.fontFamily).toBe("mono");
  expect(state.layout.textColor).toBe("#ffe7a3");
  expect(state.layout.panelOpacity).toBe(88);
  expect(state.layout.searchEngine).toBe("bing");
});

test("supports custom appearance themes", async ({ page }) => {
  await gotoApp(page);
  await openSettings(page);

  await page.selectOption("#themeSelect", "custom");
  await expect(page.locator("#customThemeFields")).toBeVisible();
  await page.fill("#customThemeNameInput", "Ocean");
  await page.locator("#customThemeAccentInput").evaluate((input) => {
    input.value = "#12c7b8";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.locator("#customThemeAccent2Input").evaluate((input) => {
    input.value = "#3d6cff";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.locator("#customThemeSurfaceInput").evaluate((input) => {
    input.value = "#101820";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  await expect(page.locator("#appearanceHint")).toContainText("Ocean");
  await expect.poll(() => page.evaluate(() => ({
    theme: document.querySelector("#appShell").dataset.theme,
    accent: getComputedStyle(document.documentElement).getPropertyValue("--theme-accent").trim(),
    accent2: getComputedStyle(document.documentElement).getPropertyValue("--theme-accent-2").trim(),
    surface: getComputedStyle(document.documentElement).getPropertyValue("--theme-surface-rgb").trim()
  }))).toEqual({
    theme: "custom",
    accent: "#12c7b8",
    accent2: "#3d6cff",
    surface: "16, 24, 32"
  });

  const state = await getStoredState(page);
  expect(state.layout.theme).toBe("custom");
  expect(state.layout.customTheme).toEqual({
    label: "Ocean",
    accent: "#12c7b8",
    accent2: "#3d6cff",
    surface: "#101820"
  });
});

test("changes the default search engine from settings", async ({ page }) => {
  await gotoApp(page);
  await openSettings(page);

  await page.selectOption("#settingsSearchEngineSelect", "duckduckgo");
  await expect(page.locator("#searchEngineHint")).toContainText("DuckDuckGo");
  await expect(page.locator("#searchEngineSelect")).toHaveValue("duckduckgo");

  await page.click("#cancelSettingsDialog");
  await page.fill("#searchInput", "mini desk");
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.__desktopPanelMock.state.calls.openUrl.at(-1))).toBe(
    "https://duckduckgo.com/?q=mini%20desk"
  );

  const state = await getStoredState(page);
  expect(state.layout.searchEngine).toBe("duckduckgo");
});

test("switches profiles without losing profile-specific items", async ({ page }) => {
  await gotoAppWithState(page, {
    layout: {
      iconSize: 58,
      windowWidth: 360,
      showGroupTitle: true,
      showAddTile: false,
      showSearch: true,
      showRecent: true,
      flowDirection: "ltr",
      trackCount: 3
    },
    ui: {
      collapsedGroupIds: [],
      recentItemIds: []
    },
    app: { snapToEdge: true },
    groups: [
      {
        id: "group-default",
        name: "Default",
        items: [
          { id: "alpha-item", title: "Alpha", description: "", url: "https://alpha.example.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" }
        ]
      }
    ]
  });
  await openSettings(page);
  await page.fill("#profileNameInput", "Work");
  await page.click("#createProfileButton");
  await expect(page.locator("#profileStatus")).toContainText("Work");
  await page.click("#cancelSettingsDialog");

  await openAppContextMenu(page);
  await page.locator('#appContextMenu [data-action="add-icon"]').click();
  await page.fill("#addTitleInput", "Work Tool");
  await page.fill("#addUrlInput", "https://work.example.com");
  await page.locator('#addForm button[type="submit"]').click();
  await expect(page.locator(".tile .label")).toHaveText(["Work Tool", "Alpha"]);

  await openSettings(page);
  await page.selectOption("#profileSelect", { label: "默认配置" });
  await expect(page.locator(".tile .label")).toHaveText(["Alpha"]);

  await page.selectOption("#profileSelect", { label: "Work" });
  await expect(page.locator(".tile .label")).toHaveText(["Work Tool", "Alpha"]);

  const state = await getStoredState(page);
  expect(state.profiles.map((profile) => profile.name)).toEqual(expect.arrayContaining(["默认配置", "Work"]));
  expect(state.activeProfileId).toBe(state.profiles.find((profile) => profile.name === "Work").id);
});

test("keeps the settings dialog open while applying settings", async ({ page }) => {
  await gotoApp(page);
  await openSettings(page);

  await setRangeValue(page, "#iconSizeInput", 64);
  await expect.poll(async () => page.locator("#settingsDialog").evaluate((node) => node.open)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__desktopPanelMock.state.calls.setWindowSize.length)).toBe(1);

  await commitRangeValue(page, "#windowWidthInput", 420);
  await expect.poll(async () => page.locator("#settingsDialog").evaluate((node) => node.open)).toBe(true);

  await page.check("#showAddTileInput");
  await expect.poll(async () => page.locator("#settingsDialog").evaluate((node) => node.open)).toBe(true);

  await page.selectOption("#layoutDirectionInput", "rtl");
  await expect.poll(async () => page.locator("#settingsDialog").evaluate((node) => node.open)).toBe(true);

  await setRangeValue(page, "#trackCountInput", 9);
  await expect.poll(async () => page.locator("#settingsDialog").evaluate((node) => node.open)).toBe(true);
});

test("clamps stored window widths to the 300px minimum", async ({ page }) => {
  await page.addInitScript({ path: mockScriptPath });
  await page.addInitScript(({ storageKey }) => {
    window.localStorage.setItem(storageKey, JSON.stringify({
      layout: {
        iconSize: 58,
        windowWidth: 240,
        showGroupTitle: true,
        showAddTile: false,
        flowDirection: "ltr",
        trackCount: 3
      },
      app: {
        snapToEdge: true
      },
      groups: [
        {
          id: "group-default",
          name: "Default",
          items: [
            {
              id: "zhihu-item",
              title: "Zhihu",
              description: "",
              url: "https://www.zhihu.com",
              size: "1x1",
              iconMode: "default",
              customIcon: "",
              shortcutIcon: ""
            },
            {
              id: "qq-video-item",
              title: "QQ Video",
              description: "",
              url: "https://v.qq.com",
              size: "1x1",
              iconMode: "default",
              customIcon: "",
              shortcutIcon: ""
            }
          ]
        }
      ]
    }));
  }, { storageKey: STORAGE_KEY });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".tile")).toHaveCount(2);

  await expect(page.locator("#windowWidthInput")).toHaveAttribute("min", "300");
  await expect.poll(() => page.evaluate(() => window.__desktopPanelMock.state.calls.setWindowSize.at(-1))).toEqual([
    300,
    undefined
  ]);
  await openSettings(page);
  await expect(page.locator("#windowWidthInput")).toHaveValue("300");
});

test("exports, imports, and auto-groups items from settings", async ({ page }) => {
  await gotoApp(page);
  await openSettings(page);

  await page.click("#exportDataButton");
  const exportedPayload = await page.evaluate(() => window.__desktopPanelMock.state.calls.exportStateFile[0]);
  const parsed = JSON.parse(exportedPayload);
  expect(parsed.app).toBe("Mini Desk Tool");
  expect(parsed.state.groups).toHaveLength(1);

  await page.evaluate(() => {
    window.__desktopPanelMock.setImportPayload({
      state: {
        layout: {
          iconSize: 58,
          windowWidth: 360,
          showGroupTitle: true,
          showAddTile: false,
          flowDirection: "ltr",
          trackCount: 3
        },
        app: { snapToEdge: true },
        groups: [
          {
            id: "group-default",
            name: "Mixed",
            items: [
              { id: "github-item", title: "GitHub", description: "code hosting", url: "https://github.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" },
              { id: "gmail-item", title: "Gmail", description: "mail inbox", url: "https://mail.google.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" }
            ]
          }
        ]
      }
    });
  });

  await page.click("#importDataButton");
  await expect(page.locator(".tile .label")).toContainText(["GitHub", "Gmail"]);

  await page.click("#autoGroupButton");
  await expect(page.locator(".group")).toHaveCount(2);
});

test("configures backup directory and writes manual backups", async ({ page }) => {
  await gotoApp(page);
  await openSettings(page);

  await page.evaluate(() => {
    window.__desktopPanelMock.setBackupDirectory("C:\\\\MiniDeskBackups");
  });
  await page.click("#chooseBackupDirectoryButton");
  await expect(page.locator("#autoBackupEnabledInput")).toBeChecked();
  await expect(page.locator("#backupStatus")).toContainText("MiniDeskBackups");

  await page.click("#backupNowButton");
  await expect.poll(() => page.evaluate(() => window.__desktopPanelMock.state.calls.writeBackupFile.at(-1))).toMatchObject({
    directory: expect.stringContaining("MiniDeskBackups"),
    retention: 5
  });

  const stored = await getStoredState(page);
  expect(stored.app.autoBackupEnabled).toBe(true);
  expect(stored.app.backupDirectory).toContain("MiniDeskBackups");
  expect(stored.app.lastBackupPath).toContain("desktop-panel-backup");
});

test("creates a restore point before import and restores it from settings", async ({ page }) => {
  await gotoAppWithState(page, {
    layout: {
      iconSize: 58,
      windowWidth: 360,
      showGroupTitle: true,
      showAddTile: false,
      showSearch: true,
      flowDirection: "ltr",
      trackCount: 3
    },
    ui: {
      collapsedGroupIds: [],
      recentItemIds: []
    },
    app: {
      snapToEdge: true,
      autoBackupEnabled: true,
      backupDirectory: "C:\\MiniDeskBackups",
      backupRetention: 2
    },
    groups: [
      {
        id: "group-default",
        name: "Default",
        items: [
          { id: "alpha-item", title: "Alpha", description: "", url: "https://alpha.example.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" }
        ]
      }
    ]
  });
  await expect(page.locator(".tile .label")).toHaveText(["Alpha"]);
  await openSettings(page);

  await page.evaluate(() => {
    window.__desktopPanelMock.setImportPayload({
      state: {
        layout: {
          iconSize: 58,
          windowWidth: 360,
          showGroupTitle: true,
          showAddTile: false,
          showSearch: true,
          flowDirection: "ltr",
          trackCount: 3
        },
        app: { snapToEdge: true },
        groups: [
          {
            id: "group-default",
            name: "Imported",
            items: [
              { id: "beta-item", title: "Beta", description: "", url: "https://beta.example.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" }
            ]
          }
        ]
      }
    });
  });

  await page.click("#importDataButton");
  await expect(page.locator(".tile .label")).toHaveText(["Beta"]);
  await expect.poll(() => page.evaluate(() => window.__desktopPanelMock.state.calls.writeBackupFile.at(-1))).toMatchObject({
    directory: expect.stringContaining("MiniDeskBackups"),
    retention: 2
  });

  await page.click("#restorePointButton");
  await expect(page.locator(".tile .label")).toHaveText(["Alpha"]);
});

test("keeps current data when import fails and shows the issue center", async ({ page }) => {
  await gotoApp(page);
  await openSettings(page);

  await page.evaluate(() => {
    window.__desktopPanelMock.setRawImportContent("{not-json");
  });
  await page.click("#importDataButton");

  await expect(page.locator(".tile .label")).toHaveText(["知乎", "腾讯视频"]);
  await expect(page.locator("#issueCenter")).toBeVisible();
  await expect(page.locator("#issueList")).toContainText("导入失败");
  await expect(page.locator("#issueCenter")).toBeHidden({ timeout: 7000 });
});

test("imports dropped shortcuts and enriches their icons in the background", async ({ page }) => {
  await gotoApp(page);

  await page.evaluate(({ shortcutPath, icon }) => {
    window.__desktopPanelMock.setDroppedShortcut(shortcutPath, {
      title: "Tool Link",
      url: "https://example.com/tools",
      shortcutIcon: ""
    });
    window.__desktopPanelMock.setIconSuggestions("Tool Link", [
      { id: "tool-icon", name: "Tool Link", url: icon }
    ]);
  }, {
    shortcutPath: "C:\\\\Links\\\\Tool Link.lnk",
    icon: svgIconDataUrl("TL", "#059669")
  });

  await page.evaluate((shortcutPath) => {
    const grid = document.querySelector(".group-grid");
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
      value: {
        types: ["Files"],
        files: [{ path: shortcutPath }],
        dropEffect: "copy"
      }
    });
    grid.dispatchEvent(event);
  }, "C:\\\\Links\\\\Tool Link.lnk");

  await expect(page.locator(".tile .label")).toContainText(["Tool Link"]);
  await expect.poll(() => page.evaluate(() => window.__desktopPanelMock.state.calls.resolveDroppedPaths)).toHaveLength(1);
  await expect.poll(() => page.evaluate(() => window.__desktopPanelMock.state.calls.resolveDroppedPaths[0][0])).toContain("Tool Link.lnk");

  await expect.poll(async () => {
    const state = await getStoredState(page);
    const importedItem = state.groups[0].items.find((item) => item.title === "Tool Link");
    return importedItem ? { iconMode: importedItem.iconMode, customIcon: importedItem.customIcon } : null;
  }).toEqual({
    iconMode: "custom",
    customIcon: svgIconDataUrl("TL", "#059669")
  });
});

test("imports native desktop drag drop payloads from tauri", async ({ page }) => {
  await gotoApp(page);

  await page.evaluate(({ shortcutPath, icon }) => {
    window.__desktopPanelMock.setDroppedShortcut(shortcutPath, {
      title: "Native Tool",
      url: "https://example.com/native-tool",
      shortcutIcon: ""
    });
    window.__desktopPanelMock.setIconSuggestions("Native Tool", [
      { id: "native-tool-icon", name: "Native Tool", url: icon }
    ]);
  }, {
    shortcutPath: "C:\\\\Links\\\\Native Tool.lnk",
    icon: svgIconDataUrl("NT", "#7c3aed")
  });

  await page.evaluate((shortcutPath) => {
    const grid = document.querySelector(".group-grid");
    const rect = grid.getBoundingClientRect();
    window.__desktopPanelMock.emitNativeDragDrop({
      type: "drop",
      paths: [shortcutPath],
      position: {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      }
    });
  }, "C:\\\\Links\\\\Native Tool.lnk");

  await expect(page.locator(".tile .label")).toContainText(["Native Tool"]);
  await expect.poll(() => page.evaluate(() => window.__desktopPanelMock.state.calls.resolveDroppedPaths)).toHaveLength(1);
});

test("drops native desktop shortcuts into the hovered group", async ({ page }) => {
  await gotoAppWithState(page, {
    layout: {
      iconSize: 58,
      windowWidth: 360,
      showGroupTitle: true,
      showAddTile: false,
      showSearch: true,
      flowDirection: "ltr",
      trackCount: 3
    },
    ui: {
      collapsedGroupIds: [],
      recentItemIds: []
    },
    app: { snapToEdge: true },
    groups: [
      {
        id: "default-group",
        name: "Default",
        items: [
          { id: "alpha-item", title: "Alpha", description: "", url: "https://alpha.example.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" }
        ]
      },
      {
        id: "tools-group",
        name: "Tools",
        items: [
          { id: "beta-item", title: "Beta", description: "", url: "https://beta.example.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" }
        ]
      }
    ]
  });

  await page.evaluate((shortcutPath) => {
    window.__desktopPanelMock.setDroppedShortcut(shortcutPath, {
      title: "Hovered Tool",
      url: "https://example.com/hovered",
      shortcutIcon: ""
    });

    const title = document.querySelector('.group[data-group-id="tools-group"] .group-title');
    const rect = title.getBoundingClientRect();
    window.__desktopPanelMock.emitNativeDragDrop({
      type: "over",
      paths: [shortcutPath],
      position: {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      }
    });
  }, "C:\\\\Links\\\\Hovered Tool.lnk");

  await expect(page.locator('.group[data-group-id="tools-group"]')).toHaveClass(/group-drop-target/);

  await page.evaluate((shortcutPath) => {
    const title = document.querySelector('.group[data-group-id="tools-group"] .group-title');
    const rect = title.getBoundingClientRect();
    window.__desktopPanelMock.emitNativeDragDrop({
      type: "drop",
      paths: [shortcutPath],
      position: {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      }
    });
  }, "C:\\\\Links\\\\Hovered Tool.lnk");

  await expect(page.locator('.group[data-group-id="tools-group"] .tile .label')).toHaveText(["Hovered Tool", "Beta"]);
  await expect(page.locator('.group[data-group-id="default-group"] .tile .label')).toHaveText(["Alpha"]);
});

test("normalizes native physical drag coordinates before resolving the hovered group", async ({ page }) => {
  await gotoAppWithState(page, {
    layout: {
      iconSize: 58,
      windowWidth: 360,
      showGroupTitle: true,
      showAddTile: false,
      showSearch: true,
      flowDirection: "ltr",
      trackCount: 3
    },
    ui: {
      collapsedGroupIds: [],
      recentItemIds: []
    },
    app: { snapToEdge: true },
    groups: [
      {
        id: "default-group",
        name: "Default",
        items: [
          { id: "alpha-item", title: "Alpha", description: "", url: "https://alpha.example.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" }
        ]
      },
      {
        id: "tools-group",
        name: "Tools",
        items: [
          { id: "beta-item", title: "Beta", description: "", url: "https://beta.example.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" }
        ]
      }
    ]
  });

  await page.evaluate((shortcutPath) => {
    window.__desktopPanelMock.setDroppedShortcut(shortcutPath, {
      title: "Scaled Tool",
      url: "https://example.com/scaled",
      shortcutIcon: ""
    });

    const title = document.querySelector('.group[data-group-id="tools-group"] .group-title');
    const rect = title.getBoundingClientRect();
    const scaleFactor = 2;
    window.__desktopPanelMock.emitNativeDragDrop({
      type: "drop",
      paths: [shortcutPath],
      scaleFactor,
      position: {
        x: (rect.left + rect.width / 2) * scaleFactor,
        y: (rect.top + rect.height / 2) * scaleFactor
      }
    });
  }, "C:\\\\Links\\\\Scaled Tool.lnk");

  await expect(page.locator('.group[data-group-id="tools-group"] .tile .label')).toHaveText(["Scaled Tool", "Beta"]);
  await expect(page.locator('.group[data-group-id="default-group"] .tile .label')).toHaveText(["Alpha"]);
});

test("clears drop state and shows a hint when dropped shortcuts cannot be resolved", async ({ page }) => {
  await gotoApp(page);

  await page.evaluate((shortcutPath) => {
    const grid = document.querySelector(".group-grid");
    const rect = grid.getBoundingClientRect();
    window.__desktopPanelMock.emitNativeDragDrop({
      type: "drop",
      paths: [shortcutPath],
      position: {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      }
    });
  }, "C:\\\\Links\\\\Missing Target.lnk");

  await expect(page.locator(".tile")).toHaveCount(2);
  await expect(page.locator("#dragToast")).toHaveText("没有识别到可添加的快捷方式");
  await expect(page.locator(".group-grid.drop-target")).toHaveCount(0);
});

test("shows a hint when desktop shortcuts are dropped in the browser preview", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".tile")).toHaveCount(2);

  await page.evaluate((shortcutPath) => {
    const grid = document.querySelector(".group-grid");
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
      value: {
        types: ["Files"],
        files: [{ path: shortcutPath }],
        dropEffect: "copy"
      }
    });
    grid.dispatchEvent(event);
  }, "C:\\\\Links\\\\Browser Only.lnk");

  await expect(page.locator("#dragToast")).toHaveText("浏览器预览页不支持桌面快捷方式导入，请在 Tauri 客户端中测试");
});
