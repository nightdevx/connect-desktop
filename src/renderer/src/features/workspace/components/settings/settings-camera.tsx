import { useEffect, useRef, useState } from "react";
import { Select, Button, message } from "antd";
import { VideoCameraOutlined, EyeOutlined, EyeInvisibleOutlined } from "@ant-design/icons";
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
  }, [capabilities]);

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

  // Real-time FPS and resolution measurement for development mode
  useEffect(() => {
    if (!cameraTestStream || !cameraPreviewRef.current) {
      setDevStats(null);
      return;
    }

    const videoEl = cameraPreviewRef.current;
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
      messageApi.success("Kamera testi başlatıldı.");
    } catch (error) {
      messageApi.error(
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
  }, [draftCameraPreferences.resolution, draftCameraPreferences.frameRate]);

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
                handlePreferenceChange("resolution", value)
              }
              options={[
                { value: "720p", label: "1280 x 720 (HD)" },
                ...(capabilities
                  ? (capabilities.resolutions.includes("1080p")
                      ? [{ value: "1080p", label: "1920 x 1080 (Full HD)" }]
                      : [])
                  : [{ value: "1080p", label: "1920 x 1080 (Full HD)" }]),
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
                handlePreferenceChange("frameRate", value)
              }
              options={[
                { value: 24, label: "24 FPS" },
                ...(capabilities
                  ? (capabilities.fpsOptions.includes(30)
                      ? [{ value: 30, label: "30 FPS" }]
                      : [])
                  : [{ value: 30, label: "30 FPS" }]),
              ]}
              style={{ width: "100%", height: "40px" }}
            />
          </div>
        </div>

        <div className="ct-settings-actions" style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
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
                objectFit: "contain",
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
