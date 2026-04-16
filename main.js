const { app, BrowserWindow, ipcMain, shell, screen } = require("electron");
const path = require("path");
const { execFile } = require("child_process");
const ws = require("windows-shortcuts");

const DEFAULT_WIDTH = 434;
const DEFAULT_HEIGHT = 640;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 460;
const SNAP_DISTANCE = 14;
const SNAP_RELEASE_DISTANCE = 26;
let mainWindow;
let snapEnabled = true;
let isAdjustingPosition = false;
let snappedX = null;
let snappedY = null;

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const area = display.workArea;

  const width = Math.min(DEFAULT_WIDTH, area.width);
  const height = Math.min(DEFAULT_HEIGHT, area.height);
  const x = area.x + Math.max(0, area.width - width - 16);
  const y = area.y + 16;

  mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
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

  screen.on("display-metrics-changed", () => {
    clampWindowBounds(mainWindow);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
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

function clampWindowBounds(win) {
  if (!win) return;
  const bounds = win.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const area = display.workArea;
  const clamped = clampBounds(bounds, area);

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
    ws.query(filePath, (error, info) => {
      if (error || !info) return resolve(null);

      const target = String(info.target || "").trim();
      if (!target) return resolve(null);

      const args = String(info.args || "").trim();
      const url = /^https?:\/\//i.test(target) ? `${target}${args ? ` ${args}` : ""}` : target;

      resolve({
        title: path.basename(filePath, path.extname(filePath)),
        url
      });
    });
  });
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

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

ipcMain.handle("window:minimize", () => {
  mainWindow?.minimize();
});

ipcMain.handle("window:close", () => {
  mainWindow?.close();
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
    {
      x: bounds.x,
      y: bounds.y,
      width: Number.isFinite(width) ? Number(width) : bounds.width,
      height: Number.isFinite(height) ? Number(height) : bounds.height
    },
    area
  );

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

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
