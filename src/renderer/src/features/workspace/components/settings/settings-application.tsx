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

// Electron accelerators name modifiers differently from KeyboardEvent, and
// nobody should have to type "CommandOrControl+Shift+M" by hand.
const toAccelerator = (event: KeyboardEvent): string | null => {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("CommandOrControl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");

  const code = event.code;
  let key: string | null = null;
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit[0-9]$/.test(code)) key = code.slice(5);
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) key = code;
  else if (code === "Space") key = "Space";

  if (!key) {
    return null;
  }

  // A bare letter would swallow that key for every application on the machine.
  if (parts.length === 0 && !/^F\d/.test(key)) {
    return null;
  }

  parts.push(key);
  return parts.join("+");
};

interface HotkeyCaptureFieldProps {
  label: string;
  hint: string;
  value: string;
  // "accelerator" produces an Electron global-shortcut string; "key" stores a
  // raw KeyboardEvent.code for the renderer-side push-to-talk listener.
  mode: "accelerator" | "key";
  disabled: boolean;
  onChange: (value: string) => void;
}

function HotkeyCaptureField({
  label,
  hint,
  value,
  mode,
  disabled,
  onChange,
}: HotkeyCaptureFieldProps) {
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!capturing) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setCapturing(false);
        return;
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        onChange("");
        setCapturing(false);
        return;
      }

      if (mode === "key") {
        if (/^(Key[A-Z]|Digit[0-9]|F\d{1,2}|Space)$/.test(event.code)) {
          onChange(event.code);
          setCapturing(false);
        }
        return;
      }

      const accelerator = toAccelerator(event);
      if (accelerator) {
        onChange(accelerator);
        setCapturing(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [capturing, mode, onChange]);

  return (
    <div className="ct-settings-switch-item">
      <div className="ct-settings-switch-item-content">
        <strong>
          {label}
        </strong>
        <span>
          {hint}
        </span>
      </div>
      <Button
        size="small"
        disabled={disabled}
        onClick={() => setCapturing((previous) => !previous)}
        className="ct-hotkey-button"
      >
        {capturing ? "Tuşa basın…" : value || "Atanmadı"}
      </Button>
    </div>
  );
}

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
    hardwareAcceleration: true,
    desktopNotifications: true,
    hotkeyToggleMute: "",
    hotkeyToggleDeafen: "",
    pushToTalk: false,
    pushToTalkKey: "Space",
  });
  const [needsRelaunch, setNeedsRelaunch] = useState(false);
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
    await handleAppPreferenceValueChange(key, value);
  };

  const handleAppPreferenceValueChange = async (
    key: keyof DesktopAppPreferences,
    value: boolean | string,
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

      // GPU/WebRTC switches are read once at process start, so this one needs a
      // restart before it does anything.
      if (key === "hardwareAcceleration") {
        setNeedsRelaunch(true);
        messageApi.info(
          "Donanım hızlandırma ayarı, uygulama yeniden başlatıldığında geçerli olur.",
        );
        return;
      }

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
        <div className="ct-settings-section-header-main">
          <div className="ct-settings-section-header-icon">
            <InfoCircleOutlined />
          </div>
          <div>
            <h4>Uygulama Güncellemeleri</h4>
            <p className="ct-settings-section-description">
            Sürüm durumunu takip edebilir ve güncellemeleri buradan başlatabilirsiniz.
            </p>
          </div>
        </div>
      </div>

      <div className="ct-settings-content">
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
                void handleAppPreferenceToggle("launchOnStartup", checked);
              }}
              disabled={isSavingAppPreference}
            />
          </div>

          <div className="ct-settings-switch-item">
            <div className="ct-settings-switch-item-content">
              <strong>Pencere küçültülünce sistem tepsisine gönder</strong>
              <span>
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

          <div className="ct-settings-switch-item">
            <div className="ct-settings-switch-item-content">
              <strong>Kapat tuşunda sistem tepsisine gizle</strong>
              <span>
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
                void handleAppPreferenceToggle("hardwareAcceleration", checked);
              }}
              disabled={isSavingAppPreference}
            />
          </div>

          <div className="ct-settings-switch-item">
            <div className="ct-settings-switch-item-content">
              <strong>Masaüstü bildirimleri</strong>
              <span>
                Pencere arka plandayken gelen mesaj ve aramalar için işletim
                sistemi bildirimi gösterir.
              </span>
            </div>
            <Switch
              checked={appPreferences.desktopNotifications}
              onChange={(checked) => {
                void handleAppPreferenceToggle("desktopNotifications", checked);
              }}
              disabled={isSavingAppPreference}
            />
          </div>

          <div className="ct-settings-switch-item">
            <div className="ct-settings-switch-item-content">
              <strong>Bas-konuş</strong>
              <span>
                Mikrofon normalde kapalı kalır, tuşu basılı tuttuğunuz sürece
                açılır. Yalnızca uygulama penceresi öndeyken çalışır.
              </span>
            </div>
            <Switch
              checked={appPreferences.pushToTalk}
              onChange={(checked) => {
                void handleAppPreferenceToggle("pushToTalk", checked);
              }}
              disabled={isSavingAppPreference}
            />
          </div>

          {appPreferences.pushToTalk && (
            <HotkeyCaptureField
              label="Bas-konuş tuşu"
              hint="Alana tıklayıp istediğiniz tuşa basın."
              value={appPreferences.pushToTalkKey}
              mode="key"
              disabled={isSavingAppPreference}
              onChange={(next) => {
                void handleAppPreferenceValueChange("pushToTalkKey", next);
              }}
            />
          )}

          <HotkeyCaptureField
            label="Mikrofonu aç/kapat kısayolu"
            hint="Genel kısayol: uygulama arka plandayken de çalışır. Temizlemek için Backspace."
            value={appPreferences.hotkeyToggleMute}
            mode="accelerator"
            disabled={isSavingAppPreference}
            onChange={(next) => {
              void handleAppPreferenceValueChange("hotkeyToggleMute", next);
            }}
          />

          <HotkeyCaptureField
            label="Sesi aç/kapat kısayolu"
            hint="Genel kısayol: uygulama arka plandayken de çalışır. Temizlemek için Backspace."
            value={appPreferences.hotkeyToggleDeafen}
            mode="accelerator"
            disabled={isSavingAppPreference}
            onChange={(next) => {
              void handleAppPreferenceValueChange("hotkeyToggleDeafen", next);
            }}
          />

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
  );
}


