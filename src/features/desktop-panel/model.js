export const STORAGE_KEY = "desktop-panel-state-v8";
export const LEGACY_STORAGE_KEYS = ["desktop-panel-state-v7", "desktop-panel-state-v6"];
export const DEFAULT_GROUP_ID = "group-default";
export const NEW_AUTO_GROUP = "__new_auto_group__";
export const TRACK_COUNT_MIN = 1;
export const TRACK_COUNT_MAX = 4;
export const DEFAULT_GAP = 14;
export const WINDOW_WIDTH_MIN = 300;
export const WINDOW_WIDTH_MAX = 560;

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
      trackCount: 3
    },
    ui: {
      collapsedGroupIds: [],
      recentItemIds: []
    },
    app: { snapToEdge: true },
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
    ]
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

  const layout = {
    iconSize: clampNumber(parsed?.layout?.iconSize, 42, 76, 58),
    windowWidth: clampNumber(parsed?.layout?.windowWidth, WINDOW_WIDTH_MIN, WINDOW_WIDTH_MAX, 360),
    showGroupTitle: parsed?.layout?.showGroupTitle !== false,
    showItemLabel: parsed?.layout?.showItemLabel !== false,
    showAddTile: parsed?.layout?.showAddTile === true,
    showSearch: parsed?.layout?.showSearch !== false,
    showRecent: parsed?.layout?.showRecent !== false,
    flowDirection: parsed?.layout?.flowDirection === "rtl" ? "rtl" : "ltr",
    trackCount: clampNumber(parsed?.layout?.trackCount, TRACK_COUNT_MIN, TRACK_COUNT_MAX, 3)
  };

  const appConfig = {
    snapToEdge: parsed?.app?.snapToEdge !== false
  };

  const ui = {
    collapsedGroupIds: Array.isArray(parsed?.ui?.collapsedGroupIds)
      ? parsed.ui.collapsedGroupIds.filter((id) => typeof id === "string")
      : [],
    recentItemIds: Array.isArray(parsed?.ui?.recentItemIds)
      ? parsed.ui.recentItemIds.filter((id) => typeof id === "string").slice(0, 10)
      : []
  };

  const groups = Array.isArray(parsed?.groups)
    ? parsed.groups
        .map((group) => ({
          id: group?.id || crypto.randomUUID(),
          name: repairDisplayText(String(group?.name || "未命名组").trim() || "未命名组"),
          items: Array.isArray(group?.items)
            ? group.items
                .filter((item) => item && typeof item.title === "string" && typeof item.url === "string")
                .map((item) => normalizeItem(item))
            : []
        }))
    : [];

  if (!groups.length) {
    groups.push({ id: DEFAULT_GROUP_ID, name: "常用", items: [] });
  }

  ui.collapsedGroupIds = ui.collapsedGroupIds.filter((id) => groups.some((group) => group.id === id));
  ui.recentItemIds = ui.recentItemIds.filter((id) => groups.some((group) => group.items.some((item) => item.id === id)));

  return { layout, ui, app: appConfig, groups };
}

export function migrateFromLegacyArray(items) {
  return {
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
    ]
  };
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

export function saveState(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store.state));
}

export function buildExportPayload(store) {
  return JSON.stringify(
    {
      app: "Mini Desk Tool",
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      state: store.state
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
