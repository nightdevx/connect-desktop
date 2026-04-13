import { useEffect, useState } from "react";
import type { DesktopAppPreferences } from "../../../../../../shared/desktop-api-types";
import type {
  AppUpdateEvent,
  AppUpdateSnapshot,
} from "../../../../../../shared/update-contracts";

const getUpdateCheckBlockedReason = (reason?: string): string => {
  if (reason === "DEV_MODE") {
    return "Geliştirme modunda güncelleme kontrolü devre dışıdır.";
  }

  if (reason === "INSTALL_IN_PROGRESS") {
    return "Güncelleme kurulumu devam ediyor. Biraz sonra tekrar deneyin.";
  }

  if (reason === "CHECK_FAILED") {
    return "Güncelleme kontrolü başarısız oldu. Tekrar deneyebilirsiniz.";
  }

  return "Güncelleme kontrolü şu anda başlatılamadı.";
};

const getUpdateDebugBlockedReason = (reason?: string): string => {
  if (reason === "NOT_DEV_MODE") {
    return "Debug güncelleme ekranı sadece geliştirme modunda açılabilir.";
  }

  if (reason === "ALREADY_IN_HELPER_MODE") {
    return "Güncelleme debug süreci zaten açık.";
  }

  if (reason === "SPAWN_FAILED") {
    return "Debug güncelleme penceresi başlatılamadı.";
  }

  return "Debug güncelleme şu anda açılamadı.";
};

const getUpdatePhaseLabel = (
  phase: AppUpdateSnapshot["phase"] | "unknown",
): string => {
  if (phase === "checking") {
    return "Kontrol ediliyor";
  }

  if (phase === "available") {
    return "Güncelleme bulundu";
  }

  if (phase === "downloading") {
    return "İndiriliyor";
  }

  if (phase === "downloaded") {
    return "Kurulum hazır";
  }

  if (phase === "not-available") {
    return "Güncel";
  }

  if (phase === "installing") {
    return "Kuruluyor";
  }

  if (phase === "disabled") {
    return "Devre dışı";
  }

  if (phase === "error") {
    return "Hata";
  }

  return "Hazır";
};

export function SettingsApplication() {
  const [appVersion, setAppVersion] = useState("-");
  const [updateState, setUpdateState] = useState<AppUpdateSnapshot | null>(
    null,
  );
  const [appPreferences, setAppPreferences] = useState<DesktopAppPreferences>({
    launchOnStartup: false,
    minimizeToTray: false,
    closeToTray: false,
  });
  const [isSavingAppPreference, setIsSavingAppPreference] = useState(false);
  const [appPreferencesNotice, setAppPreferencesNotice] = useState("");
  const [isCheckingForUpdates, setIsCheckingForUpdates] = useState(false);
  const [isLaunchingUpdateDebug, setIsLaunchingUpdateDebug] = useState(false);
  const [updateNotice, setUpdateNotice] = useState("");

  useEffect(() => {
    let active = true;

    void window.desktopApi
      .getAppVersion()
      .then((version) => {
        if (!active) {
          return;
        }

        setAppVersion(version);
      })
      .catch(() => {
        // No-op: version info is optional for update panel.
      });

    void window.desktopApi
      .getUpdateState()
      .then((result) => {
        if (!active) {
          return;
        }

        if (result.ok && result.data?.state) {
          setUpdateState(result.data.state);
          return;
        }

        if (!result.ok) {
          setUpdateNotice(
            `Güncelleme durumu alınamadı: ${result.error?.message ?? "Bilinmeyen hata"}`,
          );
        }
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        setUpdateNotice(
          `Güncelleme durumu alınamadı: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
        );
      });

    void window.desktopApi
      .getAppPreferences()
      .then((result) => {
        if (!active) {
          return;
        }

        if (result.ok && result.data?.preferences) {
          setAppPreferences(result.data.preferences);
          return;
        }

        if (!result.ok) {
          setAppPreferencesNotice(
            `Uygulama ayarları alınamadı: ${result.error?.message ?? "Bilinmeyen hata"}`,
          );
        }
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        setAppPreferencesNotice(
          `Uygulama ayarları alınamadı: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
        );
      });

    const unsubscribe = window.desktopApi.onUpdateEvent(
      (event: AppUpdateEvent) => {
        if (!active) {
          return;
        }

        setUpdateState(event.state);

        if (event.type === "update-error") {
          setUpdateNotice(`Güncelleme hatası: ${event.errorMessage}`);
        }
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const handleManualUpdateCheck = async (): Promise<void> => {
    setUpdateNotice("");
    setIsCheckingForUpdates(true);

    try {
      const result = await window.desktopApi.checkForAppUpdates();
      if (!result.ok) {
        setUpdateNotice(
          `Güncelleme kontrolü başlatılamadı: ${result.error?.message ?? "Bilinmeyen hata"}`,
        );
        return;
      }

      if (!result.data?.requested) {
        setUpdateNotice(getUpdateCheckBlockedReason(result.data?.reason));
        return;
      }

      setUpdateNotice("Güncelleme kontrolü başlatıldı.");
    } catch (error) {
      setUpdateNotice(
        `Güncelleme kontrolü başlatılamadı: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
      );
    } finally {
      setIsCheckingForUpdates(false);
    }
  };

  const handleOpenUpdateDebugScreen = async (): Promise<void> => {
    setUpdateNotice("");
    setIsLaunchingUpdateDebug(true);

    try {
      const result = await window.desktopApi.launchMockUpdateDebug();
      if (!result.ok) {
        setUpdateNotice(
          `Debug güncelleme açılamadı: ${result.error?.message ?? "Bilinmeyen hata"}`,
        );
        return;
      }

      if (!result.data?.started) {
        setUpdateNotice(getUpdateDebugBlockedReason(result.data?.reason));
        return;
      }

      setUpdateNotice("Debug güncelleme penceresi açıldı.");
    } catch (error) {
      setUpdateNotice(
        `Debug güncelleme açılamadı: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
      );
    } finally {
      setIsLaunchingUpdateDebug(false);
    }
  };

  const handleAppPreferenceToggle = async (
    key: keyof DesktopAppPreferences,
    value: boolean,
  ): Promise<void> => {
    const previousPreferences = appPreferences;

    setAppPreferencesNotice("");
    setIsSavingAppPreference(true);
    setAppPreferences((previous) => ({
      ...previous,
      [key]: value,
    }));

    try {
      const result = await window.desktopApi.setAppPreferences({
        [key]: value,
      });

      if (!result.ok || !result.data?.preferences) {
        setAppPreferences(previousPreferences);
        setAppPreferencesNotice(
          `Uygulama ayarı kaydedilemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
        );
        return;
      }

      setAppPreferences(result.data.preferences);
      setAppPreferencesNotice("Uygulama davranış ayarları kaydedildi.");
    } catch (error) {
      setAppPreferences(previousPreferences);
      setAppPreferencesNotice(
        `Uygulama ayarı kaydedilemedi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
      );
    } finally {
      setIsSavingAppPreference(false);
    }
  };

  const currentVersionLabel = updateState?.currentVersion ?? appVersion;
  const nextVersionLabel = updateState?.nextVersion;
  const updatePhase = updateState?.phase ?? "unknown";
  const isDevelopmentUpdateMode = updatePhase === "disabled";

  const isManualCheckDisabled =
    isCheckingForUpdates ||
    updateState?.phase === "checking" ||
    updateState?.phase === "installing";

  return (
    <div className="ct-settings-section">
      <div className="ct-settings-section-header">
        <div className="ct-settings-section-header-icon">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        </div>
        <div>
          <h4>Uygulama Güncellemeleri</h4>
          <p className="ct-settings-section-description">
            Sürüm durumunu takip edebilir ve güncellemeleri buradan
            başlatabilirsiniz.
          </p>
        </div>
      </div>

      <div className="ct-settings-content">
        <div
          className="ct-settings-switch-list"
          aria-busy={isSavingAppPreference}
        >
          <label
            className="ct-settings-switch-item"
            htmlFor="settings-launch-on-startup"
          >
            <div className="ct-settings-switch-item-content">
              <strong>Bilgisayar açıldığında Connect otomatik başlasın</strong>
              <span>
                Uygulama oturum açıldığında arka planda çalışmaya hazır olur.
              </span>
            </div>
            <div className="ct-settings-switch">
              <input
                id="settings-launch-on-startup"
                type="checkbox"
                checked={appPreferences.launchOnStartup}
                onChange={(event) => {
                  void handleAppPreferenceToggle(
                    "launchOnStartup",
                    event.target.checked,
                  );
                }}
                disabled={isSavingAppPreference}
              />
              <span className="ct-settings-switch-slider" />
            </div>
          </label>

          <label
            className="ct-settings-switch-item"
            htmlFor="settings-minimize-to-tray"
          >
            <div className="ct-settings-switch-item-content">
              <strong>Pencere küçültülünce sistem tepsisine gönder</strong>
              <span>
                Küçült butonuna basıldığında uygulama görev çubuğundan gizlenir.
              </span>
            </div>
            <div className="ct-settings-switch">
              <input
                id="settings-minimize-to-tray"
                type="checkbox"
                checked={appPreferences.minimizeToTray}
                onChange={(event) => {
                  void handleAppPreferenceToggle(
                    "minimizeToTray",
                    event.target.checked,
                  );
                }}
                disabled={isSavingAppPreference}
              />
              <span className="ct-settings-switch-slider" />
            </div>
          </label>

          <label
            className="ct-settings-switch-item"
            htmlFor="settings-close-to-tray"
          >
            <div className="ct-settings-switch-item-content">
              <strong>Kapat tuşunda sistem tepsisine gizle</strong>
              <span>
                Pencereyi kapatmak uygulamayı sonlandırmaz; tepside çalışmaya
                devam eder.
              </span>
            </div>
            <div className="ct-settings-switch">
              <input
                id="settings-close-to-tray"
                type="checkbox"
                checked={appPreferences.closeToTray}
                onChange={(event) => {
                  void handleAppPreferenceToggle(
                    "closeToTray",
                    event.target.checked,
                  );
                }}
                disabled={isSavingAppPreference}
              />
              <span className="ct-settings-switch-slider" />
            </div>
          </label>
        </div>

        {appPreferencesNotice && (
          <p className="ct-settings-notice">{appPreferencesNotice}</p>
        )}

        <div className="ct-settings-info-grid">
          <div className="ct-settings-info-item">
            <span className="ct-settings-info-label">Sürüm</span>
            <strong className="ct-settings-info-value">
              v{currentVersionLabel}
            </strong>
          </div>
          <div className="ct-settings-info-item">
            <span className="ct-settings-info-label">Durum</span>
            <strong className="ct-settings-info-value">
              {getUpdatePhaseLabel(updatePhase)}
            </strong>
          </div>
          {nextVersionLabel && (
            <div className="ct-settings-info-item">
              <span className="ct-settings-info-label">Bulunan Sürüm</span>
              <strong className="ct-settings-info-value">
                v{nextVersionLabel}
              </strong>
            </div>
          )}
        </div>

        <p>{updateState?.message ?? "Güncelleme bilgisi bekleniyor."}</p>

        <div className="ct-settings-actions">
          <button
            type="button"
            className="ct-btn-primary"
            onClick={() => {
              void handleManualUpdateCheck();
            }}
            disabled={isManualCheckDisabled}
          >
            {isManualCheckDisabled
              ? "Kontrol ediliyor..."
              : "Güncellemeleri Kontrol Et"}
          </button>

          {isDevelopmentUpdateMode && (
            <button
              type="button"
              className="ct-btn-secondary"
              onClick={() => {
                void handleOpenUpdateDebugScreen();
              }}
              disabled={isLaunchingUpdateDebug}
            >
              {isLaunchingUpdateDebug
                ? "Debug ekranı açılıyor..."
                : "Güncelleme Debug Ekranı"}
            </button>
          )}
        </div>

        {updateNotice && <p className="ct-settings-notice">{updateNotice}</p>}
      </div>
    </div>
  );
}
