import { useEffect, useRef, useState } from "react";
import { Select, Switch, Button, message } from "antd";
import {
  DesktopOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
} from "@ant-design/icons";
import type { StreamPreferences } from "./settings-main-panel-types";
import { startScreenCapture } from "@/features/screen-share";

interface SettingsStreamProps {
  streamPreferences: StreamPreferences;
  onSaveStreamPreferences: (next: StreamPreferences) => void;
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
}: SettingsStreamProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [draftStreamPreferences, setDraftStreamPreferences] =
    useState<StreamPreferences>(streamPreferences);
  const [streamTestStream, setStreamTestStream] = useState<MediaStream | null>(
    null,
  );
  const [isStartingStreamTest, setIsStartingStreamTest] = useState(false);
  const [devStats, setDevStats] = useState<{ fps: number; width: number; height: number } | null>(null);
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

  // Real-time FPS and resolution measurement for development mode
  useEffect(() => {
    if (!streamTestStream || !streamPreviewRef.current) {
      setDevStats(null);
      return;
    }

    const videoEl = streamPreviewRef.current;
    let lastTime = performance.now();
    let lastFrames = 0;
    let timerId: any;

    const checkStats = () => {
      const now = performance.now();
      const elapsed = (now - lastTime) / 1000;
      if (elapsed <= 0) return;

      let currentFps = 0;
      if (videoEl.getVideoPlaybackQuality) {
        const quality = videoEl.getVideoPlaybackQuality();
        const totalFrames = quality.totalVideoFrames;
        currentFps = Math.round((totalFrames - lastFrames) / elapsed);
        lastFrames = totalFrames;
      } else {
        const track = streamTestStream.getVideoTracks()[0];
        currentFps = Math.round(track?.getSettings().frameRate ?? 0);
      }

      setDevStats({
        fps: currentFps,
        width: videoEl.videoWidth || 0,
        height: videoEl.videoHeight || 0,
      });

      lastTime = now;
    };

    if (videoEl.getVideoPlaybackQuality) {
      lastFrames = videoEl.getVideoPlaybackQuality().totalVideoFrames;
    }

    timerId = setInterval(checkStats, 1000);

    return () => {
      clearInterval(timerId);
    };
  }, [streamTestStream]);

  const stopStreamTest = (): void => {
    stopMediaStreamTracks(streamTestStream);
    setStreamTestStream(null);
  };

  const handlePreferenceChange = (
    key: keyof StreamPreferences,
    value: unknown,
  ): void => {
    const nextPrefs = {
      ...draftStreamPreferences,
      [key]: value,
    };
    setDraftStreamPreferences(nextPrefs);
    onSaveStreamPreferences(nextPrefs);
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

  const isFirstMount = useRef(true);
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    if (streamTestStream) {
      void handleStartStreamTest();
    }
  }, [draftStreamPreferences.frameRate, draftStreamPreferences.captureSystemAudio]);

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
                handlePreferenceChange("frameRate", value)
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
                handlePreferenceChange("captureSystemAudio", checked)
              }
            />
          </div>
        </div>

        <div className="ct-settings-actions" style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
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
        </div>

        <div className="ct-settings-preview-box" style={{
          background: "rgba(0, 0, 0, 0.4)",
          border: "1px solid rgba(255, 255, 255, 0.04)",
          borderRadius: "8px",
          width: "100%",
          aspectRatio: "16 / 9",
          maxHeight: "360px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          position: "relative",
        }}>
          {process.env.NODE_ENV === "development" && devStats && (
            <div style={{
              position: "absolute",
              top: "8px",
              left: "8px",
              background: "rgba(0, 0, 0, 0.75)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: "4px",
              padding: "4px 8px",
              fontSize: "11px",
              fontFamily: "monospace",
              color: "#4ade80",
              zIndex: 10,
              pointerEvents: "none",
            }}>
              Dev Stats: {devStats.width}x{devStats.height} @ {devStats.fps} FPS
            </div>
          )}

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
                objectFit: "contain",
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
