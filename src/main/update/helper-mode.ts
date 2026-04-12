import { app, BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import type { ProgressInfo } from "electron-updater";

type HelperPhase =
  | "handoff"
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "not-available"
  | "error";

interface HelperWindowState {
  title: string;
  message: string;
  progressPercent: number | null;
  phase: HelperPhase;
}

interface HelperArgs {
  parentPid: number | null;
  targetVersion: string | null;
}

const helperFlag = "--ct-updater-helper";
const parentPidArgPrefix = "--ct-updater-parent-pid=";
const versionArgPrefix = "--ct-updater-version=";

const delay = (ms: number): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const createHelperWindowHtml = (): string => {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Connect Updater</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: "Trebuchet MS", "Century Gothic", Verdana, sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at 10% 14%, rgba(52, 211, 153, 0.16), transparent 38%),
          radial-gradient(circle at 88% 84%, rgba(56, 189, 248, 0.22), transparent 40%),
          linear-gradient(165deg, #081221 0%, #0e1d33 48%, #0b1426 100%);
        color: #e8f8ff;
      }
      .card {
        width: min(500px, calc(100vw - 32px));
        border-radius: 18px;
        border: 1px solid rgba(125, 211, 252, 0.3);
        background: linear-gradient(170deg, rgba(5, 28, 50, 0.86), rgba(6, 18, 36, 0.9));
        box-shadow:
          0 24px 48px rgba(0, 0, 0, 0.42),
          inset 0 1px 0 rgba(255, 255, 255, 0.08);
        padding: 18px;
      }
      .head {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .brand {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        display: grid;
        place-items: center;
        background: linear-gradient(145deg, #38bdf8, #34d399);
        color: #06253c;
        font-weight: 800;
        letter-spacing: 0.04em;
      }
      .sub {
        display: block;
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #9ad5f0;
      }
      .title {
        margin: 0;
        font-size: 17px;
      }
      .message {
        margin: 10px 0 0;
        min-height: 42px;
        color: #c7e4f5;
        line-height: 1.45;
      }
      .progress-wrap {
        margin-top: 12px;
      }
      .progress {
        width: 100%;
        height: 11px;
        border-radius: 999px;
        border: 1px solid rgba(147, 197, 253, 0.25);
        background: rgba(255, 255, 255, 0.07);
        overflow: hidden;
      }
      .bar {
        width: 0%;
        height: 100%;
        background: linear-gradient(90deg, #38bdf8, #34d399);
        transition: width 180ms ease;
      }
      .percent {
        margin-top: 7px;
        font-size: 12px;
        color: #9dcfe8;
      }
      .hint {
        margin: 12px 0 0;
        font-size: 11px;
        color: #7fa5b9;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <header class="head">
        <div class="brand">CT</div>
        <div>
          <span class="sub">Connect Together</span>
          <h1 class="title" id="title">Desktop Updater</h1>
        </div>
      </header>
      <p class="message" id="message">Updater baslatiliyor...</p>
      <div class="progress-wrap" id="progress-wrap">
        <div class="progress"><div class="bar" id="bar"></div></div>
        <div class="percent" id="percent">Bekleniyor</div>
      </div>
      <p class="hint">Ana uygulama kapandiktan sonra guncelleme otomatik kurulur.</p>
    </main>
    <script>
      window.__connectUpdaterHelperSetState = (payload) => {
        const titleEl = document.getElementById("title");
        const messageEl = document.getElementById("message");
        const wrapEl = document.getElementById("progress-wrap");
        const barEl = document.getElementById("bar");
        const percentEl = document.getElementById("percent");

        if (titleEl && typeof payload.title === "string") {
          titleEl.textContent = payload.title;
        }

        if (messageEl && typeof payload.message === "string") {
          messageEl.textContent = payload.message;
        }

        const hasProgress =
          typeof payload.progressPercent === "number" &&
          Number.isFinite(payload.progressPercent);

        if (wrapEl) {
          wrapEl.style.display = hasProgress ? "block" : "none";
        }

        if (hasProgress) {
          const clamped = Math.max(0, Math.min(100, payload.progressPercent));
          if (barEl) {
            barEl.style.width = clamped.toFixed(2) + "%";
          }
          if (percentEl) {
            percentEl.textContent = "%" + clamped.toFixed(2);
          }
        }
      };
    </script>
  </body>
</html>`;
};

const getArgValue = (prefix: string): string | null => {
  const matched = process.argv.find((arg) => arg.startsWith(prefix));
  if (!matched) {
    return null;
  }

  return matched.slice(prefix.length).trim() || null;
};

const parseHelperArgs = (): HelperArgs => {
  const parentPidRaw = getArgValue(parentPidArgPrefix);
  const parsedParentPid = parentPidRaw ? Number(parentPidRaw) : NaN;

  return {
    parentPid:
      Number.isFinite(parsedParentPid) && parsedParentPid > 0
        ? parsedParentPid
        : null,
    targetVersion: getArgValue(versionArgPrefix),
  };
};

const isProcessRunning = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const createHelperWindow = (): {
  win: BrowserWindow;
  setState: (state: HelperWindowState) => void;
} => {
  const win = new BrowserWindow({
    width: 520,
    height: 310,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    show: false,
    title: "Connect Updater",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  let loaded = false;
  let pending: HelperWindowState | null = null;

  const flush = (): void => {
    if (!loaded || win.isDestroyed() || !pending) {
      return;
    }

    const state = pending;
    pending = null;

    const script = `window.__connectUpdaterHelperSetState && window.__connectUpdaterHelperSetState(${JSON.stringify(state)});`;
    void win.webContents.executeJavaScript(script, true).catch(() => {
      // Window may close while helper is exiting.
    });
  };

  win.webContents.on("did-finish-load", () => {
    loaded = true;
    flush();
  });

  win.once("ready-to-show", () => {
    if (win.isDestroyed()) {
      return;
    }

    win.show();
    win.focus();
    flush();
  });

  const html = createHelperWindowHtml();
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  void win.loadURL(dataUrl);

  const setState = (state: HelperWindowState): void => {
    pending = state;
    flush();
  };

  return { win, setState };
};

const buildWindowState = (
  phase: HelperPhase,
  targetVersion: string | null,
  message: string,
  progressPercent: number | null = null,
): HelperWindowState => {
  const version = targetVersion ?? app.getVersion();

  return {
    title: `Connect Updater v${version}`,
    message,
    progressPercent,
    phase,
  };
};

const waitForParentExit = async (
  parentPid: number | null,
  onTick: (message: string) => void,
): Promise<void> => {
  if (!parentPid || parentPid === process.pid) {
    return;
  }

  const timeoutMs = 30_000;
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (!isProcessRunning(parentPid)) {
      return;
    }

    onTick("Ana uygulamanin kapanmasi bekleniyor...");
    await delay(250);
  }

  onTick("Ana uygulama kapanmadi, guncelleme kurulumu zorlanacak.");
};

const runInstallOrchestrator = async (
  targetVersion: string | null,
  setState: (state: HelperWindowState) => void,
): Promise<void> => {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;

  let installTriggered = false;

  const safeQuitLater = (ms: number): void => {
    setTimeout(() => {
      app.quit();
    }, ms);
  };

  const triggerInstall = (): void => {
    if (installTriggered) {
      return;
    }

    installTriggered = true;
    setState(
      buildWindowState(
        "installing",
        targetVersion,
        "Guncelleme kuruluyor. Kurulum bitince uygulama otomatik acilacak.",
      ),
    );

    setTimeout(() => {
      try {
        autoUpdater.quitAndInstall(true, true);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Kurulum baslatilamadi";
        setState(
          buildWindowState(
            "error",
            targetVersion,
            `Guncelleme hatasi: ${message}`,
          ),
        );
        safeQuitLater(6000);
      }
    }, 1000);
  };

  autoUpdater.on("checking-for-update", () => {
    setState(
      buildWindowState(
        "checking",
        targetVersion,
        "Yeni surum kontrol ediliyor...",
      ),
    );
  });

  autoUpdater.on("update-available", () => {
    setState(
      buildWindowState(
        "available",
        targetVersion,
        "Guncelleme bulundu, indiriliyor...",
      ),
    );
  });

  autoUpdater.on("download-progress", (progress: ProgressInfo) => {
    const percent = Number.isFinite(progress.percent)
      ? Math.max(0, Math.min(100, Number(progress.percent.toFixed(2))))
      : null;

    setState(
      buildWindowState(
        "downloading",
        targetVersion,
        "Guncelleme indiriliyor...",
        percent,
      ),
    );
  });

  autoUpdater.on("update-downloaded", () => {
    triggerInstall();
  });

  autoUpdater.on("update-not-available", () => {
    if (installTriggered) {
      return;
    }

    setState(
      buildWindowState(
        "not-available",
        targetVersion,
        "Kurulabilir yeni surum bulunamadi.",
      ),
    );
    safeQuitLater(5000);
  });

  autoUpdater.on("error", (error) => {
    const message =
      error instanceof Error ? error.message : "Beklenmeyen updater hatasi";

    setState(
      buildWindowState("error", targetVersion, `Guncelleme hatasi: ${message}`),
    );
    safeQuitLater(7000);
  });

  setState(
    buildWindowState("checking", targetVersion, "Kurulum hazirlaniyor..."),
  );

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Guncelleme kontrolu basarisiz";
    setState(
      buildWindowState(
        "error",
        targetVersion,
        `Guncelleme kontrolu basarisiz: ${message}`,
      ),
    );
    safeQuitLater(7000);
  }
};

const runHelper = async (): Promise<void> => {
  if (!app.isPackaged) {
    app.quit();
    return;
  }

  const args = parseHelperArgs();
  const { setState } = createHelperWindow();

  setState(
    buildWindowState(
      "handoff",
      args.targetVersion,
      "Updater yardimci sureci basladi.",
    ),
  );

  await waitForParentExit(args.parentPid, (message) => {
    setState(buildWindowState("handoff", args.targetVersion, message));
  });

  await runInstallOrchestrator(args.targetVersion, setState);
};

export const isUpdaterHelperModeProcess = (): boolean => {
  return process.argv.includes(helperFlag);
};

export const runUpdaterHelperMode = (): void => {
  app.whenReady().then(() => {
    void runHelper();
  });

  app.on("window-all-closed", () => {
    app.quit();
  });
};
