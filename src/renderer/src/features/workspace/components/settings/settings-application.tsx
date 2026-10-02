import { useEffect, useState } from "react";
import { Switch, Button, Alert, Segmented } from "antd";
import {
  BellOutlined,
  BgColorsOutlined,
  BugOutlined,
  CloseSquareOutlined,
  FileGifOutlined,
  GiftOutlined,
  MinusSquareOutlined,
  PoweroffOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import type {
  AppUpdateEvent,
  AppUpdateSnapshot,
} from "@shared/update-contracts";
import type { ThemeMode } from "@/styles/theme-mode";

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: "dark", label: "Koyu" },
  { value: "light", label: "Açık" },
];
import type { GifPlayback } from "@/styles/gif-playback";
import { useUiStore } from "@/store/ui-store";
import { useDesktopAppPreferences } from "./settings-app-preferences";
import { AuthLogoMark } from "@/features/auth";
import { SettingsGroup, SettingsPage, SettingsRow } from "./settings-layout";
import { toast } from "@/services/toast";

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
  const [appVersion, setAppVersion] = useState("-");
  const [updateState, setUpdateState] = useState<AppUpdateSnapshot | null>(
    null,
  );
  const {
    preferences: appPreferences,
    isSaving: isSavingAppPreference,
    needsRelaunch,
    savePreference,
  } = useDesktopAppPreferences();
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
          toast.error(
            `Güncelleme durumu alınamadı: ${result.error?.message ?? "Bilinmeyen hata"}`,
          );
        }
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        toast.error(
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
          toast.error(`Güncelleme hatası: ${event.errorMessage}`);
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
        toast.error(
          `Güncelleme kontrolü başlatılamadı: ${result.error?.message ?? "Bilinmeyen hata"}`,
        );
        return;
      }

      if (!result.data?.requested) {
        toast.warning(getUpdateCheckBlockedReason(result.data?.reason));
        return;
      }

      toast.success("Güncelleme kontrolü başlatıldı.");
    } catch (error) {
      toast.error(
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
        toast.error(
          `Debug güncelleme açılamadı: ${result.error?.message ?? "Bilinmeyen hata"}`,
        );
        return;
      }

      if (!result.data?.started) {
        toast.warning(getUpdateDebugBlockedReason(result.data?.reason));
        return;
      }

      toast.success("Debug güncelleme penceresi açıldı.");
    } catch (error) {
      toast.error(
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

  const phaseTone =
    updatePhase === "error"
      ? " danger"
      : updatePhase === "not-available"
        ? " ok"
        : updatePhase === "available" ||
            updatePhase === "downloading" ||
            updatePhase === "downloaded"
          ? " warn"
          : "";

  return (
    <SettingsPage
      title="Genel"
      description="Connect'in görünümü, bilgisayarında nasıl davrandığı, bildirimleri ve sürümü."
    >
      <SettingsGroup title="Görünüm">
        {/* Local, not a server preference: it is a property of this screen,
            and a person who uses the app on a laptop and a desktop rarely
            wants the same answer on both. Two cards that show the theme,
            rather than two words that name it. */}
        <SettingsRow
          stacked
          icon={<BgColorsOutlined />}
          title="Tema"
          description="Açık tema aydınlık ortamlarda, koyu tema düşük ışıkta daha rahat okunur. Değişiklik anında uygulanır."
        >
          <div className="ct-theme-cards" role="radiogroup" aria-label="Tema">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={themeMode === option.value}
                className={`ct-theme-card ${themeMode === option.value ? "active" : ""}`}
                onClick={() => setThemeMode(option.value)}
              >
                <span className={`ct-theme-swatch ${option.value}`} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                </span>
                <span className="ct-theme-card-label">{option.label}</span>
              </button>
            ))}
          </div>
        </SettingsRow>

        <SettingsRow
          icon={<FileGifOutlined />}
          title="Hareketli görseller"
          description="Sohbetteki GIF'ler sürekli oynayabilir ya da yalnızca üstüne gelince oynar; o zaman ilk karesinde durur."
        >
          <Segmented
            aria-label="Hareketli görseller"
            value={gifPlayback}
            onChange={(value) => setGifPlayback(value as GifPlayback)}
            options={[
              { label: "Sürekli", value: "always" },
              { label: "Üstüne gelince", value: "hover" },
            ]}
            className="ct-segmented-premium"
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Başlangıç ve pencere">
        <SettingsRow
          icon={<PoweroffOutlined />}
          title="Bilgisayar açılınca başlat"
          description="Oturum açtığında Connect arka planda hazır olur."
        >
          <Switch
            checked={appPreferences.launchOnStartup}
            onChange={(checked) => {
              void savePreference("launchOnStartup", checked);
            }}
            disabled={isSavingAppPreference}
          />
        </SettingsRow>

        <SettingsRow
          icon={<MinusSquareOutlined />}
          title="Küçültünce sistem tepsisine gönder"
          description="Küçült düğmesi uygulamayı görev çubuğundan gizler."
        >
          <Switch
            checked={appPreferences.minimizeToTray}
            onChange={(checked) => {
              void savePreference("minimizeToTray", checked);
            }}
            disabled={isSavingAppPreference}
          />
        </SettingsRow>

        <SettingsRow
          icon={<CloseSquareOutlined />}
          title="Kapatınca tepside çalışmaya devam et"
          description="Pencereyi kapatmak uygulamayı sonlandırmaz; aramalar ve mesajlar gelmeye devam eder."
        >
          <Switch
            checked={appPreferences.closeToTray}
            onChange={(checked) => {
              void savePreference("closeToTray", checked);
            }}
            disabled={isSavingAppPreference}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Bildirimler">
        <SettingsRow
          icon={<BellOutlined />}
          title="Masaüstü bildirimleri"
          description="Pencere arka plandayken gelen mesaj ve aramalar için Windows bildirimi gösterir. Odadaki giriş-çıkış sesleri ayrı bir ayar: Ses › Bildirim sesleri."
        >
          <Switch
            checked={appPreferences.desktopNotifications}
            onChange={(checked) => {
              void savePreference("desktopNotifications", checked);
            }}
            disabled={isSavingAppPreference}
          />
        </SettingsRow>

        <SettingsRow
          icon={<GiftOutlined />}
          title="Ücretsiz oyun bildirimleri"
          description={
            appPreferences.desktopNotifications
              ? "Steam, Epic ve diğer mağazalarda bir oyun ücretsiz olduğunda haber verir. Uygulama tepsideyken de çalışır."
              : "Masaüstü bildirimleri kapalıyken hiçbir bildirim gösterilmez."
          }
        >
          <Switch
            checked={appPreferences.freeGameNotifications}
            onChange={(checked) => {
              void savePreference("freeGameNotifications", checked);
            }}
            disabled={
              isSavingAppPreference || !appPreferences.desktopNotifications
            }
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Performans">
        <SettingsRow
          icon={<ThunderboltOutlined />}
          title="Donanım hızlandırma"
          description="Ekran paylaşımı ve kamerayı ekran kartıyla kodlar; işlemci kullanımını büyük ölçüde düşürür. Görüntü siyah geliyor veya bozuluyorsa kapat. Yeniden başlatma gerektirir."
        >
          <Switch
            checked={appPreferences.hardwareAcceleration}
            onChange={(checked) => {
              void savePreference("hardwareAcceleration", checked);
            }}
            disabled={isSavingAppPreference}
          />
        </SettingsRow>

        {needsRelaunch && (
          <div className="ct-settings-block">
            <Alert
              type="warning"
              showIcon
              title="Yeniden başlatma gerekli"
              description="Donanım hızlandırma ayarının etkili olması için uygulamayı yeniden başlat."
              action={
                <Button
                  size="small"
                  onClick={() => {
                    void window.desktopApi.relaunchApp();
                  }}
                >
                  Yeniden başlat
                </Button>
              }
              className="ct-alert"
            />
          </div>
        )}
      </SettingsGroup>

      <SettingsGroup
        title="Güncellemeler"
        footer={
          <>
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
                Debug ekranı
              </Button>
            )}

            {updatePhase === "downloaded" && (
              <Button
                type="primary"
                onClick={() => {
                  void window.desktopApi.installDownloadedUpdate();
                }}
              >
                Kuruluma başla
              </Button>
            )}

            <Button
              type={updatePhase === "downloaded" ? "default" : "primary"}
              icon={<ReloadOutlined />}
              onClick={() => {
                void handleManualUpdateCheck();
              }}
              loading={isManualCheckDisabled}
              disabled={isManualCheckDisabled}
            >
              Güncellemeleri denetle
            </Button>
          </>
        }
      >
        <div className="ct-settings-block">
          <div className="ct-settings-about">
            <AuthLogoMark className="ct-logomark--badge" />
            <div className="ct-settings-about-text">
              <strong>Connect</strong>
              <span>
                Sürüm {currentVersionLabel}
                {nextVersionLabel ? ` · v${nextVersionLabel} bulundu` : ""}
              </span>
            </div>
            <span className={`ct-status-chip${phaseTone}`}>
              {getUpdatePhaseLabel(updatePhase)}
            </span>
          </div>

          {updateState?.message ? (
            <p className="ct-settings-about-message">{updateState.message}</p>
          ) : null}
        </div>
      </SettingsGroup>
    </SettingsPage>
  );
}
