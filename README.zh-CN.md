# Mini Desk Tool

[English](./README.md)

Mini Desk Tool 是一个基于 Electron 的 Windows 桌面悬浮面板工具。它会吸附在桌面层上，以较小的占用提供分组图标、网站快捷入口和本地快捷方式管理能力。

## 功能特性

- 桌面层悬浮面板，支持边缘吸附
- 图标分组展示，支持排列方向和每排行数设置
- 可通过右键菜单或面板入口添加网站图标
- 可编辑名称、描述、链接、尺寸、分组和图标来源
- 基于 Iconfont 的图标推荐，并支持“换一批”
- 支持网站原始图标和快捷方式原始图标兜底
- 支持从资源管理器直接拖入 `.lnk` 快捷方式
- 拖入快捷方式后会后台异步补全推荐图标
- 基于名称、描述、域名进行自动分组
- 面板宽度会根据当前最宽分组自动调整

## 技术栈

- Electron
- 原生 HTML / CSS / JavaScript
- `windows-shortcuts` 用于解析 `.lnk`

## 运行要求

- Windows
- Node.js 18 及以上

## 本地启动

```bash
npm install
npm start
```

## 搜索 API 配置

为了提高“官方链接自动搜索”的准确率，应用支持接入搜索 API。

可选环境变量：

- `TAVILY_API_KEY`
- `BRAVE_SEARCH_API_KEY`

调用优先级：

1. Tavily Search API
2. Brave Search API
3. Hao123 导航匹配兜底

## 当前交互说明

- 只有通过右键菜单“添加图标”时，才会自动根据描述搜索官网。
- 编辑已有图标时，不会自动改写链接。
- 拖入 `.lnk` 快捷方式后会先立即落盘，再后台异步搜索推荐图标。
- 图标推荐支持“换一批”，冷却时间为 3 秒。

## 目录结构

```text
.
├─ index.html
├─ styles.css
├─ script.js
├─ main.js
├─ preload.js
└─ package.json
```

## 启动命令

- `npm start`：启动 Electron 应用

## 备注

- 当前项目主要面向 Windows 桌面场景。
- 仓库里的部分界面文案仍建议后续再做一次统一编码清理。

