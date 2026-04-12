import { useEffect, useState } from "react";
import type { UserRole } from "../../../../../shared/auth-contracts";
import type {
  AppUpdateEvent,
  AppUpdateSnapshot,
} from "../../../../../shared/update-contracts";
import type { SettingsSection } from "../../../store/ui-store";
import {
  SettingsProfile,
  SettingsSecurity,
  SettingsCamera,
  SettingsAudio,
  SettingsStream,
} from "./settings";
import type {
  CameraPreferences,
  AudioPreferences,
  StreamPreferences,
} from "./settings";
export type {
  CameraPreferences,
  AudioPreferences,
  StreamPreferences,
} from "./settings";

const getUpdateCheckBlockedReason = (reason?: string): string => {
  if (reason === "DEV_MODE") {
    return "Gelistirme modunda guncelleme kontrolu devre disidir.";
  }

  if (reason === "INSTALL_IN_PROGRESS") {
    return "Guncelleme kurulumu devam ediyor. Biraz sonra tekrar dene.";
  }

  if (reason === "CHECK_FAILED") {
    return "Guncelleme kontrolu basarisiz oldu. Tekrar deneyebilirsin.";
  }

  return "Guncelleme kontrolu su anda baslatilamadi.";
};

const getUpdatePhaseLabel = (
  phase: AppUpdateSnapshot["phase"] | "unknown",
): string => {
  if (phase === "checking") {
    return "Kontrol ediliyor";
  }

  if (phase === "available") {
    return "Guncelleme bulundu";
  }

  if (phase === "downloading") {
    return "Indiriliyor";
  }

  if (phase === "downloaded") {
    return "Kurulum hazir";
  }

  if (phase === "not-available") {
    return "Guncel";
  }

  if (phase === "installing") {
    return "Kuruluyor";
  }

  if (phase === "disabled") {
    return "Devre disi";
  }

  if (phase === "error") {
    return "Hata";
  }

  return "Hazir";
};

interface SettingsMainPanelProps {
  settingsSection: SettingsSection;
  currentUsername: string;
  currentUserRole: UserRole;
  currentUserCreatedAt: string;
  onLogout: () => void;
  isLoggingOut: boolean;
  cameraPreferences: CameraPreferences;
  audioPreferences: AudioPreferences;
  streamPreferences: StreamPreferences;
  onSaveCameraPreferences: (next: CameraPreferences) => void;
  onSaveAudioPreferences: (next: AudioPreferences) => void;
  onSaveStreamPreferences: (next: StreamPreferences) => void;
}

export function SettingsMainPanel({
  settingsSection,
  currentUsername,
  currentUserRole,
  currentUserCreatedAt,
  onLogout,
  isLoggingOut,
  cameraPreferences,
  audioPreferences,
  streamPreferences,
  onSaveCameraPreferences,
  onSaveAudioPreferences,
  onSaveStreamPreferences,
}: SettingsMainPanelProps) {
  const [appVersion, setAppVersion] = useState("-");
  const [updateState, setUpdateState] = useState<AppUpdateSnapshot | null>(
    null,
  );
  const [isCheckingForUpdates, setIsCheckingForUpdates] = useState(false);
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
        // No-op: version info is optional for the settings footer.
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
            `Guncelleme durumu alinamadi: ${result.error?.message ?? "Bilinmeyen hata"}`,
          );
        }
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        setUpdateNotice(
          `Guncelleme durumu alinamadi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
        );
      });

    const unsubscribe = window.desktopApi.onUpdateEvent(
      (event: AppUpdateEvent) => {
        if (!active) {
          return;
        }

        setUpdateState(event.state);

        if (event.type === "update-error") {
          setUpdateNotice(`Guncelleme hatasi: ${event.errorMessage}`);
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
          `Guncelleme kontrolu baslatilamadi: ${result.error?.message ?? "Bilinmeyen hata"}`,
        );
        return;
      }

      if (!result.data?.requested) {
        setUpdateNotice(getUpdateCheckBlockedReason(result.data?.reason));
        return;
      }

      setUpdateNotice("Guncelleme kontrolu baslatildi.");
    } catch (error) {
      setUpdateNotice(
        `Guncelleme kontrolu baslatilamadi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
      );
    } finally {
      setIsCheckingForUpdates(false);
    }
  };

  const currentVersionLabel = updateState?.currentVersion ?? appVersion;
  const nextVersionLabel = updateState?.nextVersion;
  const updatePhase = updateState?.phase ?? "unknown";
  const isManualCheckDisabled =
    isCheckingForUpdates ||
    updateState?.phase === "checking" ||
    updateState?.phase === "installing";

  return (
    <div className="ct-settings-main-panel">
      {settingsSection === "profile" && (
        <SettingsProfile currentUsername={currentUsername} />
      )}

      {settingsSection === "security" && <SettingsSecurity />}

      {settingsSection === "camera" && (
        <SettingsCamera
          cameraPreferences={cameraPreferences}
          onSaveCameraPreferences={onSaveCameraPreferences}
        />
      )}

      {settingsSection === "audio" && (
        <SettingsAudio
          audioPreferences={audioPreferences}
          onSaveAudioPreferences={onSaveAudioPreferences}
        />
      )}

      {settingsSection === "stream" && (
        <SettingsStream
          streamPreferences={streamPreferences}
          onSaveStreamPreferences={onSaveStreamPreferences}
          onLogout={onLogout}
          isLoggingOut={isLoggingOut}
        />
      )}

      <section className="ct-settings-footer" aria-live="polite">
        <h4>Uygulama Guncellemeleri</h4>
        <p>
          Ayarlar sayfasindan manuel olarak guncelleme kontrolu baslatabilirsin.
        </p>

        <div className="ct-settings-footer-actions">
          <button
            type="button"
            className={`ct-settings-footer-chip ${updatePhase === "checking" ? "active" : ""}`}
            onClick={() => {
              void handleManualUpdateCheck();
            }}
            disabled={isManualCheckDisabled}
          >
            {isManualCheckDisabled
              ? "Kontrol ediliyor..."
              : "Guncellemeleri Kontrol Et"}
          </button>
        </div>

        <p>Surum: v{currentVersionLabel}</p>
        <p>Durum: {getUpdatePhaseLabel(updatePhase)}</p>
        {nextVersionLabel && <p>Bulunan surum: v{nextVersionLabel}</p>}
        <p>{updateState?.message ?? "Guncelleme bilgisi bekleniyor."}</p>

        {updateNotice && <p className="ct-settings-notice">{updateNotice}</p>}
      </section>
    </div>
  );
}
