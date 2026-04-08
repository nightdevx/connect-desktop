import { useEffect, useRef, useState } from "react";
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
  const [draftStreamPreferences, setDraftStreamPreferences] =
    useState<StreamPreferences>(streamPreferences);
  const [streamNotice, setStreamNotice] = useState("");
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
    setStreamNotice("Yayın ayarları kaydedildi.");
  };

  const handleStartStreamTest = async (): Promise<void> => {
    setStreamNotice("");
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
          setStreamNotice("Yayın testi sonlandırıldı.");
        };
      }

      setStreamTestStream(stream);
      setStreamNotice(warning ?? "Yayın testi başlatıldı.");
    } catch (error) {
      setStreamNotice(
        `Yayın testi başlatılamadı: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
      );
    } finally {
      setIsStartingStreamTest(false);
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
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
            <line x1="7" y1="2" x2="7" y2="22" />
            <line x1="17" y1="2" x2="17" y2="22" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <line x1="2" y1="7" x2="7" y2="7" />
            <line x1="2" y1="17" x2="7" y2="17" />
            <line x1="17" y1="12" x2="22" y2="12" />
            <line x1="17" y1="17" x2="22" y2="17" />
          </svg>
        </div>
        <div>
          <h4>Yayın Ayarlari</h4>
          <p className="ct-settings-section-description">
            Yayın başlatılırken kullanılacak varsayılan kaliteyi
            belirleyebilirsin.
          </p>
        </div>
      </div>

      <div className="ct-settings-content">
        <div className="ct-settings-form-group">
          <label className="ct-label" htmlFor="settings-stream-fps">
            Yayın Kare Hızı
            <select
              id="settings-stream-fps"
              className="ct-input"
              value={String(draftStreamPreferences.frameRate)}
              onChange={(event) =>
                setDraftStreamPreferences((previous) => ({
                  ...previous,
                  frameRate: Number.parseInt(
                    event.target.value,
                    10,
                  ) as StreamPreferences["frameRate"],
                }))
              }
            >
              <option value="15">15 FPS</option>
              <option value="30">30 FPS</option>
              <option value="60">60 FPS</option>
            </select>
          </label>

          <label
            className="ct-settings-switch-item"
            htmlFor="settings-stream-system-audio"
          >
            <div className="ct-settings-switch-item-content">
              <strong>Ekran paylaşımında sistem sesini dahil et</strong>
              <span>Tarayıcı izin veriyorsa sistem sesi yayına eklenir.</span>
            </div>
            <div className="ct-settings-switch">
              <input
                id="settings-stream-system-audio"
                type="checkbox"
                checked={draftStreamPreferences.captureSystemAudio}
                onChange={(event) =>
                  setDraftStreamPreferences((previous) => ({
                    ...previous,
                    captureSystemAudio: event.target.checked,
                  }))
                }
              />
              <span className="ct-settings-switch-slider" />
            </div>
          </label>
        </div>

        <div className="ct-settings-actions">
          <button
            type="button"
            className="ct-btn-primary"
            onClick={handleSaveStreamPreferences}
          >
            Yayın Ayarlarını Kaydet
          </button>
          <button
            type="button"
            className="ct-btn-secondary"
            onClick={() => {
              if (streamTestStream) {
                stopStreamTest();
                setStreamNotice("Yayın testi durduruldu.");
                return;
              }

              void handleStartStreamTest();
            }}
            disabled={isStartingStreamTest}
          >
            {isStartingStreamTest
              ? "Başlatılıyor..."
              : streamTestStream
                ? "Yayın Testini Durdur"
                : "Yayın Testini Başlat"}
          </button>
          <button
            type="button"
            className="ct-btn-danger"
            onClick={onLogout}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? "Çıkış yapılıyor..." : "Hesaptan Çık"}
          </button>
        </div>

        <div className="ct-settings-preview-box">
          {streamTestStream ? (
            <video
              ref={streamPreviewRef}
              className="ct-settings-preview-video"
              autoPlay
              muted
              playsInline
            />
          ) : (
            <p>Yayın önizlemesi bu alanda görünecek.</p>
          )}
        </div>

        {streamNotice && <p className="ct-settings-notice">{streamNotice}</p>}
      </div>
    </div>
  );
}
