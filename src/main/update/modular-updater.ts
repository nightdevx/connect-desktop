import { app, BrowserWindow, dialog } from "electron";
import { autoUpdater } from "electron-updater";
import type { ProgressInfo, UpdateInfo } from "electron-updater";
import {
  UPDATE_EVENT_CHANNEL,
  type AppUpdateEvent,
  type AppUpdatePhase,
  type AppUpdateSnapshot,
} from "../../shared/update-contracts";

interface ModularUpdaterOptions {
  beforeInstall: () => Promise<void>;
  startupCheckDelayMs?: number;
  periodicCheckMs?: number;
}

export interface CheckForUpdatesResponse {
  requested: boolean;
  reason?: string;
}

export interface InstallUpdateResponse {
  accepted: boolean;
  reason?: string;
}

const defaultStartupCheckDelayMs = 15_000;
const defaultPeriodicCheckMs = 4 * 60 * 60 * 1_000;

class ModularUpdater {
  private initialized = false;
  private listenersBound = false;
  private periodicTimer: NodeJS.Timeout | null = null;
  private promptingForInstall = false;
  private installing = false;

  private snapshot: AppUpdateSnapshot = {
    phase: "idle",
    currentVersion: app.getVersion(),
    nextVersion: null,
    releaseName: null,
    releaseDate: null,
    progressPercent: null,
    message: "Guncelleme henuz kontrol edilmedi",
    timestamp: new Date().toISOString(),
  };

  public constructor(private readonly options: ModularUpdaterOptions) {}

  public initialize(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;

    if (!app.isPackaged) {
      this.setSnapshot("disabled", "Gelistirme modunda guncelleme devre disi");
      return;
    }

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;

    this.bindListeners();
    this.scheduleChecks();
  }

  public getSnapshot(): AppUpdateSnapshot {
    return { ...this.snapshot };
  }

  public async checkForUpdates(): Promise<CheckForUpdatesResponse> {
    if (!app.isPackaged) {
      this.setSnapshot("disabled", "Gelistirme modunda guncelleme devre disi");
      return { requested: false, reason: "DEV_MODE" };
    }

    if (this.installing) {
      return { requested: false, reason: "INSTALL_IN_PROGRESS" };
    }

    try {
      await autoUpdater.checkForUpdates();
      return { requested: true };
    } catch (error) {
      this.handleUpdaterError(error);
      return { requested: false, reason: "CHECK_FAILED" };
    }
  }

  public async installDownloadedUpdate(): Promise<InstallUpdateResponse> {
    if (!app.isPackaged) {
      return { accepted: false, reason: "DEV_MODE" };
    }

    if (this.installing) {
      return { accepted: false, reason: "INSTALL_IN_PROGRESS" };
    }

    if (this.snapshot.phase !== "downloaded") {
      return { accepted: false, reason: "UPDATE_NOT_READY" };
    }

    this.installing = true;
    this.setSnapshot(
      "installing",
      "Guncelleme kuruluyor, uygulama yeniden baslatilacak",
    );

    try {
      await this.options.beforeInstall();
    } catch {
      // Best-effort pre-install cleanup.
    }

    setTimeout(() => {
      autoUpdater.quitAndInstall(false, true);
    }, 100);

    return { accepted: true };
  }

  private bindListeners(): void {
    if (this.listenersBound) {
      return;
    }

    this.listenersBound = true;

    autoUpdater.on("checking-for-update", () => {
      this.setSnapshot("checking", "Yeni surum kontrol ediliyor");
    });

    autoUpdater.on("update-available", (info) => {
      this.setSnapshotFromInfo(
        "available",
        info,
        "Yeni bir surum bulundu, indiriliyor",
      );
    });

    autoUpdater.on("download-progress", (progress) => {
      this.setSnapshotFromProgress(progress);
    });

    autoUpdater.on("update-downloaded", async (info) => {
      this.setSnapshotFromInfo(
        "downloaded",
        info,
        "Guncelleme indirildi, kurulum icin hazir",
      );
      await this.promptInstallDialog(info);
    });

    autoUpdater.on("update-not-available", (info) => {
      this.setSnapshotFromInfo("not-available", info, "Bu surum guncel");
    });

    autoUpdater.on("error", (error) => {
      this.handleUpdaterError(error);
    });
  }

  private scheduleChecks(): void {
    const startupCheckDelayMs =
      this.options.startupCheckDelayMs ?? defaultStartupCheckDelayMs;
    const periodicCheckMs =
      this.options.periodicCheckMs ?? defaultPeriodicCheckMs;

    setTimeout(() => {
      void this.checkForUpdates();
    }, startupCheckDelayMs);

    this.periodicTimer = setInterval(() => {
      void this.checkForUpdates();
    }, periodicCheckMs);

    if (this.periodicTimer.unref) {
      this.periodicTimer.unref();
    }
  }

  private async promptInstallDialog(info: UpdateInfo): Promise<void> {
    if (this.promptingForInstall || this.installing) {
      return;
    }

    this.promptingForInstall = true;
    const version =
      info.version?.trim() || this.snapshot.nextVersion || "unknown";

    try {
      const result = await dialog.showMessageBox({
        type: "info",
        title: "Connect guncellemesi hazir",
        message: `v${version} indirildi. Simdi guncellemek ister misin?`,
        detail:
          "Guncelle dediginde uygulama otomatik kapanir, guncellenir ve yeniden acilir.",
        buttons: ["Guncelle", "Daha Sonra"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });

      if (result.response === 0) {
        await this.installDownloadedUpdate();
      }
    } finally {
      this.promptingForInstall = false;
    }
  }

  private handleUpdaterError(error: unknown): void {
    const message =
      error instanceof Error ? error.message : "Beklenmeyen guncelleme hatasi";

    this.setSnapshot("error", message);

    const event: AppUpdateEvent = {
      type: "update-error",
      state: { ...this.snapshot },
      errorCode: "UPDATER_ERROR",
      errorMessage: message,
    };
    this.broadcast(event);
  }

  private setSnapshotFromInfo(
    phase: AppUpdatePhase,
    info: UpdateInfo,
    message: string,
  ): void {
    this.snapshot = {
      ...this.snapshot,
      phase,
      nextVersion: info.version ?? this.snapshot.nextVersion,
      releaseName: info.releaseName ?? this.snapshot.releaseName,
      releaseDate: info.releaseDate ?? this.snapshot.releaseDate,
      progressPercent:
        phase === "downloaded" ? 100 : this.snapshot.progressPercent,
      message,
      timestamp: new Date().toISOString(),
    };

    this.emitState();
  }

  private setSnapshotFromProgress(progress: ProgressInfo): void {
    const percent = Number.isFinite(progress.percent)
      ? Math.max(0, Math.min(100, Number(progress.percent.toFixed(2))))
      : null;

    this.snapshot = {
      ...this.snapshot,
      phase: "downloading",
      progressPercent: percent,
      message:
        percent == null
          ? "Guncelleme indiriliyor"
          : `Guncelleme indiriliyor (%${percent})`,
      timestamp: new Date().toISOString(),
    };

    this.emitState();
  }

  private setSnapshot(phase: AppUpdatePhase, message: string): void {
    this.snapshot = {
      ...this.snapshot,
      phase,
      message,
      timestamp: new Date().toISOString(),
    };

    if (phase !== "downloading") {
      this.snapshot.progressPercent = null;
    }

    this.emitState();
  }

  private emitState(): void {
    const event: AppUpdateEvent = {
      type: "update-state",
      state: { ...this.snapshot },
    };
    this.broadcast(event);
  }

  private broadcast(event: AppUpdateEvent): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed() || win.webContents.isDestroyed()) {
        continue;
      }

      win.webContents.send(UPDATE_EVENT_CHANNEL, event);
    }
  }
}

let sharedUpdater: ModularUpdater | null = null;

const getUpdater = (): ModularUpdater => {
  if (!sharedUpdater) {
    throw new Error("Updater has not been initialized");
  }

  return sharedUpdater;
};

export const initializeModularUpdater = (
  options: ModularUpdaterOptions,
): void => {
  if (!sharedUpdater) {
    sharedUpdater = new ModularUpdater(options);
  }

  sharedUpdater.initialize();
};

export const checkForAppUpdates =
  async (): Promise<CheckForUpdatesResponse> => {
    return getUpdater().checkForUpdates();
  };

export const installDownloadedAppUpdate =
  async (): Promise<InstallUpdateResponse> => {
    return getUpdater().installDownloadedUpdate();
  };

export const getAppUpdateSnapshot = (): AppUpdateSnapshot => {
  return getUpdater().getSnapshot();
};
