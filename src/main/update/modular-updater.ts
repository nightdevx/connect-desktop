import { app, BrowserWindow, shell } from "electron";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { autoUpdater } from "electron-updater";
import type { ProgressInfo, UpdateDownloadedEvent, UpdateInfo } from "electron-updater";
import {
  UPDATE_EVENT_CHANNEL,
  compareVersions,
  isReleasePageUrl,
  releasePageUrl,
  usesManualUpdates,
  type AppUpdateEvent,
  type AppUpdatePhase,
  type AppUpdateSnapshot,
} from "../../shared/update-contracts";
import { showUpdaterWindow } from "./updater-window";

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
const defaultPeriodicCheckMs = 15 * 60 * 1_000;

// macOS: the release is found but never downloaded or installed; "İndir" opens
// its page and the user installs the dmg (AppUpdateSnapshot.downloadUrl).
const manualUpdates = usesManualUpdates(process.platform);

/* -------------------------------------------------------------------------
   Mandatory updates

   A release is mandatory for every build older than its minimum version:
   electron-builder.yml's releaseInfo.vendor.minimumVersion, which
   electron-builder copies into latest.yml and electron-updater hands back on
   the UpdateInfo untouched. A minimum rather than a "this one is mandatory"
   flag, because a client can skip releases: one on 0.2.3 that next sees an
   optional 0.2.6 must still be held to a mandatory 0.2.5 in between.

   The minimum is also kept on disk once seen. Otherwise a restart would make
   the app usable again until the next check found the release a second time.
   ------------------------------------------------------------------------- */

const gateFilePath = (): string => join(app.getPath("userData"), "update-gate.json");

const readKnownMinimumVersion = (): string | null => {
  try {
    const parsed: unknown = JSON.parse(readFileSync(gateFilePath(), "utf-8"));
    const value =
      parsed && typeof parsed === "object"
        ? (parsed as { minimumVersion?: unknown }).minimumVersion
        : undefined;
    return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
  } catch {
    return null;
  }
};

const writeKnownMinimumVersion = (version: string | null): void => {
  try {
    if (version) {
      writeFileSync(gateFilePath(), JSON.stringify({ minimumVersion: version }), "utf-8");
    } else {
      rmSync(gateFilePath(), { force: true });
    }
  } catch {
    // Best effort: the next check finds the release again.
  }
};

const minimumVersionOf = (info: UpdateInfo): string | null => {
  const vendor: unknown = (info as UpdateInfo & { vendor?: unknown }).vendor;
  const value =
    vendor && typeof vendor === "object"
      ? (vendor as { minimumVersion?: unknown }).minimumVersion
      : undefined;
  // YAML reads an unquoted "1.0" as the number 1.
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
};

const isBelow = (minimum: string | null): boolean =>
  minimum !== null && compareVersions(app.getVersion(), minimum) < 0;

const higherOf = (a: string | null, b: string | null): string | null =>
  a === null ? b : b === null ? a : compareVersions(a, b) >= 0 ? a : b;

export class ModularUpdater {
  private initialized = false;
  private listenersBound = false;
  private startupCheckTimer: NodeJS.Timeout | null = null;
  private periodicTimer: NodeJS.Timeout | null = null;
  private installing = false;
  // A mandatory update the user confirmed before its download finished.
  private installWhenDownloaded = false;
  // The server's floor, from its version gate (426 CLIENT_OUTDATED). The
  // operator can raise it from the admin panel without a release, so it is
  // held beside latest.yml's and whichever is higher decides.
  private serverMinimum: string | null = null;
  // The installer electron-updater downloaded, which the update window
  // watches (updater-window.ts).
  private downloadedFile: string | null = null;

  private snapshot: AppUpdateSnapshot = {
    phase: "idle",
    currentVersion: app.getVersion(),
    nextVersion: null,
    releaseName: null,
    releaseDate: null,
    progressPercent: null,
    message: "Güncelleme henüz kontrol edilmedi",
    timestamp: new Date().toISOString(),
    mandatory: false,
    downloadUrl: null,
  };

  public constructor(private readonly options: ModularUpdaterOptions) {}

  public initialize(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;

    if (!app.isPackaged) {
      // Set to idle so the user can test the manual check and see the UI in dev
      this.setSnapshot("idle", "Geliştirme modu - güncelleme testi hazır");
      return;
    }

    autoUpdater.autoDownload = !manualUpdates;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;

    // A mandatory update seen on an earlier run still applies until it is
    // installed: lock from the first frame and check at once rather than after
    // the usual startup delay.
    const knownMinimum = readKnownMinimumVersion();
    const lockedAtStart = isBelow(knownMinimum);
    if (knownMinimum !== null && !lockedAtStart) {
      writeKnownMinimumVersion(null);
    }
    if (lockedAtStart) {
      this.snapshot = {
        ...this.snapshot,
        phase: "checking",
        mandatory: true,
        message: "Zorunlu güncelleme denetleniyor",
      };
    }

    this.bindListeners();
    this.scheduleChecks(lockedAtStart ? 0 : undefined);
  }

  public getSnapshot(): AppUpdateSnapshot {
    return { ...this.snapshot };
  }

  public destroy(): void {
    if (this.startupCheckTimer) {
      clearTimeout(this.startupCheckTimer);
      this.startupCheckTimer = null;
    }

    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
  }

  public async checkForUpdates(): Promise<CheckForUpdatesResponse> {
    if (!app.isPackaged) {
      if (this.installing) {
        return { requested: false, reason: "INSTALL_IN_PROGRESS" };
      }
      this.simulateDevUpdate();
      return { requested: true };
    }

    if (this.installing) {
      return { requested: false, reason: "INSTALL_IN_PROGRESS" };
    }

    try {
      await this.checkForUpdatesWithTimeout(30_000);
      return { requested: true };
    } catch (error) {
      this.handleUpdaterError(error);
      return { requested: false, reason: "CHECK_FAILED" };
    }
  }

  public async installDownloadedUpdate(): Promise<InstallUpdateResponse> {
    if (!app.isPackaged) {
      if (this.installing) {
        return { accepted: false, reason: "INSTALL_IN_PROGRESS" };
      }

      if (this.snapshot.phase !== "downloaded") {
        return { accepted: false, reason: "UPDATE_NOT_READY" };
      }

      this.installing = true;
      this.setSnapshot(
        "installing",
        "Güncelleme kuruluyor ve uygulama yeniden başlatılacak (Simülasyon)...",
      );

      setTimeout(() => {
        this.installing = false;
        this.setSnapshot("idle", "Güncelleme tamamlandı (Simülasyon sıfırlandı)");
        // Reload main windows to simulate restart in dev mode
        const wins = BrowserWindow.getAllWindows();
        for (const win of wins) {
          if (!win.isDestroyed()) {
            win.reload();
          }
        }
      }, 3000);

      return { accepted: true };
    }

    if (manualUpdates) {
      // The newest release's page when no check has answered yet, so a
      // mandatory lock carried over from the last run still has a way out.
      const url = this.snapshot.downloadUrl ?? releasePageUrl(null);
      if (!isReleasePageUrl(url)) {
        return { accepted: false, reason: "UPDATE_NOT_READY" };
      }
      await shell.openExternal(url);
      return { accepted: true, reason: "DOWNLOAD_PAGE_OPENED" };
    }

    if (this.installing) {
      return { accepted: false, reason: "INSTALL_IN_PROGRESS" };
    }

    if (this.snapshot.phase !== "downloaded") {
      // A mandatory update confirmed early installs the moment it lands; the
      // app is locked until then either way.
      if (this.snapshot.mandatory) {
        this.installWhenDownloaded = true;
        return { accepted: true, reason: "INSTALL_WHEN_DOWNLOADED" };
      }
      return { accepted: false, reason: "UPDATE_NOT_READY" };
    }

    this.installing = true;
    this.installWhenDownloaded = false;

    this.setSnapshot(
      "installing",
      "Güncelleme kuruluyor ve uygulama yeniden başlatılacak...",
    );

    try {
      await this.options.beforeInstall();
    } catch {
      // Ignored
    }

    // The installer runs silently, so a window of its own shows the install,
    // and Connect waits until it is on screen before closing. Without it the
    // install runs unseen, after the same pause as before so "kuruluyor" can
    // still be read.
    const shown = await showUpdaterWindow({
      installer: this.downloadedFile,
      version: this.snapshot.nextVersion,
      releaseUrl: releasePageUrl(this.snapshot.nextVersion),
    });
    if (!shown) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    try {
      // quitAndInstall(isSilent, isForceRunAfter)
      autoUpdater.quitAndInstall(true, true);
    } catch (error) {
      this.handleUpdaterError(error);
    }

    return { accepted: true };
  }

  /**
   * The server turned this build away as older than its minimum. Lock as soon
   * as there is a release to install: at once if one is already known, else
   * after the check this starts.
   */
  public requireMinimumVersion(minimum: string | null): void {
    if (!app.isPackaged || minimum === null || !isBelow(minimum)) {
      return;
    }
    if (this.serverMinimum !== null && compareVersions(this.serverMinimum, minimum) >= 0) {
      return;
    }
    this.serverMinimum = minimum;

    const phase = this.snapshot.phase;
    if (phase === "available" || phase === "downloading" || phase === "downloaded") {
      writeKnownMinimumVersion(higherOf(readKnownMinimumVersion(), minimum));
      this.snapshot = { ...this.snapshot, mandatory: true };
      this.emitState();
      return;
    }
    if (!this.installing && phase !== "checking") {
      void this.checkForUpdates();
    }
  }

  private simulateDevUpdate(): void {
    this.setSnapshot("checking", "Yeni sürüm kontrol ediliyor (Simülasyon)...");

    setTimeout(() => {
      this.snapshot = {
        ...this.snapshot,
        phase: "available",
        nextVersion: `${app.getVersion()}-dev-update`,
        releaseName: "Geliştirici Sürümü Testi",
        releaseDate: new Date().toISOString(),
        progressPercent: 0,
        message: "Yeni bir geliştirici sürümü bulundu, indiriliyor (Simülasyon)...",
        timestamp: new Date().toISOString(),
      };
      this.emitState();

      let progress = 0;
      const interval = setInterval(() => {
        progress += 10;
        if (progress > 100) {
          clearInterval(interval);
          this.snapshot = {
            ...this.snapshot,
            phase: "downloaded",
            progressPercent: 100,
            message: "Güncelleme indirildi, kurulum için hazır (Simülasyon)",
            timestamp: new Date().toISOString(),
          };
          this.emitState();
        } else {
          this.snapshot = {
            ...this.snapshot,
            phase: "downloading",
            progressPercent: progress,
            message: `Güncelleme indiriliyor (%${progress}) (Simülasyon)...`,
            timestamp: new Date().toISOString(),
          };
          this.emitState();
        }
      }, 500);
    }, 2000);
  }


  private bindListeners(): void {
    if (this.listenersBound) {
      return;
    }

    this.listenersBound = true;

    autoUpdater.on("checking-for-update", () => {
      this.setSnapshot("checking", "Yeni sürüm kontrol ediliyor");
    });

    autoUpdater.on("update-available", (info) => {
      this.setSnapshotFromInfo(
        "available",
        info,
        manualUpdates
          ? "Yeni bir sürüm var. İndir ile indirme sayfasını aç."
          : "Yeni bir sürüm bulundu, indiriliyor",
      );
    });

    autoUpdater.on("download-progress", (progress) => {
      this.setSnapshotFromProgress(progress);
    });

    autoUpdater.on("update-downloaded", (info: UpdateDownloadedEvent) => {
      this.downloadedFile = info.downloadedFile ?? null;
      this.setSnapshotFromInfo(
        "downloaded",
        info,
        "Güncelleme indirildi, kurulum için hazır",
      );
      if (this.installWhenDownloaded) {
        void this.installDownloadedUpdate();
      }
    });

    autoUpdater.on("update-not-available", (info) => {
      this.setSnapshotFromInfo("not-available", info, "Bu sürüm güncel");
    });

    autoUpdater.on("error", (error) => {
      this.handleUpdaterError(error);
    });
  }

  private scheduleChecks(startupDelayOverrideMs?: number): void {
    const startupCheckDelayMs =
      startupDelayOverrideMs ??
      this.options.startupCheckDelayMs ??
      defaultStartupCheckDelayMs;
    const periodicCheckMs =
      this.options.periodicCheckMs ?? defaultPeriodicCheckMs;

    this.startupCheckTimer = setTimeout(() => {
      void this.checkForUpdates();
    }, startupCheckDelayMs);

    if (this.startupCheckTimer.unref) {
      this.startupCheckTimer.unref();
    }

    this.periodicTimer = setInterval(() => {
      void this.checkForUpdates();
    }, periodicCheckMs);

    if (this.periodicTimer.unref) {
      this.periodicTimer.unref();
    }
  }

  private handleUpdaterError(error: unknown): void {
    const message =
      error instanceof Error ? error.message : "Beklenmeyen güncelleme hatası";

    this.setSnapshot("error", message);
    if (this.installing) {
      this.installing = false;
      this.restoreMainWindowsAfterInstallFailure();
      if (this.snapshot.nextVersion) {
        this.setSnapshot(
          "downloaded",
          "Kurulum başarısız oldu. Tekrar denemek için Güncelle seçeneğini kullan.",
        );
      }
    }

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
    // Every answer from the feed re-decides it, "not available" included: that
    // is the feed saying this build is current, which lifts a lock left on
    // disk by a release that has since been installed or pulled.
    //
    // The server's floor only counts once the feed has something newer to
    // install. A floor set above the newest release would otherwise lock every
    // window -- the admin's included -- behind an update that does not exist;
    // the server still refuses the requests, with a message saying why.
    const releaseMinimum = minimumVersionOf(info);
    const updateExists = phase !== "not-available";
    const minimum = higherOf(
      isBelow(releaseMinimum) ? releaseMinimum : null,
      updateExists && isBelow(this.serverMinimum) ? this.serverMinimum : null,
    );
    const mandatory = minimum !== null;
    writeKnownMinimumVersion(minimum);

    this.snapshot = {
      ...this.snapshot,
      phase,
      mandatory,
      nextVersion: info.version ?? this.snapshot.nextVersion,
      releaseName: info.releaseName ?? this.snapshot.releaseName,
      releaseDate: info.releaseDate ?? this.snapshot.releaseDate,
      progressPercent:
        phase === "downloaded" ? 100 : this.snapshot.progressPercent,
      downloadUrl: manualUpdates && updateExists ? releasePageUrl(info.version) : null,
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
          ? "Güncelleme indiriliyor"
          : `Güncelleme indiriliyor (%${percent})`,
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

  private async checkForUpdatesWithTimeout(timeoutMs: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Update check timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      if (timeout.unref) {
        timeout.unref();
      }

      void autoUpdater
        .checkForUpdates()
        .then(() => {
          clearTimeout(timeout);
          resolve();
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  private broadcast(event: AppUpdateEvent): void {
    const wins = BrowserWindow.getAllWindows();
    for (const win of wins) {
      if (win.isDestroyed()) {
        continue;
      }
      win.webContents.send(UPDATE_EVENT_CHANNEL, event);
    }
  }

  private restoreMainWindowsAfterInstallFailure(): void {
    const wins = BrowserWindow.getAllWindows();
    for (const win of wins) {
      if (win.isDestroyed()) {
        continue;
      }
      win.show();
    }
  }
}

let updaterInstance: ModularUpdater | null = null;

export const initializeModularUpdater = (options: ModularUpdaterOptions): void => {
  if (updaterInstance) {
    return;
  }
  updaterInstance = new ModularUpdater(options);
  updaterInstance.initialize();
};

export const destroyModularUpdater = (): void => {
  if (updaterInstance) {
    updaterInstance.destroy();
    updaterInstance = null;
  }
};

export const checkForAppUpdates = async (): Promise<CheckForUpdatesResponse> => {
  if (!updaterInstance) {
    return { requested: false, reason: "NOT_INITIALIZED" };
  }
  return updaterInstance.checkForUpdates();
};

export const installDownloadedAppUpdate = async (): Promise<InstallUpdateResponse> => {
  if (!updaterInstance) {
    return { accepted: false, reason: "NOT_INITIALIZED" };
  }
  return updaterInstance.installDownloadedUpdate();
};

export const requireAppUpdate = (minimumVersion: string | null): void => {
  updaterInstance?.requireMinimumVersion(minimumVersion);
};

export const getAppUpdateSnapshot = (): AppUpdateSnapshot | null => {
  if (!updaterInstance) {
    return null;
  }
  return updaterInstance.getSnapshot();
};

