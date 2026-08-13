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

// Initialize Sentry for main process after env files are resolved by config
if (process.env.SENTRY_DSN && !isDev) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
  });
}
import { cleanupBeforeAppQuit, registerIpcHandlers } from "./ipc";
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
  const allowed = new Set(["media", "clipboard-sanitized-write", "notifications"]);

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
    backgroundColor: "#0b1020",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
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
