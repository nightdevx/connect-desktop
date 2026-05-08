import { useEffect, useRef, useState } from "react";
import { Select, Switch, Button, message } from "antd";
import {
  DesktopOutlined,
  SaveOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import type { StreamPreferences } from "./settings-main-panel-types";
import { startScreenCapture } from "../../../../services/screen-capture-service";

interface SettingsStreamProps {
  streamPreferences: StreamPreferences;
  onSaveStreamPreferences: (next: StreamPreferences) => void;
  onLogout: () => void;
  isLoggingOut: boolean;
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

export function SettingsStream({
  streamPreferences,
  onSaveStreamPreferences,
  onLogout,
  isLoggingOut,
}: SettingsStreamProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [draftStreamPreferences, setDraftStreamPreferences] =
    useState<StreamPreferences>(streamPreferences);
  const [streamTestStream, setStreamTestStream] = useState<MediaStream | null>(
    null,
  );
  const [isStartingStreamTest, setIsStartingStreamTest] = useState(false);
  const streamPreviewRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setDraftStreamPreferences(streamPreferences);
  }, [streamPreferences]);

  useEffect(() => {
    if (!streamPreviewRef.current) {
      return;
    }

    streamPreviewRef.current.srcObject = streamTestStream;
  }, [streamTestStream]);

  useEffect(() => {
    return () => {
      stopMediaStreamTracks(streamTestStream);
    };
  }, [streamTestStream]);

  const stopStreamTest = (): void => {
    stopMediaStreamTracks(streamTestStream);
    setStreamTestStream(null);
  };

  const handleSaveStreamPreferences = (): void => {
    onSaveStreamPreferences(draftStreamPreferences);
    messageApi.success("Yayın ayarları kaydedildi.");
  };

  const handleStartStreamTest = async (): Promise<void> => {
    setIsStartingStreamTest(true);

    try {
      stopStreamTest();

      const { stream, warning } = await startScreenCapture({
        frameRate: draftStreamPreferences.frameRate,
        captureSystemAudio: draftStreamPreferences.captureSystemAudio,
      });

      const [videoTrack] = stream.getVideoTracks();
      if (videoTrack) {
        videoTrack.onended = () => {
          stopStreamTest();
          messageApi.info("Yayın testi sonlandırıldı.");
        };
      }

      setStreamTestStream(stream);
      if (warning) {
        messageApi.warning(warning);
      } else {
        messageApi.success("Yayın testi başlatıldı.");
      }
    } catch (error) {
      messageApi.error(
        `Yayın testi başlatılamadı: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
      );
    } finally {
      setIsStartingStreamTest(false);
    }
  };

  return (
    <div className="ct-settings-section">
      {contextHolder}
      <div className="ct-settings-section-header">
        <div className="ct-settings-section-header-icon">
          <DesktopOutlined style={{ fontSize: "20px" }} />
        </div>
        <div>
          <h4>Yayın Ayarları</h4>
          <p className="ct-settings-section-description">
            Yayın başlatılırken kullanılacak varsayılan kaliteyi belirleyebilirsin.
          </p>
        </div>
      </div>

      <div className="ct-settings-content" style={{ marginTop: "24px" }}>
        <div className="ct-settings-form-group" style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "24px" }}>
          <div>
            <label className="ct-label" htmlFor="settings-stream-fps" style={{ display: "block", marginBottom: "6px", fontSize: "12px", color: "rgba(255,255,255,0.45)" }}>
              Yayın Kare Hızı
            </label>
            <Select
              id="settings-stream-fps"
              value={draftStreamPreferences.frameRate}
              onChange={(value) =>
                setDraftStreamPreferences((previous) => ({
                  ...previous,
                  frameRate: value as StreamPreferences["frameRate"],
                }))
              }
              options={[
                { value: 15, label: "15 FPS" },
                { value: 30, label: "30 FPS" },
                { value: 60, label: "60 FPS" },
              ]}
              style={{ width: "100%", height: "40px" }}
            />
          </div>

          <div className="ct-settings-switch-item" style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "rgba(255, 255, 255, 0.01)",
            border: "1px solid rgba(255, 255, 255, 0.03)",
            borderRadius: "8px",
            padding: "16px",
          }}>
            <div className="ct-settings-switch-item-content" style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <strong style={{ fontSize: "13px", color: "#ffffff", fontWeight: "600" }}>Ekran paylaşımında sistem sesini dahil et</strong>
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)" }}>Tarayıcı izin veriyorsa sistem sesi yayına eklenir.</span>
            </div>
            <Switch
              checked={draftStreamPreferences.captureSystemAudio}
              onChange={(checked) =>
                setDraftStreamPreferences((previous) => ({
                  ...previous,
                  captureSystemAudio: checked,
                }))
              }
            />
          </div>
        </div>

        <div className="ct-settings-actions" style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSaveStreamPreferences}
            style={{
              background: "#ffffff",
              borderColor: "#ffffff",
              color: "#000000",
              fontWeight: "600",
              height: "40px",
              borderRadius: "6px",
            }}
          >
            Yayın Ayarlarını Kaydet
          </Button>

          <Button
            type="text"
            icon={streamTestStream ? <EyeInvisibleOutlined /> : <EyeOutlined />}
            onClick={() => {
              if (streamTestStream) {
                stopStreamTest();
                messageApi.info("Yayın testi durduruldu.");
                return;
              }

              void handleStartStreamTest();
            }}
            loading={isStartingStreamTest}
            disabled={isStartingStreamTest}
            style={{
              background: streamTestStream ? "rgba(239, 68, 68, 0.08)" : "rgba(255, 255, 255, 0.05)",
              color: streamTestStream ? "#ef4444" : "#ffffff",
              height: "40px",
              borderRadius: "6px",
            }}
          >
            {streamTestStream ? "Yayın Testini Durdur" : "Yayın Testini Başlat"}
          </Button>

          <Button
            danger
            type="primary"
            icon={<LogoutOutlined />}
            onClick={onLogout}
            loading={isLoggingOut}
            disabled={isLoggingOut}
            style={{
              background: "#ef4444",
              borderColor: "#ef4444",
              color: "#ffffff",
              fontWeight: "600",
              height: "40px",
              borderRadius: "6px",
              boxShadow: "0 4px 12px rgba(239, 68, 68, 0.2)",
              marginLeft: "auto",
            }}
          >
            Hesaptan Çık
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
          {streamTestStream ? (
            <video
              ref={streamPreviewRef}
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
              Yayın önizlemesi bu alanda görünecek.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
