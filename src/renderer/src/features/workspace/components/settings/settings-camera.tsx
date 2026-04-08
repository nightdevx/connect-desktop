import { useEffect, useRef, useState } from "react";
import type { CameraPreferences } from "./settings-main-panel-types";

interface SettingsCameraProps {
  cameraPreferences: CameraPreferences;
  onSaveCameraPreferences: (next: CameraPreferences) => void;
}

const stopMediaStreamTracks = (stream: MediaStream | null): void => {
  if (!stream) {
    return;
  }

  stream.getTracks().forEach((track) => {
    track.onended = null;
    track.stop();
  });
};

export function SettingsCamera({
  cameraPreferences,
  onSaveCameraPreferences,
}: SettingsCameraProps) {
  const [draftCameraPreferences, setDraftCameraPreferences] =
    useState<CameraPreferences>(cameraPreferences);
  const [cameraNotice, setCameraNotice] = useState("");
  const [cameraTestStream, setCameraTestStream] = useState<MediaStream | null>(
    null,
  );
  const [isStartingCameraTest, setIsStartingCameraTest] = useState(false);
  const cameraPreviewRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setDraftCameraPreferences(cameraPreferences);
  }, [cameraPreferences]);

  useEffect(() => {
    if (!cameraPreviewRef.current) {
      return;
    }

    cameraPreviewRef.current.srcObject = cameraTestStream;
  }, [cameraTestStream]);

  useEffect(() => {
    return () => {
      stopMediaStreamTracks(cameraTestStream);
    };
  }, [cameraTestStream]);

  const stopCameraTest = (): void => {
    stopMediaStreamTracks(cameraTestStream);
    setCameraTestStream(null);
  };

  const handleSaveCameraPreferences = (): void => {
    onSaveCameraPreferences(draftCameraPreferences);
    setCameraNotice("Kamera ayarları kaydedildi.");
  };

  const handleStartCameraTest = async (): Promise<void> => {
    setCameraNotice("");
    setIsStartingCameraTest(true);

    try {
      stopCameraTest();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: {
            ideal: draftCameraPreferences.resolution === "1080p" ? 1920 : 1280,
          },
          height: {
            ideal: draftCameraPreferences.resolution === "1080p" ? 1080 : 720,
          },
          frameRate: {
            ideal: draftCameraPreferences.frameRate,
            max: draftCameraPreferences.frameRate,
          },
        },
      });

      setCameraTestStream(stream);
      setCameraNotice("Kamera testi başlatıldı.");
    } catch (error) {
      setCameraNotice(
        `Kamera testi başlatılamadı: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
      );
    } finally {
      setIsStartingCameraTest(false);
    }
  };

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
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </div>
        <div>
          <h4>Kamera Ayarları</h4>
          <p className="ct-settings-section-description">
            Kamera açılırken kullanılacak kalite ayarlarını belirleyebilirsin.
          </p>
        </div>
      </div>

      <div className="ct-settings-content">
        <div className="ct-settings-grid">
          <label className="ct-label" htmlFor="settings-camera-resolution">
            Kamera Çözünürlüğü
            <select
              id="settings-camera-resolution"
              className="ct-input"
              value={draftCameraPreferences.resolution}
              onChange={(event) =>
                setDraftCameraPreferences((previous) => ({
                  ...previous,
                  resolution: event.target
                    .value as CameraPreferences["resolution"],
                }))
              }
            >
              <option value="720p">1280 x 720 (HD)</option>
              <option value="1080p">1920 x 1080 (Full HD)</option>
            </select>
          </label>

          <label className="ct-label" htmlFor="settings-camera-fps">
            Kamera Kare Hızı
            <select
              id="settings-camera-fps"
              className="ct-input"
              value={String(draftCameraPreferences.frameRate)}
              onChange={(event) =>
                setDraftCameraPreferences((previous) => ({
                  ...previous,
                  frameRate: Number.parseInt(
                    event.target.value,
                    10,
                  ) as CameraPreferences["frameRate"],
                }))
              }
            >
              <option value="24">24 FPS</option>
              <option value="30">30 FPS</option>
            </select>
          </label>
        </div>

        <div className="ct-settings-actions">
          <button
            type="button"
            className="ct-btn-primary"
            onClick={handleSaveCameraPreferences}
          >
            Kamera Ayarlarını Kaydet
          </button>
          <button
            type="button"
            className="ct-btn-secondary"
            onClick={() => {
              if (cameraTestStream) {
                stopCameraTest();
                setCameraNotice("Kamera testi durduruldu.");
                return;
              }

              void handleStartCameraTest();
            }}
            disabled={isStartingCameraTest}
          >
            {isStartingCameraTest
              ? "Başlatılıyor..."
              : cameraTestStream
                ? "Kamera Testini Durdur"
                : "Kamera Testini Başlat"}
          </button>
        </div>

        <div className="ct-settings-preview-box">
          {cameraTestStream ? (
            <video
              ref={cameraPreviewRef}
              className="ct-settings-preview-video"
              autoPlay
              muted
              playsInline
            />
          ) : (
            <p>Önizleme bu alanda görünecek.</p>
          )}
        </div>

        {cameraNotice && <p className="ct-settings-notice">{cameraNotice}</p>}
      </div>
    </div>
  );
}
