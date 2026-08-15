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
        <div className="ct-settings-section-header-main">
          <div className="ct-settings-section-header-icon">
            <DesktopOutlined />
          </div>
          <div>
            <h4>Yayın Ayarları</h4>
            <p className="ct-settings-section-description">
            Yayın başlatılırken kullanılacak varsayılan kaliteyi belirleyebilirsin.
            </p>
          </div>
        </div>
      </div>

      <div className="ct-settings-content">
        <div className="ct-settings-subsection">
          <h5>Yayın Kalitesi</h5>

          <div className="ct-settings-form-group">
            <div>
              <label className="ct-field-label" htmlFor="settings-stream-fps">
                Yayın Kare Hızı
              </label>
              <Select
                id="settings-stream-fps"
                value={draftStreamPreferences.frameRate}
                onChange={(value) => handlePreferenceChange("frameRate", value)}
                options={[
                  { value: 15, label: "15 FPS" },
                  { value: 30, label: "30 FPS" },
                  { value: 60, label: "60 FPS" },
                ]}
                className="ct-block-control"
              />
            </div>

            <div>
              <label className="ct-field-label" htmlFor="settings-stream-codec">
                Video Codec
              </label>
              <Select
                id="settings-stream-codec"
                value={draftStreamPreferences.videoCodec}
                onChange={(value) => handlePreferenceChange("videoCodec", value)}
                options={[
                  { value: "auto", label: "Otomatik (önerilen)" },
                  { value: "h264", label: "H.264 — en geniş donanım desteği" },
                  { value: "vp8", label: "VP8 — yazılım, en uyumlu" },
                  { value: "vp9", label: "VP9 — daha iyi sıkıştırma, ağır" },
                  { value: "av1", label: "AV1 — en iyi sıkıştırma, en ağır" },
                ]}
                className="ct-block-control"
              />
              {/* The hardware-acceleration switch lives on another tab, so
                  say where: the hint used to name it with no way to find it. */}
              <span className="ct-field-hint">
                Otomatik: donanım hızlandırma açıkken H.264, kapalıyken VP8. Bu
                anahtar Uygulama {">"} Genel {">"} Performans altındadır.
                Değişiklik bir sonraki yayında geçerli olur.
              </span>
            </div>
          </div>
        </div>

        <div className="ct-settings-subsection">
          <h5>Yayın Sesi</h5>

          <div className="ct-settings-switch-list">
            <div className="ct-settings-switch-item">
              <div className="ct-settings-switch-item-content">
                <strong>Ekran paylaşımında sistem sesini dahil et</strong>
                <span>Tarayıcı izin veriyorsa sistem sesi yayına eklenir.</span>
              </div>
              <Switch
                checked={draftStreamPreferences.captureSystemAudio}
                onChange={(checked) =>
                  handlePreferenceChange("captureSystemAudio", checked)
                }
              />
            </div>
          </div>
        </div>

        <div className="ct-settings-subsection">
          <h5>Yayın Testi</h5>

          <div className="ct-settings-actions">
            <Button
              type="text"
              icon={
                streamTestStream ? <EyeInvisibleOutlined /> : <EyeOutlined />
              }
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
              danger={Boolean(streamTestStream)}
            >
              {streamTestStream
                ? "Yayın Testini Durdur"
                : "Yayın Testini Başlat"}
            </Button>
          </div>

          <div className="ct-media-preview">
            {process.env.NODE_ENV === "development" && devStats && (
              <div className="ct-media-preview-badge">
                Dev Stats: {devStats.width}x{devStats.height} @ {devStats.fps}{" "}
                FPS
              </div>
            )}

            {streamTestStream ? (
              <video
                ref={streamPreviewRef}
                className="ct-settings-preview-video"
                autoPlay
                muted
                playsInline
              />
            ) : (
              <p className="ct-media-preview-placeholder">
                Yayın önizlemesi bu alanda görünecek.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
