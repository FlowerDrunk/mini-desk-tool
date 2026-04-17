# Mini Desk Tool

[简体中文](./README.zh-CN.md)

Mini Desk Tool is a lightweight Electron desktop panel for Windows. It attaches to the desktop layer, keeps a small floating footprint, and lets you organize website shortcuts and local shortcuts into compact groups.

## Features

- Desktop-attached floating panel with edge snapping
- Grouped icon layout with configurable direction and row count
- Add website links from the context menu or panel UI
- Edit icon title, description, link, size, group, and icon source
- Icon suggestions from Iconfont with batch refresh
- Original icon fallback for links and Windows shortcuts
- Drag `.lnk` files from Windows Explorer into the panel
- Background icon enrichment for imported shortcuts
- Auto grouping based on title, description, and hostname
- Adaptive panel width based on the widest group

## Tech Stack

- Electron
- Plain HTML / CSS / JavaScript
- `windows-shortcuts` for resolving `.lnk` files

## Requirements

- Windows
- Node.js 18+

## Getting Started

```bash
npm install
npm start
```

## Configuration

The app can use search APIs to improve official-site lookup accuracy.

Optional environment variables:

- `TAVILY_API_KEY`
- `BRAVE_SEARCH_API_KEY`

Priority:

1. Tavily Search API
2. Brave Search API
3. Hao123 fallback matching

## Current Behaviors

- Official-site lookup only auto-runs when creating an icon from the right-click menu.
- Editing an existing item does not auto-rewrite the link.
- Imported `.lnk` shortcuts are added immediately, then icon recommendations are processed in the background.
- Icon recommendations support “refresh batch” with a 3-second cooldown.

## Project Structure

```text
.
├─ index.html
├─ styles.css
├─ script.js
├─ main.js
├─ preload.js
└─ package.json
```

## Scripts

- `npm start` - start the Electron app

## Notes

- This project is currently optimized for Windows desktop usage.
- Some UI text in the repository may still need a final pass for encoding cleanup.

