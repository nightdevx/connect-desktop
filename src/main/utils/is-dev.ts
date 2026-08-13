import { app } from "electron";

// Derived from app.isPackaged, never from environment variables.
//
// This used to be `NODE_ENV === "development" || typeof VITE_DEV_SERVER_URL ===
// "string"`, which meant anyone able to launch the installed exe with a
// modified environment (a dropped shortcut, a batch file, any user-level
// malware) could set VITE_DEV_SERVER_URL and have the production preload —
// and therefore the whole window.desktopApi surface — attached to a page they
// control.
export const isDev = !app.isPackaged;

// The dev server URL is only honoured in a development run. Callers should use
// this rather than reading process.env directly.
export const devServerUrl = isDev
  ? process.env.VITE_DEV_SERVER_URL?.trim() || null
  : null;
