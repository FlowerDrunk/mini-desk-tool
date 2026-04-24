# Mini Desk Tool

[简体中文（推荐）](./README.zh-CN.md) | [English](./README.md)

Chinese documentation is the primary reference for this project. If you read Chinese, please use [`README.zh-CN.md`](./README.zh-CN.md) first.

Mini Desk Tool is a lightweight Tauri desktop panel for Windows. It stays attached to the desktop, keeps a compact floating footprint, and lets you organize website links, local files, folders, apps, and shortcuts into tidy groups.

## Features

- Desktop floating panel with native edge snapping.
- Grouped icon layout with configurable flow direction and track count.
- Configurable panel width with a 300 px minimum window width.
- Add website links from the panel UI or the context menu.
- Edit title, description, link or path, tile size, group, and icon source.
- Drag files, folders, apps, and `.lnk` shortcuts directly into the panel.
- Open local files, folders, apps, and web links from one launcher surface.
- Export and import panel data from the settings dialog.
- Prefer Windows-native icons for imported local entries.
- Icon suggestions from Iconfont with batch refresh.
- Original icon fallback for website links and imported Windows shortcuts.
- Automatic grouping based on title, description, and hostname.
- Launch at login option in the settings dialog.

## v1.2.0

- Added a top search box for filtering by title, description, URL, path, and group name.
- Added recent opened items so frequently used entries resurface automatically.
- Added collapsible groups with persisted collapsed state.
- Improved drag feedback for empty drop targets.

## v1.1.0

- Fixed native window drag edge snapping so the panel snaps after the window stops moving.
- Fixed window geometry calculations on Windows display scaling by using logical coordinates consistently.
- Fixed panel resize behavior when changing width while docked to the left or right edge.
- Raised the minimum window width to 300 px across the UI, Tauri config, and runtime bounds.

## Tech Stack

- Tauri 2
- Vite
- Plain HTML / CSS / JavaScript
- Rust backend commands for native shell, window, tray, and shortcut handling

## Requirements

- Windows
- Node.js 18+
- Rust toolchain

## Getting Started

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The Windows installer is generated at:

```text
src-tauri/target/release/bundle/nsis/
```

## Current Behaviors

- Official-site lookup auto-runs only when creating an icon from the right-click menu.
- Editing an existing item does not auto-rewrite the link.
- Imported local entries are added immediately.
- Imported web shortcuts can continue icon enrichment in the background when needed.
- Icon recommendation refresh has a 3-second cooldown.

## Project Structure

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

## Scripts

- `npm run dev` - start the Tauri development app.
- `npm run dev:web` - start the Vite renderer only.
- `npm run build:renderer` - build the Vite renderer into `renderer-dist/`.
- `npm run build` - build the renderer and package the Windows installer.
- `npm run test:e2e` - run Playwright tests.

## Notes

- This project is currently optimized for Windows desktop usage.
- Packaged builds are generated as an NSIS installer.
- Some legacy UI strings in the repository still need a broader encoding cleanup pass.
