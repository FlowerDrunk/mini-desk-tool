import { ensureDesktopPanelBridge } from "./desktop-panel.js";
import { createDesktopPanelApp } from "./features/desktop-panel/app.js";
import "./styles.css";

await ensureDesktopPanelBridge();

createDesktopPanelApp().initialize();
