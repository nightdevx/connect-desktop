import { useEffect, useState } from "react";
import { Switch, Button, message, Alert, Segmented } from "antd";
import { SettingOutlined, ReloadOutlined, BugOutlined } from "@ant-design/icons";
import type {
  AppUpdateEvent,
  AppUpdateSnapshot,
} from "@shared/update-contracts";
import type { ThemeMode } from "@/styles/theme-mode";
import type { GifPlayback } from "@/styles/gif-playback";
import { useUiStore } from "@/store/ui-store";
import { useDesktopAppPreferences } from "./settings-app-preferences";

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
  const themeMode = useUiStore((state) => state.themeMode);
  const setThemeMode = useUiStore((state) => state.setThemeMode);
  const gifPlayback = useUiStore((state) => state.gifPlayback);
  const setGifPlayback = useUiStore((state) => state.setGifPlayback);
  const [messageApi, contextHolder] = message.useMessage();
  const [appVersion, setAppVersion] = useState("-");
  const [updateState, setUpdateState] = useState<AppUpdateSnapshot | null>(
    null,
  );
  const {
    preferences: appPreferences,
    isSaving: isSavingAppPreference,
    needsRelaunch,
    savePreference,
  } = useDesktopAppPreferences(messageApi);
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
    // Stable: antd memoises the message.useMessage() handle.
  }, [messageApi]);

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
        <div className="ct-settings-section-header-main">
          <div className="ct-settings-section-header-icon">
            <SettingOutlined />
          </div>
          <div>
            <h4>Uygulama Ayarları</h4>
            <p className="ct-settings-section-description">
              Connect'in bilgisayarında nasıl davranacağını ayarlayabilir ve
              sürüm durumunu buradan takip edebilirsin.
            </p>
          </div>
        </div>
      </div>

      <div className="ct-settings-content">
        <div className="ct-settings-subsection">
          <h5>Tema ve Görünüm</h5>

          <div className="ct-settings-switch-list">
            <div className="ct-settings-switch-item">
              <div className="ct-settings-switch-item-content">
                <strong>Tema</strong>
                <span>
                  Açık tema aydınlık ortamlarda, koyu tema düşük ışıkta daha
                  rahat okunur. Değişiklik anında uygulanır.
                </span>
              </div>
              {/* Local, not a server preference: it is a property of this
                  screen, and a person who uses the app on a laptop and a
                  desktop rarely wants the same answer on both. */}
              <Segmented
                value={themeMode}
                onChange={(value) => setThemeMode(value as ThemeMode)}
                options={[
                  { label: "Koyu", value: "dark" },
                  { label: "Açık", value: "light" },
                ]}
                className="ct-segmented-premium"
              />
            </div>

            <div className="ct-settings-switch-item">
              <div className="ct-settings-switch-item-content">
                <strong>Hareketli görseller</strong>
                <span>
                  Sohbetteki GIF'ler sürekli oynayabilir ya da yalnızca fare
                  üzerine geldiğinde oynayabilir. Sürekli oynatma kapalıyken
                  görseller ilk karesinde durur.
                </span>
              </div>
              <Segmented
                value={gifPlayback}
                onChange={(value) => setGifPlayback(value as GifPlayback)}
                options={[
                  { label: "Sürekli oynat", value: "always" },
                  { label: "Üstüne gelince", value: "hover" },
                ]}
                className="ct-segmented-premium"
              />
            </div>
          </div>
        </div>

        <div className="ct-settings-subsection">
          <h5>Başlangıç ve Pencere</h5>

          <div className="ct-settings-switch-list">
            <div className="ct-settings-switch-item">
              <div className="ct-settings-switch-item-content">
                <strong>Bilgisayar açıldığında Connect otomatik başlasın</strong>
                <span>
                  Uygulama oturum açıldığında arka planda çalışmaya hazır olur.
                </span>
              </div>
              <Switch
                checked={appPreferences.launchOnStartup}
                onChange={(checked) => {
                  void savePreference("launchOnStartup", checked);
                }}
                disabled={isSavingAppPreference}
              />
            </div>

            <div className="ct-settings-switch-item">
              <div className="ct-settings-switch-item-content">
                <strong>Pencere küçültülünce sistem tepsisine gönder</strong>
                <span>
                  Küçült butonuna basıldığında uygulama görev çubuğundan
                  gizlenir.
                </span>
              </div>
              <Switch
                checked={appPreferences.minimizeToTray}
                onChange={(checked) => {
                  void savePreference("minimizeToTray", checked);
                }}
                disabled={isSavingAppPreference}
              />
            </div>

            <div className="ct-settings-switch-item">
              <div className="ct-settings-switch-item-content">
                <strong>Kapat tuşunda sistem tepsisine gizle</strong>
                <span>
                  Pencereyi kapatmak uygulamayı sonlandırmaz; tepside çalışmaya
                  devam eder.
                </span>
              </div>
              <Switch
                checked={appPreferences.closeToTray}
                onChange={(checked) => {
                  void savePreference("closeToTray", checked);
                }}
                disabled={isSavingAppPreference}
              />
            </div>
          </div>
        </div>

        <div className="ct-settings-subsection">
          <h5>Bildirimler</h5>

          <div className="ct-settings-switch-list">
            <div className="ct-settings-switch-item">
              <div className="ct-settings-switch-item-content">
                <strong>Masaüstü bildirimleri</strong>
                <span>
                  Pencere arka plandayken gelen mesaj ve aramalar için işletim
                  sistemi bildirimi gösterir. Odadaki giriş-çıkış ve yayın
                  sesleri ayrı bir ayar: Ayarlar → Ses → Bildirim Sesleri.
                </span>
              </div>
              <Switch
                checked={appPreferences.desktopNotifications}
                onChange={(checked) => {
                  void savePreference("desktopNotifications", checked);
                }}
                disabled={isSavingAppPreference}
              />
            </div>
          </div>
        </div>

        <div className="ct-settings-subsection">
          <h5>Performans</h5>

          <div className="ct-settings-switch-list">
            <div className="ct-settings-switch-item">
              <div className="ct-settings-switch-item-content">
                <strong>Donanım hızlandırma (video kodlama)</strong>
                <span>
                  Ekran paylaşımı ve kamerayı GPU ile kodlar; CPU kullanımını
                  büyük ölçüde düşürür. Görüntü siyah geliyor veya bozuluyorsa
                  kapatın. Değişiklik yeniden başlatma gerektirir.
                </span>
              </div>
              <Switch
                checked={appPreferences.hardwareAcceleration}
                onChange={(checked) => {
                  void savePreference("hardwareAcceleration", checked);
                }}
                disabled={isSavingAppPreference}
              />
            </div>
          </div>

          {needsRelaunch && (
            <Alert
              type="warning"
              showIcon
              message="Yeniden başlatma gerekli"
              description="Donanım hızlandırma ayarının etkili olması için uygulamayı yeniden başlatın."
              action={
                <Button
                  size="small"
                  onClick={() => {
                    void window.desktopApi.relaunchApp();
                  }}
                >
                  Yeniden Başlat
                </Button>
              }
              className="ct-alert"
            />
          )}
        </div>

        <div className="ct-settings-subsection">
          <h5>Güncellemeler</h5>

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

          <div className="ct-settings-update-alert">
            {nextVersionLabel ? (
              <Alert
                message={`Yeni güncelleme bulundu: v${nextVersionLabel}`}
                description={updateState?.message}
                type={updatePhase === "error" ? "error" : "success"}
                showIcon
                className="ct-alert"
              />
            ) : (
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
                className="ct-alert"
              />
            )}
          </div>

          <div className="ct-settings-actions">
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={() => {
                void handleManualUpdateCheck();
              }}
              loading={isManualCheckDisabled}
              disabled={isManualCheckDisabled}
            >
              Güncellemeleri Kontrol Et
            </Button>

            {updatePhase === "downloaded" && (
              <Button
                type="primary"
                onClick={() => {
                  void window.desktopApi.installDownloadedUpdate();
                }}
              >
                Kuruluma Başla
              </Button>
            )}

            {isDevelopmentUpdateMode && (
              <Button
                type="text"
                icon={<BugOutlined />}
                onClick={() => {
                  void handleOpenUpdateDebugScreen();
                }}
                loading={isLaunchingUpdateDebug}
                disabled={isLaunchingUpdateDebug}
              >
                Güncelleme Debug Ekranı
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
