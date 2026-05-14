import { useEffect, useState } from "react";
import { Switch, Button, message, Alert } from "antd";
import { InfoCircleOutlined, ReloadOutlined, BugOutlined } from "@ant-design/icons";
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
  const [messageApi, contextHolder] = message.useMessage();
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
  const [isCheckingForUpdates, setIsCheckingForUpdates] = useState(false);
  const [isLaunchingUpdateDebug, setIsLaunchingUpdateDebug] = useState(false);

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
          messageApi.error(
            `Güncelleme durumu alınamadı: ${result.error?.message ?? "Bilinmeyen hata"}`,
          );
        }
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        messageApi.error(
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
          messageApi.error(
            `Uygulama ayarları alınamadı: ${result.error?.message ?? "Bilinmeyen hata"}`,
          );
        }
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        messageApi.error(
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
          messageApi.error(`Güncelleme hatası: ${event.errorMessage}`);
        }
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const handleManualUpdateCheck = async (): Promise<void> => {
    setIsCheckingForUpdates(true);

    try {
      const result = await window.desktopApi.checkForAppUpdates();
      if (!result.ok) {
        messageApi.error(
          `Güncelleme kontrolü başlatılamadı: ${result.error?.message ?? "Bilinmeyen hata"}`,
        );
        return;
      }

      if (!result.data?.requested) {
        messageApi.warning(getUpdateCheckBlockedReason(result.data?.reason));
        return;
      }

      messageApi.success("Güncelleme kontrolü başlatıldı.");
    } catch (error) {
      messageApi.error(
        `Güncelleme kontrolü başlatılamadı: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
      );
    } finally {
      setIsCheckingForUpdates(false);
    }
  };

  const handleOpenUpdateDebugScreen = async (): Promise<void> => {
    setIsLaunchingUpdateDebug(true);

    try {
      const result = await window.desktopApi.launchMockUpdateDebug();
      if (!result.ok) {
        messageApi.error(
          `Debug güncelleme açılamadı: ${result.error?.message ?? "Bilinmeyen hata"}`,
        );
        return;
      }

      if (!result.data?.started) {
        messageApi.warning(getUpdateDebugBlockedReason(result.data?.reason));
        return;
      }

      messageApi.success("Debug güncelleme penceresi açıldı.");
    } catch (error) {
      messageApi.error(
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
        messageApi.error(
          `Uygulama ayarı kaydedilemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
        );
        return;
      }

      setAppPreferences(result.data.preferences);
      messageApi.success("Uygulama davranış ayarları kaydedildi.");
    } catch (error) {
      setAppPreferences(previousPreferences);
      messageApi.error(
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
      {contextHolder}
      <div className="ct-settings-section-header">
        <div className="ct-settings-section-header-icon">
          <InfoCircleOutlined style={{ fontSize: "20px" }} />
        </div>
        <div>
          <h4>Uygulama Güncellemeleri</h4>
          <p className="ct-settings-section-description">
            Sürüm durumunu takip edebilir ve güncellemeleri buradan başlatabilirsiniz.
          </p>
        </div>
      </div>

      <div className="ct-settings-content" style={{ marginTop: "24px" }}>
        <div className="ct-settings-switch-list" style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          background: "rgba(255, 255, 255, 0.01)",
          border: "1px solid rgba(255, 255, 255, 0.03)",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "24px",
        }}>
          <div className="ct-settings-switch-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="ct-settings-switch-item-content" style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <strong style={{ fontSize: "13px", color: "#ffffff", fontWeight: "600" }}>Bilgisayar açıldığında Connect otomatik başlasın</strong>
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)" }}>
                Uygulama oturum açıldığında arka planda çalışmaya hazır olur.
              </span>
            </div>
            <Switch
              checked={appPreferences.launchOnStartup}
              onChange={(checked) => {
                void handleAppPreferenceToggle("launchOnStartup", checked);
              }}
              disabled={isSavingAppPreference}
            />
          </div>

          <div className="ct-settings-switch-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="ct-settings-switch-item-content" style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <strong style={{ fontSize: "13px", color: "#ffffff", fontWeight: "600" }}>Pencere küçültülünce sistem tepsisine gönder</strong>
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)" }}>
                Küçült butonuna basıldığında uygulama görev çubuğundan gizlenir.
              </span>
            </div>
            <Switch
              checked={appPreferences.minimizeToTray}
              onChange={(checked) => {
                void handleAppPreferenceToggle("minimizeToTray", checked);
              }}
              disabled={isSavingAppPreference}
            />
          </div>

          <div className="ct-settings-switch-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="ct-settings-switch-item-content" style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <strong style={{ fontSize: "13px", color: "#ffffff", fontWeight: "600" }}>Kapat tuşunda sistem tepsisine gizle</strong>
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)" }}>
                Pencereyi kapatmak uygulamayı sonlandırmaz; tepside çalışmaya devam eder.
              </span>
            </div>
            <Switch
              checked={appPreferences.closeToTray}
              onChange={(checked) => {
                void handleAppPreferenceToggle("closeToTray", checked);
              }}
              disabled={isSavingAppPreference}
            />
          </div>
        </div>

        <div className="ct-settings-info-grid" style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "16px",
          background: "rgba(255, 255, 255, 0.02)",
          border: "1px solid rgba(255, 255, 255, 0.04)",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "24px",
        }}>
          <div className="ct-settings-info-item" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span className="ct-settings-info-label" style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)" }}>Sürüm</span>
            <strong className="ct-settings-info-value" style={{ fontSize: "14px", color: "#ffffff", fontWeight: "600" }}>
              v{currentVersionLabel}
            </strong>
          </div>
          <div className="ct-settings-info-item" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span className="ct-settings-info-label" style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)" }}>Durum</span>
            <strong className="ct-settings-info-value" style={{ fontSize: "14px", color: "#ffffff", fontWeight: "600" }}>
              {getUpdatePhaseLabel(updatePhase)}
            </strong>
          </div>
          {nextVersionLabel && (
            <div className="ct-settings-info-item" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span className="ct-settings-info-label" style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)" }}>Bulunan Sürüm</span>
              <strong className="ct-settings-info-value" style={{ fontSize: "14px", color: "#ffffff", fontWeight: "600" }}>
                v{nextVersionLabel}
              </strong>
            </div>
          )}
        </div>

        <div style={{ marginBottom: "24px" }}>
          <Alert
            message={updateState?.message ?? "Güncelleme bilgisi bekleniyor."}
            type={
              updatePhase === "error"
                ? "error"
                : updatePhase === "available" || updatePhase === "downloaded"
                  ? "success"
                  : "info"
            }
            showIcon
            style={{
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              borderRadius: "8px",
            }}
          />
        </div>

        <div className="ct-settings-actions" style={{ display: "flex", gap: "12px" }}>
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={() => {
              void handleManualUpdateCheck();
            }}
            loading={isManualCheckDisabled}
            disabled={isManualCheckDisabled}
            style={{
              background: isManualCheckDisabled ? "rgba(255, 255, 255, 0.08)" : "#ffffff",
              borderColor: isManualCheckDisabled ? "rgba(255, 255, 255, 0.08)" : "#ffffff",
              color: isManualCheckDisabled ? "rgba(255, 255, 255, 0.25)" : "#000000",
              fontWeight: "600",
              height: "40px",
              borderRadius: "6px",
            }}
          >
            Güncellemeleri Kontrol Et
          </Button>

          {isDevelopmentUpdateMode && (
            <Button
              type="text"
              icon={<BugOutlined />}
              onClick={() => {
                void handleOpenUpdateDebugScreen();
              }}
              loading={isLaunchingUpdateDebug}
              disabled={isLaunchingUpdateDebug}
              style={{
                background: isLaunchingUpdateDebug ? "rgba(255, 255, 255, 0.02)" : "rgba(255, 255, 255, 0.05)",
                color: isLaunchingUpdateDebug ? "rgba(255, 255, 255, 0.25)" : "#ffffff",
                height: "40px",
                borderRadius: "6px",
              }}
            >
              Güncelleme Debug Ekranı
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}


