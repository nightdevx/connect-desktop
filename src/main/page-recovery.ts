import type { BrowserWindow } from "electron";
import { createCrashLoopGuard } from "./window-state";

// How long a page may stay hung after Chromium reports it unresponsive before
// it is killed and reloaded.
const HUNG_PAGE_KILL_MS = 10_000;

// A dead page leaves a window with nothing in it, and since the window draws
// its own title bar, nothing to close it with either; with close-to-tray on,
// closing it only hid the dead page. So the page is reloaded, unless it keeps
// dying: then reloading would only loop.
export const installPageRecovery = (win: BrowserWindow): void => {
  const allowReload = createCrashLoopGuard();
  let hungTimer: NodeJS.Timeout | null = null;

  win.webContents.on("render-process-gone", (_event, details) => {
    if (details.reason === "clean-exit" || win.isDestroyed()) {
      return;
    }
    if (!allowReload(Date.now())) {
      console.error(
        `[window] page gone again (${details.reason}); stopped reloading after repeated crashes`,
      );
      return;
    }
    console.error(`[window] page gone (${details.reason}); reloading`);
    win.webContents.reload();
  });

  win.on("unresponsive", () => {
    console.warn("[window] page unresponsive");
    hungTimer ??= setTimeout(() => {
      hungTimer = null;
      if (!win.isDestroyed()) {
        // Reported as render-process-gone ("killed"), which reloads it.
        win.webContents.forcefullyCrashRenderer();
      }
    }, HUNG_PAGE_KILL_MS);
  });

  win.on("responsive", () => {
    if (hungTimer) {
      clearTimeout(hungTimer);
      hungTimer = null;
    }
  });

  win.on("closed", () => {
    if (hungTimer) {
      clearTimeout(hungTimer);
    }
  });
};
