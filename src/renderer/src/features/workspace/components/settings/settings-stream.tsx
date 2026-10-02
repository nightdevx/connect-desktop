import { useEffect, useRef, useState } from "react";
import { Select, Switch, Button, Segmented } from "antd";
import {
  CodeOutlined,
  DashboardOutlined,
  DesktopOutlined,
  SoundOutlined,
  StopOutlined,
} from "@ant-design/icons";
import type { StreamPreferences } from "./settings-main-panel-types";
import { startScreenCapture } from "@/features/screen-share";
import { SettingsGroup, SettingsPage, SettingsRow } from "./settings-layout";
import { toast } from "@/services/toast";

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
    let timerId: ReturnType<typeof setTimeout> | undefined;

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
          toast.info("Yayın testi sonlandırıldı.");
        };
      }

      setStreamTestStream(stream);
      if (warning) {
        toast.warning(warning);
      } else {
        toast.success("Yayın testi başlatıldı.");
      }
    } catch (error) {
      toast.error(
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
    // Same shape as the camera preview: streamTestStream is the thing the restart
    // replaces, so depending on it would make the restart trigger itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftStreamPreferences.frameRate, draftStreamPreferences.captureSystemAudio]);

  return (
    <SettingsPage
      title="Yayın"
      description="Ekranını paylaştığında yayının hangi kalitede ve hangi sesle gideceği."
    >
      <SettingsGroup
        title="Yayın kalitesi"
        description="Değişiklikler bir sonraki yayında geçerli olur."
      >
        <SettingsRow
          icon={<DashboardOutlined />}
          title="Kare hızı"
          description="Oyun ve video için 60, sunum ve kod için 15-30 yeterli."
        >
          <Segmented
            aria-label="Yayın kare hızı"
            value={draftStreamPreferences.frameRate}
            onChange={(value) => handlePreferenceChange("frameRate", value)}
            options={[
              { value: 15, label: "15 FPS" },
              { value: 30, label: "30 FPS" },
              { value: 60, label: "60 FPS" },
            ]}
            className="ct-segmented-premium"
          />
        </SettingsRow>

        {/* The hardware-acceleration switch lives on another page, so the
            description says where: the hint used to name it with no way to
            find it. */}
        <SettingsRow
          icon={<CodeOutlined />}
          title="Video codec"
          description="Otomatik: donanım hızlandırma açıkken H.264, kapalıyken VP8. O anahtar Genel › Performans altında."
          htmlFor="settings-stream-codec"
        >
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
            popupMatchSelectWidth={false}
            className="ct-settings-row-select"
          />
        </SettingsRow>

        <SettingsRow
          icon={<SoundOutlined />}
          title="Sistem sesini dahil et"
          description="Bilgisayarında çalan ses yayına eklenir; izleyenler de duyar."
        >
          <Switch
            checked={draftStreamPreferences.captureSystemAudio}
            onChange={(checked) =>
              handlePreferenceChange("captureSystemAudio", checked)
            }
          />
        </SettingsRow>
      </SettingsGroup>

      {/* Same as the camera page: the control that starts the preview sits on
          the title line of the card it fills. */}
      <SettingsGroup
        title="Önizleme"
        description="Bir ekran ya da pencere seç; yayının seçili kare hızında nasıl görüneceğini burada izle."
        action={
          <Button
            type={streamTestStream ? "default" : "primary"}
            icon={streamTestStream ? <StopOutlined /> : <DesktopOutlined />}
            onClick={() => {
              if (streamTestStream) {
                stopStreamTest();
                toast.info("Yayın testi durduruldu.");
                return;
              }

              void handleStartStreamTest();
            }}
            loading={isStartingStreamTest}
            disabled={isStartingStreamTest}
            danger={Boolean(streamTestStream)}
          >
            {streamTestStream ? "Durdur" : "Önizlemeyi başlat"}
          </Button>
        }
      >
        <div className="ct-settings-block">
          <div className="ct-media-preview">
            {process.env.NODE_ENV === "development" && devStats && (
              <div className="ct-media-preview-badge">
                {devStats.width}×{devStats.height} · {devStats.fps} FPS
              </div>
            )}

            {streamTestStream ? (
              <video
                ref={streamPreviewRef}
                className="ct-settings-preview-video"
                aria-label="Yayın önizlemesi"
                autoPlay
                muted
                playsInline
              />
            ) : (
              <div className="ct-media-preview-placeholder">
                <DesktopOutlined />
                <span>Önizlemeyi başlatınca paylaştığın ekran burada görünür.</span>
              </div>
            )}
          </div>
        </div>
      </SettingsGroup>
    </SettingsPage>
  );
}
