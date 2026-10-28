import type { BrowserWindow, BrowserWindowConstructorOptions } from "electron";

// On Windows the minimise, maximise and close buttons are the system's own,
// drawn over the right end of the page's title bar (Window Controls Overlay).
// Only real caption buttons get Windows 11's Snap Layouts flyout on the
// maximise button, and they keep working when the page is dead. Elsewhere the
// window stays frameless and the page draws its own buttons. App.tsx makes the
// same platform test to leave that corner empty.
export const usesNativeWindowControls = process.platform === "win32";

// --ct-titlebar-height
const TITLEBAR_HEIGHT = 48;

// Per theme: the title bar's resulting colour (--ct-panel over the page
// background) and its icon colour (--ct-text-muted).
const OVERLAY_COLORS = {
  dark: { color: "#0e0e0e", symbolColor: "#8f8f8f" },
  light: { color: "#f9f9fa", symbolColor: "#6b6b73" },
} as const;

export const titleBarWindowOptions = (): BrowserWindowConstructorOptions =>
  usesNativeWindowControls
    ? {
        titleBarStyle: "hidden",
        // Dark is the default theme; the page sends its own as it starts.
        titleBarOverlay: { ...OVERLAY_COLORS.dark, height: TITLEBAR_HEIGHT },
      }
    : { frame: false };

export const setTitleBarTheme = (win: BrowserWindow, mode: unknown): void => {
  if (!usesNativeWindowControls) {
    return;
  }
  win.setTitleBarOverlay({
    ...OVERLAY_COLORS[mode === "light" ? "light" : "dark"],
    height: TITLEBAR_HEIGHT,
  });
};
