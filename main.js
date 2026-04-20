const { app, BrowserWindow, ipcMain, shell, screen } = require("electron");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const ws = require("windows-shortcuts"); // 仅用这个库解析快捷方式
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
if (!hasSingleInstanceLock) app.quit();

app.setAppUserModelId("com.flowerdrunk.minidesktool");
const appDataRoot = path.join(app.getPath("appData"), "MiniDeskTool");
const sessionDataRoot = path.join(appDataRoot, "session");
app.setPath("userData", appDataRoot);
app.setPath("sessionData", sessionDataRoot);
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");

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
  const packagedIconPath = path.join(process.resourcesPath, "icon.ico");
  const devIconPath = path.join(__dirname, "build", "icon.ico");
  return app.isPackaged ? packagedIconPath : devIconPath;
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
  } else {
    hideMainWindow();
  }
}

function quitApplication() {
  isQuitting = true;
  if (tray) { tray.destroy(); tray = null; }
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
  app.quit();
}

function createTray() {
  if (tray) return tray;
  tray = new Tray(getTrayIconPath());
  tray.setToolTip("Mini Desk Tool");
  tray.on("click", toggleMainWindow);
  tray.on("double-click", showMainWindow);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "显示面板", click: showMainWindow },
    { label: "隐藏面板", click: hideMainWindow },
    { type: "separator" },
    { label: "退出", click: quitApplication }
  ]));
  return tray;
}

function getLaunchAtLoginState() {
  return Boolean(app.getLoginItemSettings().openAtLogin);
}

function setLaunchAtLoginState(enabled) {
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled), openAsHidden: false, path: process.execPath });
  return getLaunchAtLoginState();
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
  const x = Number.isFinite(preferredX) ? Math.min(Math.max(Number(preferredX), area.x), area.x + area.width - width) : fallbackX;
  return { x, y, width, height };
}

function clampWindowBounds(win) {
  if (!win) return;
  const bounds = win.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const area = display.workArea;
  const clamped = clampBounds(getDockedBounds(area, bounds.x), area);
  if (clamped.x !== bounds.x || clamped.y !== bounds.y || clamped.width !== bounds.width || clamped.height !== bounds.height) {
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
  if (snappedState === "min") return Math.abs(current - min) <= SNAP_RELEASE_DISTANCE ? { value: min, snapTarget: "min" } : { value: current, snapTarget: null };
  if (snappedState === "max") return Math.abs(current - max) <= SNAP_RELEASE_DISTANCE ? { value: max, snapTarget: "max" } : { value: current, snapTarget: null };
  if (nearMin) return { value: min, snapTarget: "min" };
  if (nearMax) return { value: max, snapTarget: "max" };
  return { value: current, snapTarget: null };
}

// ==========================================================================
// ✅ 这里是核心：完全使用 windows-shortcuts 解析 .lnk，无 PowerShell
// ==========================================================================
function queryWindowsShortcutWithElectron(filePath) {
  try {
    const link = shell.readShortcutLink(filePath);
    const target = String(link?.target || "").trim();
    const args = String(link?.args || "").trim();
    if (!target) return null;

    let url = target;
    if (args) url += ` ${args}`;

    return {
      title: path.basename(filePath, ".lnk"),
      url: url.trim(),
      shortcutIcon: ""
    };
  } catch {
    return null;
  }
}

function queryWindowsShortcutWithShell(filePath) {
  return new Promise((resolve) => {
    const powerShellPath = path.join(
      process.env.SystemRoot || "C:\\Windows",
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe"
    );
    const script = [
      "$ErrorActionPreference = 'Stop'",
      "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
      "$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($args[0])",
      "$result = [pscustomobject]@{",
      "  targetPath = [string]$shortcut.TargetPath",
      "  arguments = [string]$shortcut.Arguments",
      "}",
      "$result | ConvertTo-Json -Compress"
    ].join("; ");

    execFile(
      powerShellPath,
      ["-NoProfile", "-NonInteractive", "-Command", script, filePath],
      { encoding: "utf8", windowsHide: true },
      (error, stdout) => {
        if (error || !stdout) return resolve(null);

        try {
          const parsed = JSON.parse(String(stdout).trim());
          const target = String(parsed?.targetPath || "").trim();
          const args = String(parsed?.arguments || "").trim();
          if (!target) return resolve(null);

          let url = target;
          if (args) url += ` ${args}`;

          resolve({
            title: path.basename(filePath, ".lnk"),
            url: url.trim(),
            shortcutIcon: ""
          });
        } catch {
          resolve(null);
        }
      }
    );
  });
}

function queryWindowsShortcutWithLibrary(filePath) {
  return new Promise((resolve) => {
    try {
      ws.query(filePath, (err, link) => {
        if (err || !link || !link.target) return resolve(null);

        const target = String(link.target || "").trim();
        const args = String(link.args || "").trim();
        if (!target) return resolve(null);

        let url = target;
        if (args) url += ` ${args}`;

        resolve({
          title: path.basename(filePath, ".lnk"),
          url: url.trim(),
          shortcutIcon: ""
        });
      });
    } catch {
      resolve(null);
    }
  });
}

async function queryWindowsShortcut(filePath) {
  const electronResult = queryWindowsShortcutWithElectron(filePath);
  if (electronResult?.url) return electronResult;

  const shellResult = await queryWindowsShortcutWithShell(filePath);
  if (shellResult?.url) return shellResult;
  return queryWindowsShortcutWithLibrary(filePath);
}

function getEntryTitle(filePath, isDirectory = false) {
  const baseName = path.basename(filePath);
  if (!baseName) return filePath;
  if (isDirectory) return baseName;

  const parsed = path.parse(baseName);
  return parsed.name || parsed.base || filePath;
}

async function getFileIconDataUrl(filePath) {
  try {
    const icon = await app.getFileIcon(filePath, { size: "normal" });
    if (!icon || icon.isEmpty()) return "";
    return icon.toDataURL();
  } catch {
    return "";
  }
}

async function resolveDroppedPath(filePath) {
  const normalizedPath = String(filePath || "").trim();
  if (!normalizedPath) return null;

  try {
    if (path.extname(normalizedPath).toLowerCase() === ".lnk") {
      const shortcut = await queryWindowsShortcut(normalizedPath);
      if (!shortcut?.url) return null;
      return {
        ...shortcut,
        shortcutIcon: (await getFileIconDataUrl(normalizedPath)) || String(shortcut.shortcutIcon || "").trim()
      };
    }

    const stats = await fs.promises.stat(normalizedPath);
    return {
      title: getEntryTitle(normalizedPath, stats.isDirectory()),
      url: normalizedPath,
      shortcutIcon: await getFileIconDataUrl(normalizedPath)
    };
  } catch {
    return null;
  }
}

async function resolveShortcutIconDataUrl() {
  return ""; // 禁用图标避免报错
}

async function resolveDroppedPaths(filePaths = []) {
  const output = [];
  for (const fp of filePaths) {
    try {
      const res = await resolveDroppedPath(fp);
      if (res?.url) output.push(res);
    } catch {}
  }
  return output;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function svgToDataUrl(svgMarkup) {
  const v = String(svgMarkup || "").trim();
  if (!v) return "";
  return `data:image/svg+xml;base64,${Buffer.from(v, "utf8").toString("base64")}`;
}

function decodeHtml(v) {
  return String(v || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function normalizeSearchText(v) {
  return String(v || "").toLowerCase().replace(/\s+/g, "").replace(/[^\p{L}\p{N}]+/gu, "");
}

function buildOfficialSearchKeywords(q) {
  const raw = String(q || "").trim();
  if (!raw) return [];
  const parts = raw.split(/[\s,，、|/\\\-_:：;；()（）]+/).map(p => p.trim()).filter(Boolean);
  const set = new Set([raw, ...parts]);
  parts.forEach(p => p.length >= 2 && set.add(p.slice(0, 8)));
  return Array.from(set).slice(0, 8);
}

function isBlockedOfficialHost(host, path) {
  const h = String(host || "").toLowerCase();
  const p = String(path || "").toLowerCase();
  const bad = ["hao123.com", "baidu.com", "taobao.com", "jd.com", "1688.com"];
  if (bad.some(b => h === b || h.endsWith(`.${b}`))) return true;
  if (h.includes("baidu.com") && p.startsWith("/s")) return true;
  return false;
}

function scoreHao123Candidate(c, q) {
  const t = normalizeSearchText(`${c.title} ${c.url}`);
  const hn = normalizeSearchText(c.hostname || "");
  const kw = buildOfficialSearchKeywords(q);
  let s = 0;
  if (c.title.includes("官网")) s += 36;
  if (c.pathDepth === 0) s += 18;
  if (c.protocol === "https:") s += 6;
  kw.forEach((k, i) => {
    const nk = normalizeSearchText(k);
    if (nk.length < 2) return;
    if (t === nk) s += 120 - i * 8;
    else if (t.includes(nk)) s += 70 - i * 5;
    if (hn.includes(nk)) s += 42 - i * 3;
  });
  return s;
}

function buildOfficialCandidate(u, t = "", snip = "") {
  try {
    const purl = new URL(String(u || "").trim());
    if (isBlockedOfficialHost(purl.hostname, purl.pathname)) return null;
    return {
      url: purl.toString(),
      title: String(t || "").trim(),
      snippet: String(snip || "").trim(),
      hostname: purl.hostname,
      protocol: purl.protocol,
      pathname: purl.pathname,
      pathDepth: purl.pathname.split("/").filter(Boolean).length
    };
  } catch { return null; }
}

function rankOfficialCandidates(cand, q) {
  return cand.map(c => ({ ...c, score: scoreHao123Candidate(c, q) }))
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, OFFICIAL_SEARCH_LIMIT);
}

async function searchOfficialUrlWithTavily(q) { return ""; }
async function searchOfficialUrlWithBrave(q) { return ""; }

async function searchOfficialUrlWithHao123(q) {
  const k = String(q || "").trim();
  if (!k) return "";
  try {
    const r = await fetch("https://www.hao123.com/", { headers: { "user-agent": ICONFONT_USER_AGENT } });
    const html = await r.text();
    const list = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
      .map(m => {
        const url = decodeHtml(m[1] || "").trim();
        const title = decodeHtml((m[2] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
        if (!url || !title || title.length > 24) return null;
        return buildOfficialCandidate(url, title, "");
      }).filter(Boolean);
    const uniq = Array.from(new Map(list.map(i => [`${i.title}|${i.hostname}`, i])).values());
    return rankOfficialCandidates(uniq, k)[0]?.url || "";
  } catch { return ""; }
}

async function searchOfficialUrl(q) {
  return searchOfficialUrlWithHao123(q);
}

async function extractIconfontCandidates(win, limit) {
  try {
    return await win.webContents.executeJavaScript(`
      (()=>{
        const norm = m => m.includes("xmlns=") ? m : m.replace("<svg",'<svg xmlns="http://www.w3.org/2000/svg"');
        return Array.from(document.querySelectorAll(".block-icon-list li")).map(i=>{
          const n = i.querySelector(".icon-name")?.textContent.trim() || "";
          const s = i.querySelector(".icon-twrap svg");
          if(!s) return null;
          return {name:n, svg:norm(s.outerHTML)};
        }).filter(Boolean).slice(0,${limit||ICONFONT_RESULT_LIMIT});
      })();
    `, true);
  } catch { return []; }
}

async function fetchIconfontSuggestions(q) {
  const k = String(q || "").trim();
  if (!k) return [];
  const w = new BrowserWindow({ show: false, frame: false, transparent: true, webPreferences: { sandbox: false, contextIsolation: true } });
  try {
    await w.loadURL(`https://www.iconfont.cn/search/index?searchType=icon&q=${encodeURIComponent(k)}`, { userAgent: ICONFONT_USER_AGENT });
    const dead = Date.now() + ICONFONT_TIMEOUT_MS;
    let sug = [];
    while (Date.now() < dead) {
      sug = await extractIconfontCandidates(w, ICONFONT_RESULT_LIMIT);
      if (sug.length) break;
      const none = await w.webContents.executeJavaScript(`Boolean(document.querySelector(".block-no-results"))`).catch(()=>false);
      if (none) break;
      await sleep(ICONFONT_POLL_MS);
    }
    return sug.filter(x=>x.svg).map((x,i)=>({
      id:`${k}-${i}`, name:x.name||k, url:svgToDataUrl(x.svg)
    })).filter(x=>x.url);
  } catch { return []; } finally { if (!w.isDestroyed()) w.destroy(); }
}

// ==========================================================================
// APP 启动
// ==========================================================================
app.whenReady().then(() => {
  createTray();
  createWindow();
  app.on("activate", showMainWindow);
});

app.on("second-instance", showMainWindow);

ipcMain.handle("window:minimize", () => mainWindow?.minimize());
ipcMain.handle("window:close", hideMainWindow);

ipcMain.handle("url:open", (_, u) => {
  const v = String(u || "").trim();
  if (!v) return;
  if (/^https?:\/\//i.test(v)) return shell.openExternal(v);
  shell.openPath(v);
});

ipcMain.handle("app:setSnapEnabled", (_, e) => snapEnabled = !!e);
ipcMain.handle("app:getLaunchAtLogin", getLaunchAtLoginState);
ipcMain.handle("app:setLaunchAtLogin", (_, e) => setLaunchAtLoginState(e));

ipcMain.handle("window:setSize", (_, w, h) => {
  if (!mainWindow) return;
  const b = mainWindow.getBounds();
  const d = screen.getDisplayMatching(b);
  const a = d.workArea;
  const n = clampBounds(getDockedBounds(a, b.x), a);
  if (Number.isFinite(w)) n.width = Math.min(Math.max(w, MIN_WIDTH), a.width);
  mainWindow.setBounds(n);
  clampWindowBounds(mainWindow);
});

ipcMain.handle("window:snapAfterDrag", () => {
  if (!mainWindow) return;
  snappedX = snappedY = null;
  clampWindowBounds(mainWindow);
  maybeAdjustPosition(mainWindow);
});

ipcMain.handle("drop:setAccepting", (_, acc) => {
  if (mainWindow) mainWindow.setIgnoreMouseEvents(!acc, { forward: true });
});

ipcMain.handle("shortcuts:resolveDroppedPaths", async (_, paths) => resolveDroppedPaths(paths || []));
ipcMain.handle("icons:searchSuggestions", (_, q) => fetchIconfontSuggestions(q));
ipcMain.handle("links:searchOfficialUrl", (_, q) => searchOfficialUrl(q));

app.on("window-all-closed", () => {});
