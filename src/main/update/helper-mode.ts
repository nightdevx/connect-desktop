import { app, BrowserWindow } from "electron";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
const mockFlag = "--ct-updater-mock";
const parentPidArgPrefix = "--ct-updater-parent-pid=";
const versionArgPrefix = "--ct-updater-version=";

const delay = (ms: number): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const resolveLogoDataUrl = (): string | null => {
  const candidates = [
    join(__dirname, "../../public/images/logo.png"),
    join(app.getAppPath(), "public/images/logo.png"),
    join(app.getAppPath(), "dist/public/images/logo.png"),
    join(process.resourcesPath, "public/images/logo.png"),
    join(process.resourcesPath, "images/logo.png"),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }

    try {
      const raw = readFileSync(candidate);
      return `data:image/png;base64,${raw.toString("base64")}`;
    } catch {
      // Try next candidate path.
    }
  }

  return null;
};

const createHelperWindowHtml = (logoDataUrl: string | null): string => {
  const logoMarkup = logoDataUrl
    ? `<img src="${logoDataUrl}" alt="Connect logo" />`
    : `<div class="brand-fallback">CT</div>`;

  return `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Connect Updater</title>
    <style>
      :root {
        color-scheme: dark;
        --bg-top: #0b1120;
        --bg-mid: #111a31;
        --bg-bottom: #090f1f;
        --accent-a: #3b82f6;
        --accent-b: #60a5fa;
        --text-main: #e2e8f0;
        --text-soft: #cbd5e1;
        --text-muted: #94a3b8;
        --surface: rgba(24, 31, 54, 0.88);
        --surface-soft: rgba(15, 23, 42, 0.7);
        --border: rgba(148, 163, 184, 0.25);
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      }
      * {
        box-sizing: border-box;
        user-select: none;
        -webkit-user-select: none;
        -ms-user-select: none;
      }
      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        min-height: 100%;
        overflow: hidden;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at 8% 14%, rgba(52, 211, 153, 0.2), transparent 44%),
          radial-gradient(circle at 86% 80%, rgba(56, 189, 248, 0.26), transparent 42%),
          linear-gradient(165deg, var(--bg-top) 0%, var(--bg-mid) 50%, var(--bg-bottom) 100%);
        color: var(--text-main);
      }
      .ambient {
        position: fixed;
        inset: 0;
        pointer-events: none;
        overflow: hidden;
      }
      .ambient::before,
      .ambient::after {
        content: "";
        position: absolute;
        border-radius: 999px;
        filter: blur(34px);
        opacity: 0.35;
        animation: drift 9s ease-in-out infinite alternate;
      }
      .ambient::before {
        width: 210px;
        height: 210px;
        top: -64px;
        left: -40px;
        background: rgba(56, 189, 248, 0.42);
      }
      .ambient::after {
        width: 260px;
        height: 260px;
        right: -60px;
        bottom: -84px;
        background: rgba(52, 211, 153, 0.35);
        animation-duration: 11s;
      }
      .card {
        width: min(520px, calc(100vw - 32px));
        max-height: calc(100vh - 28px);
        border-radius: 22px;
        border: 1px solid var(--border);
        background: linear-gradient(165deg, var(--surface), rgba(11, 16, 32, 0.96));
        box-shadow:
          0 20px 44px rgba(2, 6, 23, 0.56),
          inset 0 1px 0 rgba(255, 255, 255, 0.06);
        backdrop-filter: blur(6px);
        padding: 20px 20px 18px;
        overflow: hidden;
        animation: lift 420ms ease-out both;
      }
      .head {
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .brand {
        width: 40px;
        height: 40px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(15, 23, 42, 0.9);
        border: 1px solid rgba(148, 163, 184, 0.3);
        box-shadow: 0 8px 16px rgba(2, 6, 23, 0.5);
        overflow: hidden;
      }
      .brand img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .brand-fallback {
        color: #dbeafe;
        font-weight: 700;
        font-size: 12px;
        letter-spacing: 0.04em;
      }
      .sub {
        display: block;
        font-size: 10px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #99cee8;
      }
      .title {
        margin: 0;
        font-size: 18px;
      }
      .status {
        margin-top: 10px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        color: var(--text-soft);
        background: var(--surface-soft);
        border: 1px solid var(--border);
        border-radius: 999px;
        padding: 5px 10px;
      }
      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: #3b82f6;
        box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.6);
        animation: pulse 1.5s ease-out infinite;
      }
      .message {
        margin: 14px 0 0;
        min-height: 46px;
        color: #d3edf9;
        line-height: 1.45;
      }
      .progress-wrap {
        margin-top: 16px;
      }
      .progress {
        position: relative;
        width: 100%;
        height: 12px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: rgba(30, 41, 59, 0.7);
        overflow: hidden;
      }
      .progress::after {
        content: "";
        position: absolute;
        top: 0;
        left: -45%;
        width: 40%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.34), transparent);
        animation: sweep 1.9s linear infinite;
        pointer-events: none;
      }
      .bar {
        width: 0%;
        height: 100%;
        background: linear-gradient(90deg, var(--accent-a), var(--accent-b));
        transition: width 180ms ease;
      }
      .percent {
        margin-top: 7px;
        font-size: 12px;
        color: var(--text-soft);
        letter-spacing: 0.02em;
      }
      .hint {
        margin: 14px 0 0;
        font-size: 11px;
        color: var(--text-muted);
      }
      @keyframes pulse {
        0% {
          box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.55);
        }
        100% {
          box-shadow: 0 0 0 10px rgba(59, 130, 246, 0);
        }
      }
      @keyframes sweep {
        to {
          left: 120%;
        }
      }
      @keyframes drift {
        to {
          transform: translateY(-10px) translateX(16px);
        }
      }
      @keyframes lift {
        from {
          opacity: 0;
          transform: translateY(10px) scale(0.99);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
    </style>
  </head>
  <body>
    <div class="ambient" aria-hidden="true"></div>
    <main class="card">
      <header class="head">
        <div class="brand">${logoMarkup}</div>
        <div>
          <span class="sub">Connect Together</span>
          <h1 class="title" id="title">Desktop Updater</h1>
        </div>
      </header>
      <div class="status"><span class="status-dot"></span><span>Güncelleme servisi etkin</span></div>
      <p class="message" id="message">Güncelleyici başlatılıyor...</p>
      <div class="progress-wrap" id="progress-wrap">
        <div class="progress"><div class="bar" id="bar"></div></div>
        <div class="percent" id="percent">Bekleniyor</div>
      </div>
      <p class="hint">Ana uygulama kapandıktan sonra güncelleme otomatik kurulur.</p>
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
    frame: false,
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

  const html = createHelperWindowHtml(resolveLogoDataUrl());
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

  onTick("Ana uygulama kapanmadı, güncelleme kurulumu zorlanacak.");
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
        "Güncelleme kuruluyor. Kurulum bitince uygulama otomatik açılacak.",
      ),
    );

    setTimeout(() => {
      try {
        autoUpdater.quitAndInstall(true, true);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Kurulum başlatılamadı";
        setState(
          buildWindowState(
            "error",
            targetVersion,
            `Güncelleme hatası: ${message}`,
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
        "Yeni sürüm kontrol ediliyor...",
      ),
    );
  });

  autoUpdater.on("update-available", () => {
    setState(
      buildWindowState(
        "available",
        targetVersion,
        "Güncelleme bulundu, indiriliyor...",
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
        "Güncelleme indiriliyor...",
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
        "Kurulabilir yeni sürüm bulunamadı.",
      ),
    );
    safeQuitLater(5000);
  });

  autoUpdater.on("error", (error) => {
    const message =
      error instanceof Error
        ? error.message
        : "Beklenmeyen güncelleyici hatası";

    setState(
      buildWindowState("error", targetVersion, `Güncelleme hatası: ${message}`),
    );
    safeQuitLater(7000);
  });

  setState(
    buildWindowState("checking", targetVersion, "Kurulum hazırlanıyor..."),
  );

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Güncelleme kontrolü başarısız";
    setState(
      buildWindowState(
        "error",
        targetVersion,
        `Güncelleme kontrolü başarısız: ${message}`,
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
      "Güncelleyici yardımcı süreci başlatıldı.",
    ),
  );

  await waitForParentExit(args.parentPid, (message) => {
    setState(buildWindowState("handoff", args.targetVersion, message));
  });

  await runInstallOrchestrator(args.targetVersion, setState);
};

const runMockHelper = async (): Promise<void> => {
  const targetVersion =
    getArgValue(versionArgPrefix) ?? `${app.getVersion()}-mock`;
  const { setState } = createHelperWindow();

  setState(
    buildWindowState(
      "checking",
      targetVersion,
      "Mock: yeni sürüm kontrol ediliyor...",
    ),
  );

  await delay(900);

  setState(
    buildWindowState("available", targetVersion, "Mock: güncelleme bulundu."),
  );

  await delay(900);

  for (let progress = 0; progress <= 100; progress += 5) {
    setState(
      buildWindowState(
        "downloading",
        targetVersion,
        "Mock: güncelleme indiriliyor...",
        progress,
      ),
    );
    await delay(120);
  }

  setState(
    buildWindowState(
      "installing",
      targetVersion,
      "Mock: güncelleme kuruluyor...",
      100,
    ),
  );

  await delay(1800);

  setState(
    buildWindowState(
      "installing",
      targetVersion,
      "Mock tamamlandı. Pencere kapanıyor...",
      100,
    ),
  );

  await delay(1500);
  app.quit();
};

export const isUpdaterHelperModeProcess = (): boolean => {
  return process.argv.includes(helperFlag) || process.argv.includes(mockFlag);
};

export const launchMockUpdaterWindow = (): {
  started: boolean;
  reason?: string;
} => {
  if (isUpdaterHelperModeProcess()) {
    return { started: false, reason: "ALREADY_IN_HELPER_MODE" };
  }

  const versionLabel = `${app.getVersion()}-mock`;
  const args = app.isPackaged
    ? [mockFlag, `${versionArgPrefix}${versionLabel}`]
    : [
        ...process.argv.slice(1),
        mockFlag,
        `${versionArgPrefix}${versionLabel}`,
      ];

  try {
    const child = spawn(process.execPath, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });

    child.unref();
    return { started: true };
  } catch {
    return { started: false, reason: "SPAWN_FAILED" };
  }
};

export const runUpdaterHelperMode = (): void => {
  app.whenReady().then(() => {
    if (process.argv.includes(mockFlag)) {
      void runMockHelper();
      return;
    }

    void runHelper();
  });

  app.on("window-all-closed", () => {
    app.quit();
  });
};
