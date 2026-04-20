# Mini Desk Tool

[English](./README.md)

Mini Desk Tool 是一个基于 Electron 的 Windows 桌面悬浮面板工具。它贴附在桌面层上，以较小的占用提供统一的启动入口，方便你按分组管理网站、本地文件、文件夹、应用程序和快捷方式。

## 功能特性

- 桌面悬浮面板，支持贴边吸附
- 图标分组布局，支持设置流向和列数
- 支持从面板 UI 或右键菜单添加网站链接
- 可编辑名称、描述、地址或路径、尺寸、分组和图标来源
- 支持直接拖拽文件、文件夹、应用程序和 `.lnk` 快捷方式到主面板
- 可在同一入口中打开本地文件、本地文件夹、应用程序和网页链接
- 导入本地项目时优先使用 Windows 原生系统图标
- 集成 Iconfont 图标推荐，并支持批量刷新
- 网站链接和 Windows 快捷方式支持原始图标兜底
- 可根据名称、描述和域名自动分组
- 面板宽度会根据当前最宽分组自适应调整

## 技术栈

- Electron
- 原生 HTML / CSS / JavaScript
- Electron 原生 shell API
- `windows-shortcuts`，作为 `.lnk` 解析的兜底方案

## 运行要求

- Windows
- Node.js 18 及以上

## 本地启动

```bash
npm install
npm start
```

## 构建

```bash
npm run build
```

Windows 安装包会输出到 `dist/` 目录。

## 可选搜索 API

为了提升“根据描述自动搜索官网”的准确率，应用支持接入搜索 API。

可选环境变量：

- `TAVILY_API_KEY`
- `BRAVE_SEARCH_API_KEY`

调用优先级：

1. Tavily Search API
2. Brave Search API
3. Hao123 兜底匹配

## 当前行为说明

- 只有通过右键菜单添加图标时，才会自动根据描述搜索官网。
- 编辑已有图标时，不会自动改写链接。
- 导入的本地项目会立即加入面板。
- 导入的网站快捷方式在需要时仍会在后台补充图标推荐。
- 图标推荐“换一批”有 3 秒冷却时间。

## 项目结构

```text
.
|-- index.html
|-- styles.css
|-- script.js
|-- main.js
|-- preload.js
`-- package.json
```

## 脚本

- `npm start`：启动 Electron 应用
- `npm run build`：构建 Windows 安装包

## 备注

- 当前项目主要面向 Windows 桌面场景。
- 仓库里仍有部分历史 UI 文案需要后续统一做一次编码清理。
