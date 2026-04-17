const { app, BrowserWindow, ipcMain, shell, screen } = require("electron");
const path = require("path");
const { execFile } = require("child_process");
const ws = require("windows-shortcuts");
const { Menu, Tray } = require("electron");

const DEFAULT_WIDTH = 360;
const WINDOW_MARGIN_TOP = 0;
const WINDOW_MARGIN_RIGHT = 16;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 460;
const ICONFONT_RESULT_LIMIT = 12;
const ICONFONT_POLL_MS = 400;
const ICONFONT_TIMEOUT_MS = 12000;
const OFFICIAL_SEARCH_LIMIT = 6;
const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const ICONFONT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const SNAP_DISTANCE = 14;
const SNAP_RELEASE_DISTANCE = 26;
const MOVE_SETTLE_MS = 180;
let mainWindow;
let tray = null;
let snapEnabled = true;
let isAdjustingPosition = false;
let snappedX = null;
let snappedY = null;
let settleMoveTimer = null;
let isQuitting = false;
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

app.setAppUserModelId("com.flowerdrunk.minidesktool");

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  const display = screen.getPrimaryDisplay();
  const area = display.workArea;
  const initialBounds = getDockedBounds(area);

  mainWindow = new BrowserWindow({
    show: true,
    width: initialBounds.width,
    height: initialBounds.height,
    x: initialBounds.x,
    y: initialBounds.y,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    resizable: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: false,
    skipTaskbar: true,
    title: "Desktop Panel",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      navigateOnDragDrop: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.setAlwaysOnTop(false);

  mainWindow.once("ready-to-show", () => {
    clampWindowBounds(mainWindow);
    if (process.platform === "win32") {
      attachWindowToDesktopLayer(mainWindow);
    }
  });

  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    hideMainWindow();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.on("move", () => {
    if (isAdjustingPosition) return;
    scheduleSnapAfterMove();
  });

  screen.on("display-metrics-changed", () => {
    clampWindowBounds(mainWindow);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  return mainWindow;
}

function getTrayIconPath() {
  return path.join(__dirname, "build", "icon.ico");
}

function showMainWindow() {
  const win = createWindow();
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function hideMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.hide();
}

function toggleMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) {
    showMainWindow();
    return;
  }
  hideMainWindow();
}

function quitApplication() {
  isQuitting = true;
  if (tray) {
    tray.destroy();
    tray = null;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
  }
  app.quit();
}

function createTray() {
  if (tray) return tray;

  tray = new Tray(getTrayIconPath());
  tray.setToolTip("Mini Desk Tool");
  tray.on("click", () => {
    toggleMainWindow();
  });
  tray.on("double-click", () => {
    showMainWindow();
  });
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: "显示面板",
      click: () => showMainWindow()
    },
    {
      label: "隐藏面板",
      click: () => hideMainWindow()
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => quitApplication()
    }
  ]));

  return tray;
}

function clampBounds(bounds, area) {
  const width = Math.min(Math.max(bounds.width, MIN_WIDTH), area.width);
  const height = Math.min(Math.max(bounds.height, MIN_HEIGHT), area.height);

  const minX = area.x;
  const maxX = area.x + area.width - width;
  const minY = area.y;
  const maxY = area.y + area.height - height;

  const x = Math.min(Math.max(bounds.x, minX), maxX);
  const y = Math.min(Math.max(bounds.y, minY), maxY);

  return { x, y, width, height };
}

function getDockedBounds(area, preferredX) {
  const width = Math.min(Math.max(DEFAULT_WIDTH, MIN_WIDTH), area.width);
  const y = area.y + Math.min(WINDOW_MARGIN_TOP, Math.max(0, area.height - MIN_HEIGHT));
  const height = Math.min(Math.max(area.y + area.height - y, MIN_HEIGHT), area.height);
  const fallbackX = area.x + Math.max(0, area.width - width - WINDOW_MARGIN_RIGHT);
  const x = Number.isFinite(preferredX)
    ? Math.min(Math.max(Number(preferredX), area.x), area.x + area.width - width)
    : fallbackX;

  return { x, y, width, height };
}

function clampWindowBounds(win) {
  if (!win) return;
  const bounds = win.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const area = display.workArea;
  const clamped = clampBounds(getDockedBounds(area, bounds.x), area);

  if (
    clamped.x !== bounds.x ||
    clamped.y !== bounds.y ||
    clamped.width !== bounds.width ||
    clamped.height !== bounds.height
  ) {
    win.setBounds(clamped);
  }
}

function maybeAdjustPosition(win) {
  if (!win || isAdjustingPosition) return;

  const bounds = win.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const area = display.workArea;

  let targetX = bounds.x;
  let targetY = bounds.y;

  const left = area.x;
  const right = area.x + area.width - bounds.width;
  const top = area.y;
  const bottom = area.y + area.height - bounds.height;

  if (snapEnabled) {
    const snapX = resolveAxisSnap(bounds.x, left, right, snappedX);
    const snapY = resolveAxisSnap(bounds.y, top, bottom, snappedY);
    targetX = snapX.value;
    targetY = snapY.value;
    snappedX = snapX.snapTarget;
    snappedY = snapY.snapTarget;
  } else {
    snappedX = null;
    snappedY = null;
  }

  targetX = Math.min(Math.max(targetX, left), right);
  targetY = Math.min(Math.max(targetY, top), bottom);

  if (targetX !== bounds.x || targetY !== bounds.y) {
    isAdjustingPosition = true;
    win.setPosition(targetX, targetY);
    isAdjustingPosition = false;
  }
}

function scheduleSnapAfterMove() {
  if (!mainWindow) return;
  clearTimeout(settleMoveTimer);
  settleMoveTimer = setTimeout(() => {
    settleMoveTimer = null;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    snappedX = null;
    snappedY = null;
    clampWindowBounds(mainWindow);
    maybeAdjustPosition(mainWindow);
  }, MOVE_SETTLE_MS);
}

function resolveAxisSnap(current, min, max, snappedState) {
  const nearMin = Math.abs(current - min) <= SNAP_DISTANCE;
  const nearMax = Math.abs(current - max) <= SNAP_DISTANCE;

  if (snappedState === "min") {
    if (Math.abs(current - min) <= SNAP_RELEASE_DISTANCE) {
      return { value: min, snapTarget: "min" };
    }
    return { value: current, snapTarget: null };
  }

  if (snappedState === "max") {
    if (Math.abs(current - max) <= SNAP_RELEASE_DISTANCE) {
      return { value: max, snapTarget: "max" };
    }
    return { value: current, snapTarget: null };
  }

  if (nearMin) return { value: min, snapTarget: "min" };
  if (nearMax) return { value: max, snapTarget: "max" };

  return { value: current, snapTarget: null };
}

function attachWindowToDesktopLayer(win) {
  try {
    const handleBuffer = win.getNativeWindowHandle();
    const hwnd = process.arch === "x64" ? handleBuffer.readBigUInt64LE().toString() : String(handleBuffer.readUInt32LE());

    const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Native {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr childAfter, string className, string windowTitle);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr SetParent(IntPtr child, IntPtr newParent);
}
"@
$target=[IntPtr]::new([Int64]${hwnd})
$progman=[Native]::FindWindow("Progman", $null)
$workerW=[IntPtr]::Zero
[Native]::EnumWindows({
  param($hWnd,$lParam)
  $shell=[Native]::FindWindowEx($hWnd, [IntPtr]::Zero, "SHELLDLL_DefView", $null)
  if($shell -ne [IntPtr]::Zero){
    $script:workerW=[Native]::FindWindowEx([IntPtr]::Zero, $hWnd, "WorkerW", $null)
  }
  return $true
}, [IntPtr]::Zero) | Out-Null
if($workerW -eq [IntPtr]::Zero){ $workerW=$progman }
if($workerW -ne [IntPtr]::Zero){ [Native]::SetParent($target, $workerW) | Out-Null }
`;

    execFile("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], () => {});
  } catch {
    // Ignore desktop layer attach failures.
  }
}

function queryWindowsShortcut(filePath) {
  return new Promise((resolve) => {
    ws.query(filePath, async (error, info) => {
      if (error || !info) return resolve(null);

      const target = String(info.target || "").trim();
      if (!target) return resolve(null);

      const args = String(info.args || "").trim();
      const url = /^https?:\/\//i.test(target) ? `${target}${args ? ` ${args}` : ""}` : target;
      const iconPath = String(info.icon || "").trim();

      resolve({
        title: path.basename(filePath, path.extname(filePath)),
        url,
        shortcutIcon: await resolveShortcutIconDataUrl(iconPath, target, filePath)
      });
    });
  });
}

async function resolveShortcutIconDataUrl(iconPath, targetPath, shortcutPath) {
  const normalizedIconPath = iconPath.includes(",") ? iconPath.split(",")[0].trim() : iconPath;
  const candidates = [normalizedIconPath, targetPath, shortcutPath]
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.trim());

  for (const candidate of candidates) {
    try {
      const icon = await app.getFileIcon(candidate, { size: "large" });
      if (!icon.isEmpty()) return icon.toDataURL();
    } catch {
      // Try next candidate.
    }
  }

  return "";
}

async function resolveLnkFiles(filePaths = []) {
  const output = [];

  for (const filePath of filePaths) {
    try {
      if (path.extname(filePath).toLowerCase() !== ".lnk") continue;
      const resolved = await queryWindowsShortcut(filePath);
      if (resolved?.url) output.push(resolved);
    } catch {
      // Skip invalid shortcut.
    }
  }

  return output;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function svgToDataUrl(svgMarkup) {
  const value = typeof svgMarkup === "string" ? svgMarkup.trim() : "";
  if (!value) return "";
  return `data:image/svg+xml;base64,${Buffer.from(value, "utf8").toString("base64")}`;
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'");
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function buildOfficialSearchKeywords(query) {
  const raw = String(query || "").trim();
  if (!raw) return [];

  const splitParts = raw
    .split(/[\s,，、|/\\\-_:：;；()（）]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const keywords = new Set([raw, ...splitParts]);
  splitParts.forEach((part) => {
    if (part.length >= 2) keywords.add(part.slice(0, Math.min(part.length, 8)));
  });

  return Array.from(keywords).slice(0, 8);
}

function isBlockedOfficialHost(hostname, pathname) {
  const host = String(hostname || "").toLowerCase();
  const pathValue = String(pathname || "").toLowerCase();
  if (!host) return true;

  const blockedHosts = [
    "hao123.com",
    "www.hao123.com",
    "tuijian.hao123.com",
    "www.baidu.com",
    "m.baidu.com",
    "image.baidu.com",
    "news.baidu.com",
    "map.baidu.com",
    "wenku.baidu.com",
    "tieba.baidu.com",
    "s.click.taobao.com",
    "u.jd.com",
    "p4psearch.1688.com",
    "mos.m.taobao.com"
  ];

  if (blockedHosts.some((item) => host === item || host.endsWith(`.${item}`))) return true;
  if (host.includes("baidu.com") && pathValue.startsWith("/s")) return true;
  return false;
}

function scoreHao123Candidate(candidate, query) {
  const text = normalizeSearchText(`${candidate.title} ${candidate.url}`);
  const hostname = String(candidate.hostname || "").toLowerCase();
  const normalizedHost = normalizeSearchText(hostname);
  const keywords = buildOfficialSearchKeywords(query);
  let score = 0;

  if (candidate.title.includes("官网")) score += 36;
  if (candidate.pathDepth === 0) score += 18;
  if (candidate.pathDepth === 1) score += 10;
  if (hostname.startsWith("www.")) score += 4;
  if (candidate.protocol === "https:") score += 6;

  keywords.forEach((keyword, index) => {
    const normalizedKeyword = normalizeSearchText(keyword);
    if (!normalizedKeyword || normalizedKeyword.length < 2) return;
    if (text === normalizedKeyword) score += 120 - index * 8;
    else if (text.includes(normalizedKeyword)) score += 70 - index * 5;
    else if (normalizedKeyword.includes(text) && text.length >= 2) score += 55 - index * 4;
    if (normalizedHost.includes(normalizedKeyword)) score += 42 - index * 3;
  });

  return score;
}

function buildOfficialCandidate(url, title = "", snippet = "") {
  try {
    const parsed = new URL(String(url || "").trim());
    if (isBlockedOfficialHost(parsed.hostname, parsed.pathname)) return null;
    return {
      url: parsed.toString(),
      title: String(title || "").trim(),
      snippet: String(snippet || "").trim(),
      hostname: parsed.hostname,
      protocol: parsed.protocol,
      pathname: parsed.pathname,
      pathDepth: parsed.pathname.split("/").filter(Boolean).length
    };
  } catch {
    return null;
  }
}

function rankOfficialCandidates(candidates, query) {
  return candidates
    .map((candidate) => ({ ...candidate, score: scoreHao123Candidate(candidate, query) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, OFFICIAL_SEARCH_LIMIT);
}

async function searchOfficialUrlWithTavily(query) {
  const apiKey = String(process.env.TAVILY_API_KEY || "").trim();
  if (!apiKey) return "";

  try {
    const response = await fetch(TAVILY_SEARCH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        query: `${query} 官网 官方网站 official website`,
        topic: "general",
        search_depth: "advanced",
        max_results: OFFICIAL_SEARCH_LIMIT,
        include_answer: false,
        include_raw_content: false,
        include_images: false,
        include_favicon: false
      })
    });

    if (!response.ok) return "";
    const data = await response.json();
    const candidates = Array.isArray(data?.results)
      ? data.results
          .map((item) => buildOfficialCandidate(item?.url, item?.title, item?.content))
          .filter(Boolean)
      : [];

    return rankOfficialCandidates(candidates, query)[0]?.url || "";
  } catch {
    return "";
  }
}

async function searchOfficialUrlWithBrave(query) {
  const apiKey = String(process.env.BRAVE_SEARCH_API_KEY || "").trim();
  if (!apiKey) return "";

  try {
    const response = await fetch(`${BRAVE_SEARCH_URL}?${new URLSearchParams({
      q: `${query} 官网 官方网站 official website`,
      count: String(OFFICIAL_SEARCH_LIMIT),
      country: "CN",
      search_lang: "zh-hans"
    })}`, {
      headers: {
        accept: "application/json",
        "accept-encoding": "gzip",
        "x-subscription-token": apiKey
      }
    });

    if (!response.ok) return "";
    const data = await response.json();
    const rawResults = Array.isArray(data?.web?.results) ? data.web.results : [];
    const candidates = rawResults
      .map((item) => buildOfficialCandidate(item?.url, item?.title, item?.description))
      .filter(Boolean);

    return rankOfficialCandidates(candidates, query)[0]?.url || "";
  } catch {
    return "";
  }
}

async function searchOfficialUrlWithHao123(query) {
  const keyword = typeof query === "string" ? query.trim() : "";
  if (!keyword) return "";

  try {
    const response = await fetch("https://www.hao123.com/", {
      headers: { "user-agent": ICONFONT_USER_AGENT }
    });
    const html = await response.text();

    const results = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
      .map((match) => {
        const url = decodeHtml(match[1]).trim();
        const title = decodeHtml(match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
        if (!url || !title || title.length > 24) return null;
        return buildOfficialCandidate(url, title, "");
      })
      .filter(Boolean);

    if (!results.length) return "";

    const uniqueResults = Array.from(
      new Map(results.map((item) => [`${item.title}|${item.hostname}`, item])).values()
    );

    return rankOfficialCandidates(uniqueResults, keyword)[0]?.url || "";
  } catch {
    return "";
  }
}

async function searchOfficialUrl(query) {
  const keyword = typeof query === "string" ? query.trim() : "";
  if (!keyword) return "";

  const tavilyUrl = await searchOfficialUrlWithTavily(keyword);
  if (tavilyUrl) return tavilyUrl;

  const braveUrl = await searchOfficialUrlWithBrave(keyword);
  if (braveUrl) return braveUrl;

  return searchOfficialUrlWithHao123(keyword);
}

async function extractIconfontCandidates(win, limit = ICONFONT_RESULT_LIMIT) {
  try {
    return await win.webContents.executeJavaScript(
      `(() => {
        const normalizeSvg = (markup) => {
          if (!markup) return "";
          return markup.includes("xmlns=")
            ? markup
            : markup.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
        };
        return Array.from(document.querySelectorAll(".block-icon-list li"))
          .map((item) => {
            const name = (item.querySelector(".icon-name")?.textContent || "").trim();
            const svg = item.querySelector(".icon-twrap svg");
            if (!svg) return null;
            return {
              name,
              svg: normalizeSvg(svg.outerHTML)
            };
          })
          .filter(Boolean)
          .slice(0, ${Number(limit) || ICONFONT_RESULT_LIMIT});
      })();`,
      true
    );
  } catch {
    return [];
  }
}

async function fetchIconfontSuggestions(query, limit = ICONFONT_RESULT_LIMIT) {
  const keyword = typeof query === "string" ? query.trim() : "";
  if (!keyword) return [];
  const win = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    webPreferences: {
      sandbox: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  });

  try {
    const targetUrl = `https://www.iconfont.cn/search/index?searchType=icon&q=${encodeURIComponent(keyword)}`;
    await win.loadURL(targetUrl, { userAgent: ICONFONT_USER_AGENT });

    const deadline = Date.now() + ICONFONT_TIMEOUT_MS;
    let suggestions = [];

    while (Date.now() < deadline) {
      suggestions = await extractIconfontCandidates(win, limit);
      if (suggestions.length) break;

      const hasNoResult = await win.webContents
        .executeJavaScript(`Boolean(document.querySelector(".block-no-results"))`, true)
        .catch(() => false);

      if (hasNoResult) break;
      await sleep(ICONFONT_POLL_MS);
    }

    return suggestions
      .filter((item) => item?.svg)
      .map((item, index) => ({
        id: `${keyword}-${index}`,
        name: item.name || keyword,
        url: svgToDataUrl(item.svg)
      }))
      .filter((item) => item.url);
  } catch {
    return [];
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

app.whenReady().then(() => {
  createTray();
  createWindow();

  app.on("activate", () => {
    showMainWindow();
  });
});

app.on("second-instance", () => {
  showMainWindow();
});

ipcMain.handle("window:minimize", () => {
  mainWindow?.minimize();
});

ipcMain.handle("window:close", () => {
  hideMainWindow();
});

ipcMain.handle("url:open", (_event, url) => {
  if (typeof url !== "string" || !url.trim()) return;
  const value = url.trim();

  if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
    shell.openExternal(value);
    return;
  }

  if (path.isAbsolute(value)) {
    shell.openPath(value);
    return;
  }

  shell.openExternal(value);
});

ipcMain.handle("app:setSnapEnabled", (_event, enabled) => {
  snapEnabled = Boolean(enabled);
});

ipcMain.handle("window:setSize", (_event, width, height) => {
  if (!mainWindow) return;

  const bounds = mainWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const area = display.workArea;
  const next = clampBounds(
    getDockedBounds(
      area,
      bounds.x
    ),
    area
  );

  if (Number.isFinite(width)) {
    next.width = Math.min(Math.max(Number(width), MIN_WIDTH), area.width);
    next.x = Math.min(next.x, area.x + area.width - next.width);
  }

  mainWindow.setBounds(next);
  clampWindowBounds(mainWindow);
});

ipcMain.handle("window:snapAfterDrag", () => {
  if (!mainWindow) return;
  snappedX = null;
  snappedY = null;
  clampWindowBounds(mainWindow);
  maybeAdjustPosition(mainWindow);
});

ipcMain.handle("drop:setAccepting", (_event, accepting) => {
  if (!mainWindow) return;
  mainWindow.setIgnoreMouseEvents(!Boolean(accepting), { forward: true });
});

ipcMain.handle("shortcuts:resolveLnkFiles", async (_event, filePaths) => {
  const paths = Array.isArray(filePaths) ? filePaths.filter((v) => typeof v === "string" && v) : [];
  return resolveLnkFiles(paths);
});

ipcMain.handle("icons:searchSuggestions", async (_event, query) => {
  return fetchIconfontSuggestions(query);
});

ipcMain.handle("links:searchOfficialUrl", async (_event, query) => {
  return searchOfficialUrl(query);
});

app.on("window-all-closed", () => {
  // Keep the app alive in the tray.
});
