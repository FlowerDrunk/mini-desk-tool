# Mini Desk Tool

[English](./README.md)

Mini Desk Tool 是一个基于 Tauri 的 Windows 桌面悬浮面板工具。它可以贴在桌面边缘，以较小的占用提供统一的启动入口，方便管理网站、本地文件、文件夹、应用程序和快捷方式。

## 功能特性

- 桌面悬浮面板，支持原生窗口贴边吸附。
- 图标分组布局，支持设置排列方向和每排数量。
- 支持调整面板宽度，窗口最小宽度为 300 px。
- 支持从面板 UI 或右键菜单添加网站链接。
- 可编辑名称、描述、地址或路径、占位大小、分组和图标来源。
- 支持直接拖拽文件、文件夹、应用程序和 `.lnk` 快捷方式到主面板。
- 可在同一个入口打开本地文件、本地文件夹、应用程序和网页链接。
- 可在设置面板中导出和导入面板数据。
- 导入本地项目时优先使用 Windows 原生系统图标。
- 集成 Iconfont 图标推荐，并支持批量刷新。
- 网站链接和 Windows 快捷方式支持原始图标兜底。
- 可根据名称、描述和域名自动分组。
- 设置面板支持开机启动。

## v1.3.0

- 新增从桌面和开始菜单批量导入快捷方式。
- 新增图标多选能力。
- 新增批量移动分组、调整大小、删除和取消选择。
- 新增 Tauri 原生快捷方式位置扫描命令。

## v1.2.0

- 新增顶部搜索框，支持按名称、描述、网址、路径和分组名过滤。
- 新增最近打开区域，让常用项目自动浮到前面。
- 新增分组折叠能力，并持久保存折叠状态。
- 优化空分组拖拽反馈。

## v1.1.0

- 修复原生窗口拖拽后的左右边缘吸附，窗口停止移动后会自动吸附。
- 修复 Windows 显示缩放下窗口坐标和尺寸计算不一致的问题。
- 修复贴左或贴右时调整窗口宽度导致位置异常、界面像消失的问题。
- 将窗口最小宽度统一提升到 300 px，覆盖 UI、Tauri 配置和运行时边界。

## 技术栈

- Tauri 2
- Vite
- 原生 HTML / CSS / JavaScript
- Rust 后端命令，用于原生 shell、窗口、托盘和快捷方式处理

## 运行要求

- Windows
- Node.js 18+
- Rust 工具链

## 本地启动

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

Windows 安装包会输出到：

```text
src-tauri/target/release/bundle/nsis/
```

## 当前行为说明

- 只有通过右键菜单添加图标时，才会自动根据描述搜索官网。
- 编辑已有图标时，不会自动改写链接。
- 导入的本地项目会立即加入面板。
- 导入的网站快捷方式在需要时仍会在后台补充图标推荐。
- 图标推荐“换一批”有 3 秒冷却时间。

## 项目结构

```text
.
|-- src/
|   |-- index.html
|   |-- main.js
|   |-- desktop-panel.js
|   `-- features/
|-- src-tauri/
|   |-- src/
|   |-- icons/
|   `-- tauri.conf.json
|-- tests/
|-- scripts/
|-- renderer-dist/
|-- vite.config.js
`-- package.json
```

## 脚本

- `npm run dev`：启动 Tauri 开发应用。
- `npm run dev:web`：只启动 Vite renderer。
- `npm run build:renderer`：构建 Vite renderer 到 `renderer-dist/`。
- `npm run build`：构建 renderer 并打包 Windows 安装包。
- `npm run test:e2e`：运行 Playwright 测试。

## 备注

- 当前项目主要面向 Windows 桌面场景。
- 打包产物为 NSIS 安装包。
- 仓库里仍有部分历史 UI 文案需要后续统一做一次编码清理。
