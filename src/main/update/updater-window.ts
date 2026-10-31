import { app, BrowserWindow, screen } from "electron";
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The window shown while an update installs: native/updater, a small Go
 * program (connect/planlar/masaustu/GUNCELLEME-PENCERESI-PLANI.md).
 *
 * The installer moves everything in Connect's folder out before it writes the
 * new files, so neither Connect nor a program started from that folder can be
 * running. The window is copied to %TEMP% and started from there, follows the
 * install from the outside, and closes once the new Connect is on screen.
 */

// It is on screen in about a second; past this the install goes ahead
// without waiting for it.
const READY_TIMEOUT_MS = 4_000;

export interface UpdaterWindowLaunch {
  /** The downloaded installer, which the window watches until it exits. */
  installer: string | null;
  version: string | null;
  /** Offered when the install fails. */
  releaseUrl: string;
  /** Development: plays the window through an install without one. */
  demo?: "ok" | "error";
}

// The shipped copy (electron-builder.yml, win.extraResources), or in
// development the one `pnpm build:updater` writes.
const sourcePath = (): string =>
  app.isPackaged
    ? join(process.resourcesPath, "updater", "connect-updater.exe")
    : join(app.getAppPath(), "native", "updater", "bin", "connect-updater.exe");

// Centred on Connect's window, in physical pixels: the window is per-monitor
// DPI aware.
const windowCenter = (): { x: number; y: number } | null => {
  const win =
    BrowserWindow.getFocusedWindow() ??
    BrowserWindow.getAllWindows().find((candidate) => candidate.isVisible());
  if (!win || win.isDestroyed() || win.isMinimized()) {
    return null;
  }
  const bounds = win.getBounds();
  const point = screen.dipToScreenPoint({
    x: Math.round(bounds.x + bounds.width / 2),
    y: Math.round(bounds.y + bounds.height / 2),
  });
  return { x: Math.round(point.x), y: Math.round(point.y) };
};

/**
 * Starts the window and resolves true once it says it is on screen. False
 * when it cannot be shown -- not Windows, not built, no WebView2, too slow --
 * and the install then runs unseen, as it did before the window existed.
 */
export const showUpdaterWindow = async (launch: UpdaterWindowLaunch): Promise<boolean> => {
  if (process.platform !== "win32") {
    return false;
  }
  const source = sourcePath();
  if (!existsSync(source)) {
    return false;
  }

  const dir = join(app.getPath("temp"), "connect-updater");
  const exe = join(dir, "connect-updater.exe");
  try {
    mkdirSync(dir, { recursive: true });
    // Throws while a window from an earlier attempt still runs from there.
    copyFileSync(source, exe);
  } catch {
    return false;
  }

  const args = [
    `--parent-pid=${process.pid}`,
    `--app=${process.execPath}`,
    `--release-url=${launch.releaseUrl}`,
  ];
  if (launch.installer) {
    args.push(`--installer=${launch.installer}`);
  }
  if (launch.version) {
    args.push(`--version=${launch.version}`);
  }
  const center = windowCenter();
  if (center) {
    args.push(`--center=${center.x},${center.y}`);
  }
  if (launch.demo) {
    args.push(`--demo=${launch.demo}`);
  }

  return new Promise((resolve) => {
    // Detached, so it outlives Connect: a plain child would be killed with
    // it. Its first line on stdout is "ready".
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(exe, args, {
        detached: true,
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: false,
      });
    } catch {
      // The install must still go ahead: never leave the caller waiting.
      resolve(false);
      return;
    }
    let settled = false;
    const settle = (shown: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      child.stdout?.destroy();
      child.unref();
      resolve(shown);
    };
    const timer = setTimeout(() => settle(false), READY_TIMEOUT_MS);
    child.stdout?.on("data", (chunk: Buffer) => {
      if (chunk.toString("utf8").includes("ready")) {
        settle(true);
      }
    });
    child.on("error", () => settle(false));
    child.on("exit", () => settle(false));
  });
};
