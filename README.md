# Mini Desk Tool

[简体中文](./README.zh-CN.md)

Mini Desk Tool is a lightweight Electron desktop panel for Windows. It stays attached to the desktop, keeps a compact floating footprint, and lets you organize website links and local shortcuts into tidy groups.

## Features

- Desktop-attached floating panel with edge snapping
- Grouped icon layout with configurable flow direction and track count
- Add website links from the panel UI or the context menu
- Edit title, description, link or path, size, group, and icon source
- Drag files, folders, apps, and `.lnk` shortcuts directly into the panel
- Open local files, folders, apps, and web links from the same launcher surface
- Prefer Windows-native icons for imported local entries
- Icon suggestions from Iconfont with batch refresh
- Original icon fallback for website links and imported Windows shortcuts
- Automatic grouping based on title, description, and hostname
- Adaptive panel width based on the widest group

## Tech Stack

- Electron
- Plain HTML / CSS / JavaScript
- Electron native shell APIs
- `windows-shortcuts` as a fallback for `.lnk` resolution

## Requirements

- Windows
- Node.js 18+

## Getting Started

```bash
npm install
npm start
```

## Build

```bash
npm run build
```

The Windows installer will be generated in `dist/`.

## Optional Search APIs

The app can use search APIs to improve official-site lookup accuracy.

Optional environment variables:

- `TAVILY_API_KEY`
- `BRAVE_SEARCH_API_KEY`

Priority order:

1. Tavily Search API
2. Brave Search API
3. Hao123 fallback matching

## Current Behaviors

- Official-site lookup only auto-runs when creating an icon from the right-click menu.
- Editing an existing item does not auto-rewrite the link.
- Imported local entries are added immediately.
- Imported web shortcuts can continue icon enrichment in the background when needed.
- Icon recommendation refresh has a 3-second cooldown.

## Project Structure

```text
.
|-- index.html
|-- styles.css
|-- script.js
|-- main.js
|-- preload.js
`-- package.json
```

## Scripts

- `npm start` - start the Electron app
- `npm run build` - build the Windows installer

## Notes

- This project is currently optimized for Windows desktop usage.
- Some legacy UI strings in the repository still need a broader encoding cleanup pass.
