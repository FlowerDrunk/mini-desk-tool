export function keyboardEventToShortcut(event) {
  const mainKey = normalizeShortcutKey(event);
  if (!mainKey) return "";

  const parts = [];
  if (event.ctrlKey || event.metaKey) parts.push("CommandOrControl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");

  const isFunctionKey = /^F([1-9]|1[0-9]|2[0-4])$/.test(mainKey);
  if (!parts.length && !isFunctionKey) return "";

  parts.push(mainKey);
  return parts.join("+");
}

function normalizeShortcutKey(event) {
  const key = String(event.key || "");
  if (["Control", "Meta", "Alt", "Shift"].includes(key)) return "";
  if (key === " ") return "Space";

  const namedKeys = {
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Esc: "Escape",
    PageUp: "PageUp",
    PageDown: "PageDown"
  };
  if (namedKeys[key]) return namedKeys[key];
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) return key;
  if (/^[a-z]$/i.test(key)) return key.toUpperCase();
  if (/^[0-9]$/.test(key)) return key;
  if (event.code?.startsWith("Key")) return event.code.slice(3).toUpperCase();
  if (event.code?.startsWith("Digit")) return event.code.slice(5);

  return key.length === 1 ? key.toUpperCase() : key;
}
