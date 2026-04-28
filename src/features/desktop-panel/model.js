export const STORAGE_KEY = "desktop-panel-state-v9";
export const LEGACY_STORAGE_KEYS = ["desktop-panel-state-v8", "desktop-panel-state-v7", "desktop-panel-state-v6"];
export const DEFAULT_GROUP_ID = "group-default";
export const DEFAULT_PROFILE_ID = "profile-default";
export const NEW_AUTO_GROUP = "__new_auto_group__";
export const DEFAULT_GLOBAL_SHORTCUT = "CommandOrControl+Alt+Space";
export const TRACK_COUNT_MIN = 1;
export const TRACK_COUNT_MAX = 4;
export const DEFAULT_GAP = 14;
export const WINDOW_WIDTH_MIN = 300;
export const WINDOW_WIDTH_MAX = 560;
export const SNAP_DISTANCE_MIN = 4;
export const SNAP_DISTANCE_MAX = 64;
export const REVEAL_DELAY_MIN = 0;
export const REVEAL_DELAY_MAX = 1500;
export const DRAWER_DELAY_MIN = 0;
export const DRAWER_DELAY_MAX = 5000;
export const BACKUP_RETENTION_MIN = 1;
export const BACKUP_RETENTION_MAX = 12;
export const PANEL_OPACITY_MIN = 58;
export const PANEL_OPACITY_MAX = 96;
export const DEFAULT_TEXT_COLOR = "#ffffff";

export const LAYOUT_PRESETS = {
  compact: { label: "紧凑", iconSize: 48, windowWidth: 300, trackCount: 3, showItemLabel: false },
  standard: { label: "标准", iconSize: 58, windowWidth: 360, trackCount: 3, showItemLabel: true },
  wide: { label: "宽屏", iconSize: 64, windowWidth: 520, trackCount: 4, showItemLabel: true }
};

export const FONT_OPTIONS = {
  noto: { label: "思源黑体", value: "\"Noto Sans SC\", \"Microsoft YaHei\", sans-serif" },
  yahei: { label: "微软雅黑", value: "\"Microsoft YaHei\", \"Noto Sans SC\", sans-serif" },
  songti: { label: "宋体", value: "\"SimSun\", \"Noto Serif SC\", serif" },
  rounded: { label: "圆润黑体", value: "\"Microsoft JhengHei\", \"Noto Sans SC\", sans-serif" },
  mono: { label: "等宽字体", value: "\"Cascadia Mono\", \"Consolas\", monospace" }
};

export const THEME_OPTIONS = {
  aurora: { label: "极光蓝", accent: "#75ffd9", accent2: "#59acff", accentRgb: "117, 255, 217", accent2Rgb: "89, 172, 255", surface: "17, 21, 27" },
  graphite: { label: "石墨灰", accent: "#d7e0ea", accent2: "#8ea1b8", accentRgb: "215, 224, 234", accent2Rgb: "142, 161, 184", surface: "18, 20, 23" },
  sand: { label: "暖沙金", accent: "#ffd27a", accent2: "#ff8f5a", accentRgb: "255, 210, 122", accent2Rgb: "255, 143, 90", surface: "34, 27, 20" },
  custom: { label: "自定义", accent: "#75ffd9", accent2: "#59acff", accentRgb: "117, 255, 217", accent2Rgb: "89, 172, 255", surface: "17, 21, 27" }
};

export const DEFAULT_CUSTOM_THEME = {
  label: "我的主题",
  accent: "#75ffd9",
  accent2: "#59acff",
  surface: "#11151b"
};

export const SEARCH_ENGINES = {
  bing: { label: "Bing", url: "https://www.bing.com/search?q=" },
  baidu: { label: "百度", url: "https://www.baidu.com/s?wd=" },
  google: { label: "Google", url: "https://www.google.com/search?q=" },
  duckduckgo: { label: "DuckDuckGo", url: "https://duckduckgo.com/?q=" }
};

export const SIZE_META = {
  "1x1": { colSpan: 1, rowSpan: 1, widthScale: 1, heightScale: 1, frameInsetX: 0, frameInsetY: 0, iconPadX: 6, iconPadY: 6, wrapRadius: 18, iconRadius: 16 },
  "2x1": { colSpan: 1, rowSpan: 2, widthScale: 1.18, heightScale: 2.18, frameInsetX: 2, frameInsetY: 28, iconPadX: 6, iconPadY: 6, wrapRadius: 18, iconRadius: 22 },
  "1x2": { colSpan: 2, rowSpan: 1, widthScale: 2.18, heightScale: 1.18, frameInsetX: 4, frameInsetY: 10, iconPadX: 6, iconPadY: 6, wrapRadius: 18, iconRadius: 22 },
  "2x2": { colSpan: 2, rowSpan: 2, widthScale: 2.22, heightScale: 2.22, frameInsetX: 0, frameInsetY: 10, iconPadX: 6, iconPadY: 6, wrapRadius: 24, iconRadius: 24 }
};

export function createDefaultState() {
  return {
    layout: {
      iconSize: 58,
      windowWidth: 360,
      showGroupTitle: true,
      showItemLabel: true,
      showAddTile: false,
      showSearch: true,
      showRecent: true,
      flowDirection: "ltr",
      trackCount: 3,
      layoutPreset: "standard",
      theme: "aurora",
      customTheme: structuredClone(DEFAULT_CUSTOM_THEME),
      fontFamily: "noto",
      textColor: DEFAULT_TEXT_COLOR,
      panelOpacity: 78,
      searchEngine: "bing"
    },
    ui: {
      collapsedGroupIds: [],
      recentItemIds: [],
      restorePoints: []
    },
    app: {
      snapToEdge: true,
      autoHideOnBlur: false,
      snapEdge: "auto",
      snapDistance: 14,
      revealDelay: 250,
      drawerModeEnabled: false,
      drawerEdge: "auto",
      drawerCollapseDelay: 450,
      drawerTrigger: "hover-click",
      globalShortcutEnabled: false,
      globalShortcut: DEFAULT_GLOBAL_SHORTCUT,
      autoBackupEnabled: false,
      backupDirectory: "",
      backupRetention: 5,
      lastBackupAt: "",
      lastBackupPath: ""
    },
    groups: [
      {
        id: DEFAULT_GROUP_ID,
        name: "常用",
        items: [
          {
            id: crypto.randomUUID(),
            title: "知乎",
            description: "",
            url: "https://www.zhihu.com",
            size: "1x1",
            iconMode: "default",
            customIcon: "",
            shortcutIcon: ""
          },
          {
            id: crypto.randomUUID(),
            title: "腾讯视频",
            description: "",
            url: "https://v.qq.com",
            size: "1x1",
            iconMode: "default",
            customIcon: "",
            shortcutIcon: ""
          }
        ]
      }
    ],
    activeProfileId: DEFAULT_PROFILE_ID,
    profiles: []
  };
}

export function loadState() {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ||
      LEGACY_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
    if (!raw) return createDefaultState();
    return hydrateState(JSON.parse(raw));
  } catch {
    return createDefaultState();
  }
}

export function hydrateState(parsed) {
  if (Array.isArray(parsed)) return migrateFromLegacyArray(parsed);

  const layout = hydrateLayout(parsed?.layout);
  const appConfig = hydrateAppConfig(parsed?.app);
  const ui = hydrateUi(parsed?.ui);
  const groups = hydrateGroups(parsed?.groups);

  if (!groups.length) {
    groups.push({ id: DEFAULT_GROUP_ID, name: "常用", items: [] });
  }

  ui.collapsedGroupIds = ui.collapsedGroupIds.filter((id) => groups.some((group) => group.id === id));
  ui.recentItemIds = ui.recentItemIds.filter((id) => groups.some((group) => group.items.some((item) => item.id === id)));

  const activeProfileId =
    typeof parsed?.activeProfileId === "string" && parsed.activeProfileId.trim()
      ? parsed.activeProfileId
      : DEFAULT_PROFILE_ID;
  const profiles = normalizeProfiles(parsed?.profiles, { activeProfileId, layout, ui, groups });
  const state = { layout, ui, app: appConfig, groups, activeProfileId, profiles };
  syncActiveProfileState(state);
  return state;
}

export function migrateFromLegacyArray(items) {
  const state = {
    layout: structuredClone(createDefaultState().layout),
    ui: structuredClone(createDefaultState().ui),
    app: structuredClone(createDefaultState().app),
    groups: [
      {
        id: DEFAULT_GROUP_ID,
        name: "常用",
        items: items
          .filter((item) => item && typeof item.title === "string" && typeof item.url === "string")
          .map((item) => normalizeItem({ ...item, size: "1x1" }))
      }
    ],
    activeProfileId: DEFAULT_PROFILE_ID,
    profiles: []
  };
  state.profiles = [createProfileSnapshot(state, { id: DEFAULT_PROFILE_ID, name: "默认配置" })];
  return state;
}

export function normalizeItem(item) {
  return {
    id: item.id || crypto.randomUUID(),
    title: repairDisplayText(String(item.title || "").trim() || "未命名"),
    description: repairDisplayText(String(item.description || "").trim()),
    url: normalizeUrl(String(item.url || "").trim()),
    size: SIZE_META[item.size] ? item.size : "1x1",
    iconMode: item.iconMode === "custom" ? "custom" : "default",
    customIcon: String(item.customIcon || "").trim(),
    shortcutIcon: String(item.shortcutIcon || "").trim()
  };
}

export function sanitizeShortcut(value) {
  const shortcut = String(value || "").trim().replace(/\s+/g, "");
  return shortcut || DEFAULT_GLOBAL_SHORTCUT;
}

export function sanitizeSnapEdge(value) {
  const edge = String(value || "").trim().toLowerCase();
  return ["auto", "left", "right", "top", "bottom"].includes(edge) ? edge : "auto";
}

export function sanitizeDrawerTrigger(value) {
  const trigger = String(value || "").trim().toLowerCase();
  return ["hover-click", "click"].includes(trigger) ? trigger : "hover-click";
}

export function sanitizeLayoutPreset(value) {
  const preset = String(value || "").trim().toLowerCase();
  return preset in LAYOUT_PRESETS ? preset : "custom";
}

export function sanitizeTheme(value) {
  const theme = String(value || "").trim().toLowerCase();
  return theme in THEME_OPTIONS ? theme : "aurora";
}

export function sanitizeFontFamily(value) {
  const font = String(value || "").trim().toLowerCase();
  return font in FONT_OPTIONS ? font : "noto";
}

export function sanitizeColor(value, fallback) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
}

export function colorToRgbList(color, fallback = "#000000") {
  const safeColor = sanitizeColor(color, fallback);
  const value = safeColor.slice(1);
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16)
  ].join(", ");
}

export function sanitizeCustomTheme(input) {
  const fallback = DEFAULT_CUSTOM_THEME;
  return {
    label: repairDisplayText(String(input?.label || fallback.label).trim() || fallback.label).slice(0, 18),
    accent: sanitizeColor(input?.accent, fallback.accent),
    accent2: sanitizeColor(input?.accent2, fallback.accent2),
    surface: sanitizeColor(input?.surface, fallback.surface)
  };
}

export function getThemeConfig(layout = {}) {
  const themeName = sanitizeTheme(layout.theme);
  if (themeName !== "custom") return THEME_OPTIONS[themeName] || THEME_OPTIONS.aurora;

  const customTheme = sanitizeCustomTheme(layout.customTheme);
  return {
    label: customTheme.label || THEME_OPTIONS.custom.label,
    accent: customTheme.accent,
    accent2: customTheme.accent2,
    accentRgb: colorToRgbList(customTheme.accent, DEFAULT_CUSTOM_THEME.accent),
    accent2Rgb: colorToRgbList(customTheme.accent2, DEFAULT_CUSTOM_THEME.accent2),
    surface: colorToRgbList(customTheme.surface, DEFAULT_CUSTOM_THEME.surface)
  };
}

export function getFontConfig(layout = {}) {
  const fontName = sanitizeFontFamily(layout.fontFamily);
  return FONT_OPTIONS[fontName] || FONT_OPTIONS.noto;
}

export function sanitizeSearchEngine(value) {
  const engine = String(value || "").trim().toLowerCase();
  return engine in SEARCH_ENGINES ? engine : "bing";
}

export function saveState(store) {
  syncActiveProfileState(store.state);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store.state));
}

export function buildExportPayload(store) {
  syncActiveProfileState(store.state);
  const state = structuredClone(store.state);
  if (state.ui) state.ui.restorePoints = [];
  if (Array.isArray(state.profiles)) {
    state.profiles = state.profiles.map((profile) => ({
      ...profile,
      ui: {
        collapsedGroupIds: Array.isArray(profile.ui?.collapsedGroupIds) ? profile.ui.collapsedGroupIds : [],
        recentItemIds: Array.isArray(profile.ui?.recentItemIds) ? profile.ui.recentItemIds : []
      }
    }));
  }
  return JSON.stringify(
    {
      app: "Mini Desk Tool",
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      state
    },
    null,
    2
  );
}

export function extractImportedState(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && payload.state) return payload.state;
  return payload;
}

export function ensureValidGroups(store) {
  if (!Array.isArray(store.state.groups)) {
    store.state.groups = [];
  }
  store.state.groups = store.state.groups.filter((group) => Array.isArray(group.items));
  if (!store.state.groups.length) {
    store.state.groups.push({ id: DEFAULT_GROUP_ID, name: "常用", items: [] });
  }
  pruneUiState(store);
  syncActiveProfileState(store.state);
}

export function createProfileSnapshot(state, overrides = {}) {
  return {
    id: overrides.id || crypto.randomUUID(),
    name: String(overrides.name || "新配置").trim() || "新配置",
    layout: structuredClone(state.layout),
    ui: {
      collapsedGroupIds: Array.isArray(state.ui?.collapsedGroupIds) ? [...state.ui.collapsedGroupIds] : [],
      recentItemIds: Array.isArray(state.ui?.recentItemIds) ? [...state.ui.recentItemIds] : []
    },
    groups: structuredClone(state.groups),
    updatedAt: new Date().toISOString()
  };
}

export function syncActiveProfileState(state) {
  if (!Array.isArray(state.profiles)) state.profiles = [];
  if (!state.activeProfileId) state.activeProfileId = DEFAULT_PROFILE_ID;
  let profile = state.profiles.find((entry) => entry.id === state.activeProfileId);
  if (!profile) {
    profile = createProfileSnapshot(state, {
      id: state.activeProfileId,
      name: state.activeProfileId === DEFAULT_PROFILE_ID ? "默认配置" : "新配置"
    });
    state.profiles.unshift(profile);
  }

  profile.layout = structuredClone(state.layout);
  profile.ui = {
    collapsedGroupIds: Array.isArray(state.ui?.collapsedGroupIds) ? [...state.ui.collapsedGroupIds] : [],
    recentItemIds: Array.isArray(state.ui?.recentItemIds) ? [...state.ui.recentItemIds] : []
  };
  profile.groups = structuredClone(state.groups);
  profile.updatedAt = new Date().toISOString();
}

export function applyProfileSnapshot(state, profileId) {
  const profile = state.profiles?.find((entry) => entry.id === profileId);
  if (!profile) return false;
  syncActiveProfileState(state);
  const restorePoints = Array.isArray(state.ui?.restorePoints) ? state.ui.restorePoints : [];
  state.activeProfileId = profile.id;
  state.layout = hydrateLayout(profile.layout);
  state.ui = {
    ...hydrateUi(profile.ui),
    restorePoints
  };
  state.groups = hydrateGroups(profile.groups);
  if (!state.groups.length) {
    state.groups.push({ id: DEFAULT_GROUP_ID, name: "常用", items: [] });
  }
  return true;
}

export function getNextProfileName(state) {
  const taken = new Set((state.profiles || []).map((profile) => profile.name));
  let index = 2;
  let name = "新配置";
  while (taken.has(name)) {
    name = `新配置 ${index}`;
    index += 1;
  }
  return name;
}

function pruneUiState(store) {
  if (!store.state.ui || typeof store.state.ui !== "object") {
    store.state.ui = structuredClone(createDefaultState().ui);
  }
  const groupIds = new Set(store.state.groups.map((group) => group.id));
  const itemIds = new Set(store.state.groups.flatMap((group) => group.items.map((item) => item.id)));
  store.state.ui.collapsedGroupIds = Array.isArray(store.state.ui.collapsedGroupIds)
    ? store.state.ui.collapsedGroupIds.filter((id) => groupIds.has(id))
    : [];
  store.state.ui.recentItemIds = Array.isArray(store.state.ui.recentItemIds)
    ? store.state.ui.recentItemIds.filter((id) => itemIds.has(id)).slice(0, 10)
    : [];
  store.state.ui.restorePoints = Array.isArray(store.state.ui.restorePoints)
    ? store.state.ui.restorePoints.filter((entry) => entry && typeof entry.content === "string").slice(0, 3)
    : [];
}

function hydrateLayout(input) {
  return {
    iconSize: clampNumber(input?.iconSize, 42, 76, 58),
    windowWidth: clampNumber(input?.windowWidth, WINDOW_WIDTH_MIN, WINDOW_WIDTH_MAX, 360),
    showGroupTitle: input?.showGroupTitle !== false,
    showItemLabel: input?.showItemLabel !== false,
    showAddTile: input?.showAddTile === true,
    showSearch: input?.showSearch !== false,
    showRecent: input?.showRecent !== false,
    flowDirection: input?.flowDirection === "rtl" ? "rtl" : "ltr",
    trackCount: clampNumber(input?.trackCount, TRACK_COUNT_MIN, TRACK_COUNT_MAX, 3),
    layoutPreset: sanitizeLayoutPreset(input?.layoutPreset || "standard"),
    theme: sanitizeTheme(input?.theme),
    customTheme: sanitizeCustomTheme(input?.customTheme),
    fontFamily: sanitizeFontFamily(input?.fontFamily),
    textColor: sanitizeColor(input?.textColor, DEFAULT_TEXT_COLOR),
    panelOpacity: clampNumber(input?.panelOpacity, PANEL_OPACITY_MIN, PANEL_OPACITY_MAX, 78),
    searchEngine: sanitizeSearchEngine(input?.searchEngine)
  };
}

function hydrateAppConfig(input) {
  return {
    snapToEdge: input?.snapToEdge !== false,
    autoHideOnBlur: input?.autoHideOnBlur === true,
    snapEdge: sanitizeSnapEdge(input?.snapEdge),
    snapDistance: clampNumber(input?.snapDistance, SNAP_DISTANCE_MIN, SNAP_DISTANCE_MAX, 14),
    revealDelay: clampNumber(input?.revealDelay, REVEAL_DELAY_MIN, REVEAL_DELAY_MAX, 250),
    drawerModeEnabled: input?.drawerModeEnabled === true,
    drawerEdge: sanitizeSnapEdge(input?.drawerEdge),
    drawerCollapseDelay: clampNumber(input?.drawerCollapseDelay, DRAWER_DELAY_MIN, DRAWER_DELAY_MAX, 450),
    drawerTrigger: sanitizeDrawerTrigger(input?.drawerTrigger),
    globalShortcutEnabled: input?.globalShortcutEnabled === true,
    globalShortcut: sanitizeShortcut(input?.globalShortcut || DEFAULT_GLOBAL_SHORTCUT),
    autoBackupEnabled: input?.autoBackupEnabled === true,
    backupDirectory: String(input?.backupDirectory || ""),
    backupRetention: clampNumber(input?.backupRetention, BACKUP_RETENTION_MIN, BACKUP_RETENTION_MAX, 5),
    lastBackupAt: String(input?.lastBackupAt || ""),
    lastBackupPath: String(input?.lastBackupPath || "")
  };
}

function hydrateUi(input) {
  return {
    collapsedGroupIds: Array.isArray(input?.collapsedGroupIds)
      ? input.collapsedGroupIds.filter((id) => typeof id === "string")
      : [],
    recentItemIds: Array.isArray(input?.recentItemIds)
      ? input.recentItemIds.filter((id) => typeof id === "string").slice(0, 10)
      : [],
    restorePoints: Array.isArray(input?.restorePoints)
      ? input.restorePoints.filter((entry) => entry && typeof entry.content === "string").slice(0, 3)
      : []
  };
}

function hydrateGroups(input) {
  return Array.isArray(input)
    ? input.map((group) => ({
        id: group?.id || crypto.randomUUID(),
        name: repairDisplayText(String(group?.name || "未命名组").trim() || "未命名组"),
        items: Array.isArray(group?.items)
          ? group.items
              .filter((item) => item && typeof item.title === "string" && typeof item.url === "string")
              .map((item) => normalizeItem(item))
          : []
      }))
    : [];
}

function normalizeProfiles(input, current) {
  const profiles = Array.isArray(input)
    ? input
        .map((profile) => {
          if (!profile || typeof profile !== "object") return null;
          const id = String(profile.id || "").trim() || crypto.randomUUID();
          const name = String(profile.name || "未命名配置").trim() || "未命名配置";
          const groups = hydrateGroups(profile.groups);
          return {
            id,
            name,
            layout: hydrateLayout(profile.layout),
            ui: {
              collapsedGroupIds: Array.isArray(profile.ui?.collapsedGroupIds)
                ? profile.ui.collapsedGroupIds.filter((entry) => typeof entry === "string")
                : [],
              recentItemIds: Array.isArray(profile.ui?.recentItemIds)
                ? profile.ui.recentItemIds.filter((entry) => typeof entry === "string").slice(0, 10)
                : []
            },
            groups: groups.length ? groups : [{ id: DEFAULT_GROUP_ID, name: "常用", items: [] }],
            updatedAt: String(profile.updatedAt || "")
          };
        })
        .filter(Boolean)
    : [];

  if (!profiles.some((profile) => profile.id === current.activeProfileId)) {
    profiles.unshift(
      createProfileSnapshot(
        {
          layout: current.layout,
          ui: current.ui,
          groups: current.groups
        },
        {
          id: current.activeProfileId,
          name: current.activeProfileId === DEFAULT_PROFILE_ID ? "默认配置" : "当前配置"
        }
      )
    );
  }

  return profiles;
}

export function findGroup(store, groupId) {
  return store.state.groups.find((group) => group.id === groupId) || null;
}

export function findItem(store, groupId, itemId) {
  return findGroup(store, groupId)?.items.find((item) => item.id === itemId) || null;
}

export function findItemById(store, itemId) {
  for (const group of store.state.groups) {
    const item = group.items.find((entry) => entry.id === itemId);
    if (item) return { group, item };
  }
  return null;
}

export function inferGroupName(title, url, description = "") {
  const host = safeHost(url);
  const normalized = `${title} ${description} ${host}`.toLowerCase().replace(/\s+/g, " ");

  const mappings = [
    { name: "知识", keys: ["知乎", "wiki", "docs", "教程", "百科", "csdn", "stackoverflow", "掘金"] },
    { name: "影音", keys: ["bilibili", "视频", "音乐", "spotify", "youtube", "netflix", "腾讯视频"] },
    { name: "开发", keys: ["github", "gitlab", "gitee", "npm", "docker", "api", "cursor", "vscode", "编程"] },
    { name: "资讯", keys: ["新闻", "资讯", "微博", "rss", "社区", "论坛", "xiaohongshu"] },
    { name: "购物", keys: ["淘宝", "京东", "天猫", "amazon", "jd", "tmall", "商城", "购物"] },
    { name: "邮箱", keys: ["邮箱", "邮件", "mail", "gmail", "outlook"] },
    { name: "办公", keys: ["文档", "表格", "协作", "会议", "钉钉", "飞书", "office", "notion", "网盘"] },
    { name: "AI 工具", keys: ["ai", "chatgpt", "claude", "gemini", "kimi", "copilot"] },
    { name: "游戏", keys: ["steam", "epic", "playstation", "switch", "xbox", "game", "mod"] },
    { name: "社交", keys: ["微信", "qq", "discord", "telegram", "聊天", "社交"] }
  ];

  let bestMatch = { name: "常用", score: 0 };
  for (const mapping of mappings) {
    const score = mapping.keys.reduce((sum, key) => {
      const normalizedKey = String(key).toLowerCase();
      if (!normalized.includes(normalizedKey)) return sum;
      return sum + (normalizedKey.length >= 3 ? 3 : 2);
    }, 0);
    if (score > bestMatch.score) {
      bestMatch = { name: mapping.name, score };
    }
  }

  if (bestMatch.score > 0) return bestMatch.name;
  if (!host) return "常用";
  const parts = host.split(".").filter(Boolean);
  return parts.length >= 2 ? `${parts[parts.length - 2].toUpperCase()} 组` : "常用";
}

export function repairDisplayText(value) {
  return value;
}

export function uniqueGroupName(store, baseName) {
  const taken = new Set(store.state.groups.map((group) => group.name));
  if (!taken.has(baseName)) return baseName;

  let index = 2;
  while (taken.has(`${baseName}${index}`)) index += 1;
  return `${baseName}${index}`;
}

export function normalizeUrl(value) {
  if (!value) return "";
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) return value;
  if (/^[a-z]:\\/i.test(value) || value.startsWith("\\\\")) return value;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

export function safeHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

export function makeFallbackIcon(name) {
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

export function escapeHtml(value) {
  return escapeXml(String(value || ""));
}

export function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
