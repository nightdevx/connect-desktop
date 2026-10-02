import { useEffect, useRef, useState } from "react";
import { Select, Button, Segmented } from "antd";
import {
  DashboardOutlined,
  ExpandOutlined,
  StopOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import type { CameraPreferences } from "./settings-main-panel-types";
import { SettingsGroup, SettingsPage, SettingsRow } from "./settings-layout";
import { toast } from "@/services/toast";

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
  const [cameraTestStream, setCameraTestStream] = useState<MediaStream | null>(
    null,
  );
  const [isStartingCameraTest, setIsStartingCameraTest] = useState(false);
  const [devStats, setDevStats] = useState<{ fps: number; width: number; height: number } | null>(null);
  const cameraPreviewRef = useRef<HTMLVideoElement | null>(null);

  const [capabilities, setCapabilities] = useState<{
    resolutions: string[];
    fpsOptions: number[];
  } | null>(null);

  // Helper to handle change and immediately save
  const handlePreferenceChange = (
    key: keyof CameraPreferences,
    value: unknown,
  ): void => {
    const nextPrefs = {
      ...draftCameraPreferences,
      [key]: value,
    };
    setDraftCameraPreferences(nextPrefs as CameraPreferences);
    onSaveCameraPreferences(nextPrefs as CameraPreferences);
  };

  // The draft follows the preferences it was seeded from. Same trap as the
  // audio panel: seeded once on mount, every control here writes the whole
  // object back, so a change made anywhere else was reverted by the next
  // touch of any control on this page.
  useEffect(() => {
    setDraftCameraPreferences(cameraPreferences);
  }, [cameraPreferences]);

  // Detect camera hardware capabilities
  useEffect(() => {
    let active = true;

    const detectCapabilities = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasVideoDevice = devices.some(device => device.kind === "videoinput");
        if (!hasVideoDevice) {
          if (active) {
            setCapabilities({
              resolutions: ["720p"],
              fpsOptions: [24]
            });
          }
          return;
        }

        let supports1080p = false;
        let supports30fps = false;

        // 1. Probe for 1080p support using exact constraints
        try {
          const stream1080p = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              width: { exact: 1920 },
              height: { exact: 1080 }
            }
          });
          const track = stream1080p.getVideoTracks()[0];
          if (track) {
            const settings = track.getSettings();
            if (settings.width === 1920 && settings.height === 1080) {
              supports1080p = true;
            }
            if (settings.frameRate && settings.frameRate >= 30) {
              supports30fps = true;
            }
          }
          stream1080p.getTracks().forEach(t => t.stop());
        } catch (e) {
          console.info("[CameraProbe] 1080p is not supported or rejected:", e);
        }

        // 2. Probe for 30 FPS at 720p if not already detected
        if (!supports30fps) {
          try {
            const stream720p = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: {
                width: { exact: 1280 },
                height: { exact: 720 },
                frameRate: { exact: 30 }
              }
            });
            const track = stream720p.getVideoTracks()[0];
            if (track) {
              const settings = track.getSettings();
              if (settings.frameRate && settings.frameRate >= 30) {
                supports30fps = true;
              }
            }
            stream720p.getTracks().forEach(t => t.stop());
          } catch (e) {
            console.info("[CameraProbe] 30 FPS is not supported or rejected at 720p:", e);
          }
        }

        if (active) {
          setCapabilities({
            resolutions: supports1080p ? ["720p", "1080p"] : ["720p"],
            fpsOptions: supports30fps ? [24, 30] : [24]
          });
        }
      } catch (err) {
        console.warn("Failed to detect camera capabilities:", err);
        if (active) {
          setCapabilities({
            resolutions: ["720p"],
            fpsOptions: [24, 30]
          });
        }
      }
    };

    void detectCapabilities();

    return () => {
      active = false;
    };
  }, []);

  // Auto-correct saved/draft preferences if they exceed hardware capabilities
  useEffect(() => {
    if (capabilities) {
      if (draftCameraPreferences.resolution === "1080p" && !capabilities.resolutions.includes("1080p")) {
        handlePreferenceChange("resolution", "720p");
      }
      if (draftCameraPreferences.frameRate === 30 && !capabilities.fpsOptions.includes(30)) {
        handlePreferenceChange("frameRate", 24);
      }
    }
    // Runs when the HARDWARE answer arrives, not when the draft changes: the body
    // writes to the draft, so depending on it would correct a value, notice the
    // correction, and correct it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capabilities]);

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

  // Real-time FPS and resolution measurement for development mode
  useEffect(() => {
    if (!cameraTestStream || !cameraPreviewRef.current) {
      setDevStats(null);
      return;
    }

    const videoEl = cameraPreviewRef.current;
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
        const track = cameraTestStream.getVideoTracks()[0];
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
  }, [cameraTestStream]);

  const stopCameraTest = (): void => {
    stopMediaStreamTracks(cameraTestStream);
    setCameraTestStream(null);
  };

  const handleStartCameraTest = async (): Promise<void> => {
    setIsStartingCameraTest(true);

    try {
      stopCameraTest();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: {
            exact: draftCameraPreferences.resolution === "1080p" ? 1920 : 1280,
          },
          height: {
            exact: draftCameraPreferences.resolution === "1080p" ? 1080 : 720,
          },
          frameRate: {
            ideal: draftCameraPreferences.frameRate,
            max: draftCameraPreferences.frameRate,
          },
        },
      });

      setCameraTestStream(stream);
      toast.success("Kamera testi başlatıldı.");
    } catch (error) {
      toast.error(
        `Kamera testi başlatılamadı: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
      );
    } finally {
      setIsStartingCameraTest(false);
    }
  };

  // Restart the test stream if preferences change while the test is running
  const isFirstMount = useRef(true);
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    if (cameraTestStream) {
      void handleStartCameraTest();
    }
    // Only a resolution or framerate change restarts the preview. cameraTestStream
    // is what the body checks and what the restart replaces — depending on it
    // would restart the capture in response to its own result, forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftCameraPreferences.resolution, draftCameraPreferences.frameRate]);

  const resolutionOptions = [
    { value: "720p", label: "1280 × 720 (HD)" },
    ...(!capabilities || capabilities.resolutions.includes("1080p")
      ? [{ value: "1080p", label: "1920 × 1080 (Full HD)" }]
      : []),
  ];

  const frameRateOptions = [
    { value: 24, label: "24 FPS" },
    ...(!capabilities || capabilities.fpsOptions.includes(30)
      ? [{ value: 30, label: "30 FPS" }]
      : []),
  ];

  return (
    <SettingsPage
      title="Kamera"
      description="Kameranı açtığında görüntünün hangi kalitede gideceği. Seçenekler kameranın desteklediklerine göre listelenir."
    >
      <SettingsGroup title="Görüntü kalitesi">
        <SettingsRow
          icon={<ExpandOutlined />}
          title="Çözünürlük"
          description="Yüksek çözünürlük daha net, ama daha çok bant genişliği harcar."
          htmlFor="settings-camera-resolution"
        >
          <Select
            id="settings-camera-resolution"
            value={draftCameraPreferences.resolution}
            onChange={(value) => handlePreferenceChange("resolution", value)}
            options={resolutionOptions}
            className="ct-settings-row-select"
          />
        </SettingsRow>

        <SettingsRow
          icon={<DashboardOutlined />}
          title="Kare hızı"
          description="Saniyedeki kare sayısı; yüksek değer hareketi daha akıcı gösterir."
        >
          <Segmented
            aria-label="Kamera kare hızı"
            value={draftCameraPreferences.frameRate}
            onChange={(value) => handlePreferenceChange("frameRate", value)}
            options={frameRateOptions}
            className="ct-segmented-premium"
          />
        </SettingsRow>
      </SettingsGroup>

      {/* The button that starts the preview sits on the title line of the card
          it fills -- a row of its own put a band of empty panel between the
          control and the thing it turns on. */}
      <SettingsGroup
        title="Önizleme"
        description="Başkalarının seni nasıl göreceğini, seçili kalitede gösterir."
        action={
          <Button
            type={cameraTestStream ? "default" : "primary"}
            icon={cameraTestStream ? <StopOutlined /> : <VideoCameraOutlined />}
            onClick={() => {
              if (cameraTestStream) {
                stopCameraTest();
                toast.info("Kamera testi durduruldu.");
                return;
              }

              void handleStartCameraTest();
            }}
            loading={isStartingCameraTest}
            disabled={isStartingCameraTest}
            danger={Boolean(cameraTestStream)}
          >
            {cameraTestStream ? "Durdur" : "Önizlemeyi başlat"}
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

            {cameraTestStream ? (
              <video
                ref={cameraPreviewRef}
                className="ct-settings-preview-video"
                aria-label="Kamera önizlemesi"
                autoPlay
                muted
                playsInline
              />
            ) : (
              <div className="ct-media-preview-placeholder">
                <VideoCameraOutlined />
                <span>Önizlemeyi başlatınca görüntün burada görünür.</span>
              </div>
            )}
          </div>
        </div>
      </SettingsGroup>
    </SettingsPage>
  );
}
