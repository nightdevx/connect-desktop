import { useEffect, useRef, useState } from "react";
import { Select, Button, message } from "antd";
import { VideoCameraOutlined, SaveOutlined, EyeOutlined, EyeInvisibleOutlined } from "@ant-design/icons";
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
  const [messageApi, contextHolder] = message.useMessage();
  const [draftCameraPreferences, setDraftCameraPreferences] =
    useState<CameraPreferences>(cameraPreferences);
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
    messageApi.success("Kamera ayarları kaydedildi.");
  };

  const handleStartCameraTest = async (): Promise<void> => {
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
      messageApi.success("Kamera testi başlatıldı.");
    } catch (error) {
      messageApi.error(
        `Kamera testi başlatılamadı: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
      );
    } finally {
      setIsStartingCameraTest(false);
    }
  };

  return (
    <div className="ct-settings-section">
      {contextHolder}
      <div className="ct-settings-section-header">
        <div className="ct-settings-section-header-icon">
          <VideoCameraOutlined style={{ fontSize: "20px" }} />
        </div>
        <div>
          <h4>Kamera Ayarları</h4>
          <p className="ct-settings-section-description">
            Kamera açılırken kullanılacak kalite ayarlarını belirleyebilirsin.
          </p>
        </div>
      </div>

      <div className="ct-settings-content" style={{ marginTop: "24px" }}>
        <div className="ct-settings-grid" style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "16px",
          marginBottom: "24px",
        }}>
          <div>
            <label className="ct-label" htmlFor="settings-camera-resolution" style={{ display: "block", marginBottom: "6px", fontSize: "12px", color: "rgba(255,255,255,0.45)" }}>
              Kamera Çözünürlüğü
            </label>
            <Select
              id="settings-camera-resolution"
              value={draftCameraPreferences.resolution}
              onChange={(value) =>
                setDraftCameraPreferences((previous) => ({
                  ...previous,
                  resolution: value as CameraPreferences["resolution"],
                }))
              }
              options={[
                { value: "720p", label: "1280 x 720 (HD)" },
                { value: "1080p", label: "1920 x 1080 (Full HD)" },
              ]}
              style={{ width: "100%", height: "40px" }}
            />
          </div>

          <div>
            <label className="ct-label" htmlFor="settings-camera-fps" style={{ display: "block", marginBottom: "6px", fontSize: "12px", color: "rgba(255,255,255,0.45)" }}>
              Kamera Kare Hızı
            </label>
            <Select
              id="settings-camera-fps"
              value={draftCameraPreferences.frameRate}
              onChange={(value) =>
                setDraftCameraPreferences((previous) => ({
                  ...previous,
                  frameRate: value as CameraPreferences["frameRate"],
                }))
              }
              options={[
                { value: 24, label: "24 FPS" },
                { value: 30, label: "30 FPS" },
              ]}
              style={{ width: "100%", height: "40px" }}
            />
          </div>
        </div>

        <div className="ct-settings-actions" style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSaveCameraPreferences}
            style={{
              background: "#ffffff",
              borderColor: "#ffffff",
              color: "#000000",
              fontWeight: "600",
              height: "40px",
              borderRadius: "6px",
            }}
          >
            Kamera Ayarlarını Kaydet
          </Button>

          <Button
            type="text"
            icon={cameraTestStream ? <EyeInvisibleOutlined /> : <EyeOutlined />}
            onClick={() => {
              if (cameraTestStream) {
                stopCameraTest();
                messageApi.info("Kamera testi durduruldu.");
                return;
              }

              void handleStartCameraTest();
            }}
            loading={isStartingCameraTest}
            disabled={isStartingCameraTest}
            style={{
              background: isStartingCameraTest 
                ? "rgba(255, 255, 255, 0.02)" 
                : cameraTestStream 
                  ? "rgba(239, 68, 68, 0.08)" 
                  : "rgba(255, 255, 255, 0.05)",
              color: isStartingCameraTest 
                ? "rgba(255, 255, 255, 0.25)" 
                : cameraTestStream 
                  ? "#ef4444" 
                  : "#ffffff",
              height: "40px",
              borderRadius: "6px",
            }}
          >
            {cameraTestStream ? "Kamera Testini Durdur" : "Kamera Testini Başlat"}
          </Button>
        </div>

        <div className="ct-settings-preview-box" style={{
          background: "rgba(0, 0, 0, 0.4)",
          border: "1px solid rgba(255, 255, 255, 0.04)",
          borderRadius: "8px",
          height: "260px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          position: "relative",
        }}>
          {cameraTestStream ? (
            <video
              ref={cameraPreviewRef}
              className="ct-settings-preview-video"
              autoPlay
              muted
              playsInline
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : (
            <p style={{ margin: 0, fontSize: "12px", color: "rgba(255,255,255,0.3)" }}>
              Önizleme bu alanda görünecek.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
