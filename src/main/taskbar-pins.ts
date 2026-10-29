import { app, shell } from "electron";
import { readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Taskbar pins made before 0.3.0 carry the old AppUserModelID
 * ("electron.app.Connect"): the window, now under the appId, no longer groups
 * with them and a second taskbar button appears next to the pin. The installer
 * re-stamps only the Start menu and desktop shortcuts, so the app re-stamps the
 * pins that start this executable. Explorer may only pick it up at the next
 * sign-in.
 */
export const fixPinnedTaskbarShortcuts = (appUserModelId: string): void => {
  const pinsDir = join(
    app.getPath("appData"),
    "Microsoft",
    "Internet Explorer",
    "Quick Launch",
    "User Pinned",
    "TaskBar",
  );

  let names: string[];
  try {
    names = readdirSync(pinsDir);
  } catch {
    return;
  }

  const executable = process.execPath.toLowerCase();
  for (const name of names) {
    if (!name.toLowerCase().endsWith(".lnk")) {
      continue;
    }

    const linkPath = join(pinsDir, name);
    try {
      const link = shell.readShortcutLink(linkPath);
      if (link.target.toLowerCase() === executable && link.appUserModelId !== appUserModelId) {
        shell.writeShortcutLink(linkPath, "update", { target: link.target, appUserModelId });
      }
    } catch {
      // Not a shortcut Windows can read, or one we may not write: leave it.
    }
  }
};
