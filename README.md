# Mini Desk Tool

Mini Desk Tool 是一个基于 Tauri 的 Windows 桌面悬浮启动面板。它面向常用网站、本地文件、文件夹、应用程序和快捷方式管理，让桌面边缘成为一个轻量、可整理、可快速唤出的 Launchpad。
![Tauri](https://img.shields.io/badge/Tauri-2.x-24C8DB)
![Version](https://img.shields.io/badge/version-1.2.2-6B7CFF)

## 特性

- 图标管理：支持网站、本地文件、文件夹、应用、`.lnk` 快捷方式和拖拽导入。
- 桌面悬浮面板：支持窗口边缘吸附、最小宽度 300px、面板宽度和图标布局调整。
- 分组布局：支持分组、折叠分组、空分组保留、排列方向、每排数量和不同图标尺寸。
- 搜索与最近打开：支持名称、描述、网址、路径、分组匹配；搜索栏可选择搜索引擎并用 Enter 调用外部搜索。
- 批量管理：支持长按进入多选、全选当前分组、全选全部、批量移动、批量调整大小和批量删除。
- 图标体验：支持系统原生图标、自定义图标、Iconfont 候选图标、网站 favicon 和快捷方式图标回退。
- 快捷动作：右键菜单支持复制链接/路径、复制搜索关键词、浏览器打开、打开所在文件夹、管理员身份打开。
- 窗口行为：支持边缘吸附、失焦自动隐藏、边缘唤出、全局显示/隐藏快捷键和边缘收起模式。
- 个性化：支持多配置文件、布局预设、主题、自定义主题、字体、文字颜色、透明度和显示项开关。
- 数据安全：支持导入/导出、手动备份、自动备份、导入前恢复点和问题提示中心。
- 发布更新：支持应用内检查官方更新、确认后安装、反馈摘要和发布前版本一致性检查。
- 设置体验：设置项按功能分组，提供顶部分类导航，支持 Esc 关闭设置、添加、编辑弹窗和右键菜单。

## 安装与使用

目前项目主要面向 Windows 桌面环境。发布版通常以 NSIS 安装包形式提供。

本地开发：

```bash
npm install
npm run dev
```

构建安装包：

```bash
npm run build
```

构建产物位于：

```text
src-tauri/target/release/bundle/nsis/
```

## 重大版本演进

### v1.2.x：个性化、设置重构与窗口体验

v1.2 系列重点提升长期使用体验：新增多配置文件、布局预设、主题/字体/颜色设置、设置页分类导航、统一 Esc 关闭行为、搜索引擎选择、右键快捷动作、键盘可达与低动效设置、官方自动更新、发布检查与反馈摘要，以及实验性的边缘收起模式。

### v1.1.x：搜索、批量管理、备份与窗口行为

v1.1 系列让面板从基础启动器升级为可维护的桌面工具：加入搜索、最近打开、分组折叠、批量导入、批量工具条、窗口吸附设置、自动隐藏、全局快捷键、备份恢复和问题提示中心。

### v1.0.x：基础桌面启动面板

v1.0 系列建立核心形态：桌面悬浮面板、图标分组、添加/编辑/删除图标、打开网站与本地路径、导入导出数据，并完成 Windows 窗口吸附、缩放坐标和最小窗口宽度等基础稳定性修复。

## 技术栈

- Tauri 2
- Rust
- Vite
- 原生 HTML / CSS / JavaScript
- Playwright

## 项目结构

```text
.
|-- src/                    # Renderer UI and feature modules
|-- src-tauri/              # Tauri app, Rust commands, native window logic
|-- tests/                  # Playwright tests
|-- scripts/                # Local development/build helpers
|-- renderer-dist/          # Renderer build output
|-- package.json
`-- vite.config.js
```

## 常用脚本

- `npm run dev`：启动 Tauri 开发应用。
- `npm run dev:web`：仅启动 Vite renderer。
- `npm run build:renderer`：构建前端资源到 `renderer-dist/`。
- `npm run build`：构建 renderer 并打包 Windows 安装包。
- `npm run check:release`：检查版本号和 updater 基础配置。
- `npm run generate:update-manifest`：根据安装包和 `.sig` 生成 `latest.json`。
- `npm run test:e2e`：运行 Playwright 测试。

## 发布更新

- 应用内更新依赖 GitHub Release 中的安装包、对应 `.sig` 签名文件和 `latest.json`。
- 如果 Release 缺少 `latest.json`，设置页检查更新会提示更新清单无效；发布前请在签名构建后运行 `npm run generate:update-manifest` 并一同上传。
- 私钥只应放在本机环境变量或 CI Secret 中，不提交到仓库。

## 说明

- 当前主要优化目标是 Windows 桌面使用体验。
- 边缘收起、自动隐藏、边缘唤出和全局快捷键属于窗口行为实验功能，在多显示器或不同缩放比例下仍会持续优化。
- 后续功能计划见 [OPTIMIZATION_ROADMAP.md](./OPTIMIZATION_ROADMAP.md)。
