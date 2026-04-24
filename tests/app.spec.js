const path = require("path");
const { test, expect } = require("@playwright/test");

const STORAGE_KEY = "desktop-panel-state-v8";
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

test("filters items, opens the first search result, and records recent items", async ({ page }) => {
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
          { id: "github-item", title: "GitHub", description: "code hosting", url: "https://github.com", size: "1x1", iconMode: "default", customIcon: "", shortcutIcon: "" },
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

  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.__desktopPanelMock.state.calls.openUrl)).toEqual([
    "https://github.com"
  ]);

  await page.click("#clearSearchButton");
  await expect(page.locator(".recent-group .tile .label")).toHaveText(["GitHub"]);
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

  await page.locator('.tile[data-item-id="alpha-item"] .select-toggle').click();
  await page.locator('.tile[data-item-id="beta-item"] .select-toggle').click();
  await expect(page.locator("#batchToolbar")).toBeVisible();
  await expect(page.locator("#batchCount")).toHaveText("已选择 2 项");

  await page.selectOption("#batchGroupSelect", "tools-group");
  await page.click("#batchMoveButton");
  await expect.poll(async () => {
    const state = await getStoredState(page);
    return state.groups.find((group) => group.id === "tools-group").items.map((item) => item.title);
  }).toEqual(["Gamma", "Alpha", "Beta"]);

  await page.locator('.tile[data-item-id="alpha-item"] .select-toggle').click();
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
  await setRangeValue(page, "#trackCountInput", 4);
  await commitRangeValue(page, "#windowWidthInput", 420);
  await page.uncheck("#snapEdgeInput");
  await page.check("#launchAtLoginInput");
  await page.click("#closeWindow");

  await expect(page.locator(".add-tile")).toHaveCount(1);
  await expect(page.locator(".group-title")).toHaveCount(0);
  await expect(page.locator("#appShell")).toHaveAttribute("data-flow", "rtl");

  await expect.poll(() => page.evaluate(() => ({
    lastWindowSize: window.__desktopPanelMock.state.calls.setWindowSize.at(-1),
    lastSnapEnabled: window.__desktopPanelMock.state.calls.setSnapEnabled.at(-1),
    setLaunchAtLogin: window.__desktopPanelMock.state.calls.setLaunchAtLogin,
    closeWindow: window.__desktopPanelMock.state.calls.closeWindow.length,
    trackCount: getComputedStyle(document.documentElement).getPropertyValue("--track-count").trim()
  }))).toEqual({
    lastWindowSize: [420, undefined],
    lastSnapEnabled: false,
    setLaunchAtLogin: [true],
    closeWindow: 1,
    trackCount: "4"
  });
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

  await setRangeValue(page, "#trackCountInput", 4);
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
