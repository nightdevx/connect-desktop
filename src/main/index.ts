import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  session,
  shell,
} from "electron";
import { join } from "node:path";
import * as Sentry from "@sentry/electron/main";
import { devServerUrl, isDev } from "./utils/is-dev";
import {
  getDesktopAppPreferences,
  onDesktopAppPreferencesChanged,
  peekDesktopAppPreferences,
} from "./app-preferences";
import { applyMediaEngineSwitches } from "./media-engine-flags";
import { backendConfig } from "./config";
import { KLIPY_API_HOSTNAME } from "./clients/klipy-client";

// Initialize Sentry for main process after env files are resolved by config
if (process.env.SENTRY_DSN && !isDev) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    // The GIF provider takes its API key as a URL PATH SEGMENT, and Sentry's
    // HTTP/fetch integrations record request URLs verbatim as breadcrumbs --
    // which then ride along on every unrelated error report. Dropping the
    // provider's breadcrumbs is what keeps the key out of Sentry; the fetch
    // living in main only keeps it out of the renderer.
    beforeBreadcrumb: (breadcrumb) => {
      const url = breadcrumb.data?.url;
      if (typeof url === "string" && url.includes(KLIPY_API_HOSTNAME)) {
        return null;
      }
      return breadcrumb;
    },
  });
}
import { cleanupBeforeAppQuit, registerIpcHandlers } from "./ipc";
import {
  startFreeGamesPoller,
  stopFreeGamesPoller,
} from "./free-games-poller";
import { disposeGlobalHotkeys, installGlobalHotkeys } from "./global-hotkeys";
import { clearDesktopNotifications } from "./notifications";
import { createAppMenu } from "./menu";

import {
  registerStreamingIpcHandlers,
  unregisterStreamingIpcHandlers,
} from "./streaming/ipc";
import {
  checkForAppUpdates,
  destroyModularUpdater,
  initializeModularUpdater,
  installDownloadedAppUpdate,
} from "./update";
import {
  isUpdaterHelperModeProcess,
  runUpdaterHelperMode,
} from "./update/helper-mode";

let mainWindow: BrowserWindow | null = null;
let quittingWithCleanup = false;
let tray: Tray | null = null;
let unsubscribePreferencesListener: (() => void) | null = null;


const WINDOW_STATE_EVENT_CHANNEL = "desktop:window-state-changed";
const isLinux = process.platform === "linux";
const APP_ICON_PATH = join(
  __dirname,
  isLinux ? "../../public/images/logo.png" : "../../public/images/logo.ico"
);
const APP_DISPLAY_NAME = "Connect";

// Development-only. It exists so `dev:dual` can run two instances with separate
// profiles; honouring it in a packaged build would let anyone who can set an
// environment variable choose where session.json is read from and written to.
const applyUserDataOverride = (): void => {
  if (!isDev) {
    return;
  }

  const overridePath = process.env.CT_USER_DATA_DIR?.trim();
  if (!overridePath) {
    return;
  }

  const absoluteUserDataPath = join(process.cwd(), overridePath);
  app.setPath("userData", absoluteUserDataPath);
  app.setPath("sessionData", join(absoluteUserDataPath, "session-data"));
};

applyUserDataOverride();

// Must run after the userData override (the preference file lives there) and
// before app.whenReady() — command-line switches are read at GPU process spawn.
// peek* is used instead of get* on purpose: get* touches app.getLoginItemSettings(),
// which is not safe this early.
applyMediaEngineSwitches(peekDesktopAppPreferences().hardwareAcceleration);

const isUpdaterHelperMode = isUpdaterHelperModeProcess();
const hasSingleInstanceLock = isUpdaterHelperMode
  ? true
  : app.requestSingleInstanceLock();

if (!isUpdaterHelperMode && !hasSingleInstanceLock) {
  app.quit();
}

if (isUpdaterHelperMode) {
  runUpdaterHelperMode();
}

const emitWindowState = (win: BrowserWindow): void => {
  if (win.isDestroyed()) {
    return;
  }

  win.webContents.send(WINDOW_STATE_EVENT_CHANNEL, {
    isMaximized: win.isMaximized(),
  });
};

const showMainWindowFromTray = (): void => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow();
    return;
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.focus();
};

const destroyTray = (): void => {
  if (!tray) {
    return;
  }

  tray.destroy();
  tray = null;
};

const buildTrayMenu = (): Menu => {
  return Menu.buildFromTemplate([
    {
      label: "Connect'i Aç",
      click: () => {
        showMainWindowFromTray();
      },
    },
    {
      type: "separator",
    },
    {
      label: "Çıkış",
      click: () => {
        app.quit();
      },
    },
  ]);
};

const ensureTray = (): void => {
  if (tray) {
    return;
  }

  const icon = nativeImage.createFromPath(APP_ICON_PATH);
  tray = new Tray(icon);
  tray.setToolTip(APP_DISPLAY_NAME);
  tray.setContextMenu(buildTrayMenu());
  tray.on("click", () => {
    showMainWindowFromTray();
  });
  tray.on("double-click", () => {
    showMainWindowFromTray();
  });
};

const hasTrayBehaviorEnabled = (): boolean => {
  const preferences = getDesktopAppPreferences();
  return preferences.minimizeToTray || preferences.closeToTray;
};

const syncTrayWithPreferences = (): void => {
  if (hasTrayBehaviorEnabled()) {
    ensureTray();
    return;
  }

  if (!tray) {
    return;
  }

  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
    return;
  }

  destroyTray();
};

const hideWindowToTray = (win: BrowserWindow): void => {
  ensureTray();
  win.hide();
};

// The only pages this app may ever render: the packaged renderer bundle, and
// the Vite dev server in a development run.
const isTrustedAppUrl = (rawUrl: string): boolean => {
  if (!rawUrl) {
    return false;
  }

  if (devServerUrl && rawUrl.startsWith(devServerUrl)) {
    return true;
  }

  return rawUrl.startsWith("file://");
};

// Nothing stopped the renderer from navigating away from the app bundle. Any
// XSS in a render path, or a hijacked dev-server URL, would have given an
// attacker a persistent privileged origin: the preload re-attaches to the new
// page, and because the window is frameless there is no address bar to show
// the swap.
const installNavigationGuards = (win: BrowserWindow): void => {
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Hand real links to the OS browser; never open a second privileged window.
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedAppUrl(url)) {
      event.preventDefault();
      console.warn(`[security] blocked navigation to ${url}`);
    }
  });
};

// Electron approves every permission request when no handler is installed.
// The app legitimately needs mic, camera and screen capture, but only from its
// own page.
const installPermissionHandlers = (): void => {
  // "fullscreen" is what Electron asks for when the renderer calls
  // Element.requestFullscreen(). Leaving it out silently rejected every
  // request, so the tile fullscreen buttons did nothing at all.
  const allowed = new Set([
    "media",
    "clipboard-sanitized-write",
    "notifications",
    "fullscreen",
  ]);

  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const url = webContents?.getURL() ?? "";
      callback(isTrustedAppUrl(url) && allowed.has(permission));
    },
  );

  session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission, requestingOrigin) =>
      allowed.has(permission) &&
      (requestingOrigin.startsWith("file://") ||
        Boolean(devServerUrl && requestingOrigin.startsWith(devServerUrl))),
  );
};

// A <webview> would get its own webContents outside every guard above.
app.on("web-contents-created", (_event, contents) => {
  contents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
});

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    frame: false,
    show: false,
    icon: nativeImage.createFromPath(APP_ICON_PATH),
    // Matches --ct-surface-0. It was a navy that appears nowhere in the app, so
    // the window opened on a blue frame before the first paint replaced it.
    backgroundColor: "#040404",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Chromium throttles a hidden window's timers to about one tick a second,
      // then to roughly one a minute after a few minutes. Every lobby timer
      // lives in the renderer — the membership heartbeat and the whole
      // reconnect backoff chain — so minimising the app while sitting in voice
      // starved the heartbeat until the server reaped the member as stale.
      // Sitting in a room with the window in the background is the normal way
      // to use this app, not an edge case.
      backgroundThrottling: false,
    },
  });

  installNavigationGuards(win);

  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  if (isDev) {
    win.webContents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown" && input.key === "F12") {
        win.webContents.toggleDevTools();
        event.preventDefault();
      }
    });
  }

  win.once("ready-to-show", () => {
    win.show();
    emitWindowState(win);
  });

  win.on("maximize", () => emitWindowState(win));
  win.on("unmaximize", () => emitWindowState(win));

  win.on("close", (event) => {
    if (quittingWithCleanup) {
      return;
    }

    const preferences = getDesktopAppPreferences();
    if (!preferences.closeToTray) {
      return;
    }

    event.preventDefault();
    hideWindowToTray(win);
  });

  win.on("show", () => {
    syncTrayWithPreferences();
  });

  return win;
}

if (!isUpdaterHelperMode && hasSingleInstanceLock) {
  app.on("second-instance", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.focus();
  });

  app.whenReady().then(() => {
    const envPathLabel = backendConfig.envFilePath ?? "not-found";
    console.info(
      `[Connect] Backend: ${backendConfig.url} (source=${backendConfig.source}, env=${envPathLabel})`,
    );

    installPermissionHandlers();

    initializeModularUpdater({
      beforeInstall: cleanupBeforeAppQuit,
      periodicCheckMs: 15 * 60 * 1000,
    });
    registerIpcHandlers();
    registerStreamingIpcHandlers();
    installGlobalHotkeys();
    // Runs for the whole session, not only while the page is open: a
    // giveaway that starts while the app sits in the tray is exactly the one
    // worth a toast.
    startFreeGamesPoller();

    if (!unsubscribePreferencesListener) {
      unsubscribePreferencesListener = onDesktopAppPreferencesChanged(() => {
        syncTrayWithPreferences();
      });
    }

    createAppMenu({
      checkForUpdates: async () => {
        await checkForAppUpdates();
      },
      installDownloadedUpdate: async () => {
        await installDownloadedAppUpdate();
      },
    });

    mainWindow = createMainWindow();
    syncTrayWithPreferences();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow();
      }

      showMainWindowFromTray();
    });
  });

  app.on("before-quit", (event) => {
    if (quittingWithCleanup) {
      return;
    }

    event.preventDefault();
    quittingWithCleanup = true;

    const maxWaitMs = 1200;
    const timeout = new Promise<void>((resolve) => {
      setTimeout(resolve, maxWaitMs);
    });

    void Promise.race([cleanupBeforeAppQuit(), timeout]).finally(() => {
      unregisterStreamingIpcHandlers();
      disposeGlobalHotkeys();
      clearDesktopNotifications();
      stopFreeGamesPoller();
      destroyModularUpdater();
      if (unsubscribePreferencesListener) {
        unsubscribePreferencesListener();
        unsubscribePreferencesListener = null;
      }
      destroyTray();
      app.quit();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
