import { useEffect, useRef, useState } from "react";
import type { AudioPreferences } from "./settings-main-panel-types";

interface SettingsAudioProps {
  audioPreferences: AudioPreferences;
  onSaveAudioPreferences: (next: AudioPreferences) => void;
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

export function SettingsAudio({
  audioPreferences,
  onSaveAudioPreferences,
}: SettingsAudioProps) {
  const [draftAudioPreferences, setDraftAudioPreferences] =
    useState<AudioPreferences>(audioPreferences);
  const [audioNotice, setAudioNotice] = useState("");
  const [audioTestStream, setAudioTestStream] = useState<MediaStream | null>(
    null,
  );
  const [isStartingAudioTest, setIsStartingAudioTest] = useState(false);
  const [micLevelPercent, setMicLevelPercent] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioAnalyserRef = useRef<AnalyserNode | null>(null);
  const audioDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const audioAnimationRef = useRef<number | null>(null);

  useEffect(() => {
    setDraftAudioPreferences(audioPreferences);
  }, [audioPreferences]);

  useEffect(() => {
    return () => {
      stopMediaStreamTracks(audioTestStream);

      if (audioAnimationRef.current !== null) {
        window.cancelAnimationFrame(audioAnimationRef.current);
      }

      if (audioContextRef.current) {
        void audioContextRef.current.close();
      }
    };
  }, [audioTestStream]);

  const stopAudioTest = async (): Promise<void> => {
    stopMediaStreamTracks(audioTestStream);
    setAudioTestStream(null);

    if (audioAnimationRef.current !== null) {
      window.cancelAnimationFrame(audioAnimationRef.current);
      audioAnimationRef.current = null;
    }

    audioAnalyserRef.current = null;
    audioDataRef.current = null;
    setMicLevelPercent(0);

    if (audioContextRef.current) {
      await audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  const handleSaveAudioPreferences = (): void => {
    onSaveAudioPreferences(draftAudioPreferences);
    setAudioNotice("Ses ayarları kaydedildi ve uygulandı.");
  };

  const handleStartAudioTest = async (): Promise<void> => {
    setAudioNotice("");
    setIsStartingAudioTest(true);

    try {
      await stopAudioTest();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });

      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const data = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      audioContextRef.current = audioContext;
      audioAnalyserRef.current = analyser;
      audioDataRef.current = data as Uint8Array<ArrayBuffer>;
      setAudioTestStream(stream);

      const updateMeter = (): void => {
        const activeAnalyser = audioAnalyserRef.current;
        const activeData = audioDataRef.current;
        if (!activeAnalyser || !activeData) {
          return;
        }

        activeAnalyser.getByteTimeDomainData(activeData);

        let total = 0;
        for (let index = 0; index < activeData.length; index += 1) {
          const centered = (activeData[index] - 128) / 128;
          total += centered * centered;
        }

        const rms = Math.sqrt(total / activeData.length);
        const percent = Math.min(100, Math.round(rms * 260));
        setMicLevelPercent(percent);
        audioAnimationRef.current = window.requestAnimationFrame(updateMeter);
      };

      updateMeter();
      setAudioNotice(
        "Mikrofon testi başlatıldı. Konuşarak seviye çubuğunu kontrol et.",
      );
    } catch (error) {
      setAudioNotice(
        `Ses testi başlatılamadı: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
      );
    } finally {
      setIsStartingAudioTest(false);
    }
  };

  const handlePlayTestTone = async (): Promise<void> => {
    try {
      const audioContext = new AudioContext();
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 660;

      const now = audioContext.currentTime;
      gainNode.gain.setValueAtTime(0.0001, now);
      gainNode.gain.exponentialRampToValueAtTime(0.1, now + 0.03);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.35);
      oscillator.onended = () => {
        void audioContext.close();
      };

      setAudioNotice("Test sesi çalındı.");
    } catch (error) {
      setAudioNotice(
        `Test sesi çalınamadı: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
      );
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
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </div>
        <div>
          <h4>Ses Ayarları</h4>
          <p className="ct-settings-section-description">
            Ses için varsayılan başlangıç davranışını belirleyebilirsin.
          </p>
        </div>
      </div>

      <div className="ct-settings-content">
        <div className="ct-settings-switch-list">
          <label className="ct-settings-switch-item">
            <div className="ct-settings-switch-item-content">
              <strong>Mikrofon varsayılan olarak açık olsun</strong>
              <span>
                Lobiye girişte mikrofon durumu bu ayara göre uygulanır.
              </span>
            </div>
            <div className="ct-settings-switch">
              <input
                id="settings-audio-mic-default"
                type="checkbox"
                checked={draftAudioPreferences.defaultMicEnabled}
                onChange={(event) =>
                  setDraftAudioPreferences((previous) => ({
                    ...previous,
                    defaultMicEnabled: event.target.checked,
                  }))
                }
              />
              <span className="ct-settings-switch-slider" />
            </div>
          </label>

          <label className="ct-settings-switch-item">
            <div className="ct-settings-switch-item-content">
              <strong>Kulaklık varsayılan olarak açık olsun</strong>
              <span>Lobiye girişte duyma durumu bu ayara göre uygulanır.</span>
            </div>
            <div className="ct-settings-switch">
              <input
                id="settings-audio-headphone-default"
                type="checkbox"
                checked={draftAudioPreferences.defaultHeadphoneEnabled}
                onChange={(event) =>
                  setDraftAudioPreferences((previous) => ({
                    ...previous,
                    defaultHeadphoneEnabled: event.target.checked,
                  }))
                }
              />
              <span className="ct-settings-switch-slider" />
            </div>
          </label>

          <label className="ct-settings-switch-item">
            <div className="ct-settings-switch-item-content">
              <strong>Lobi bildirim sesleri açık olsun</strong>
              <span>
                Kullanıcı giriş-çıkışları ve hızlı medya değişimlerinde ses
                bildirimi çalar.
              </span>
            </div>
            <div className="ct-settings-switch">
              <input
                id="settings-audio-notification-sounds"
                type="checkbox"
                checked={draftAudioPreferences.notificationSoundsEnabled}
                onChange={(event) =>
                  setDraftAudioPreferences((previous) => ({
                    ...previous,
                    notificationSoundsEnabled: event.target.checked,
                  }))
                }
              />
              <span className="ct-settings-switch-slider" />
            </div>
          </label>

          <label className="ct-settings-switch-item">
            <div className="ct-settings-switch-item-content">
              <strong>Gelişmiş gürültü bastırma (RNNoise) kullan</strong>
              <span>
                Mikrofon açıkken arka plan seslerini azaltmak için ücretsiz
                RNNoise işleme katmanı kullanılır.
              </span>
            </div>
            <div className="ct-settings-switch">
              <input
                id="settings-audio-enhanced-noise-suppression"
                type="checkbox"
                checked={draftAudioPreferences.enhancedNoiseSuppressionEnabled}
                onChange={(event) =>
                  setDraftAudioPreferences((previous) => ({
                    ...previous,
                    enhancedNoiseSuppressionEnabled: event.target.checked,
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
            onClick={handleSaveAudioPreferences}
          >
            Ses Ayarlarını Kaydet
          </button>
          <button
            type="button"
            className="ct-btn-secondary"
            onClick={() => {
              if (audioTestStream) {
                void stopAudioTest().then(() => {
                  setAudioNotice("Mikrofon testi durduruldu.");
                });
                return;
              }

              void handleStartAudioTest();
            }}
            disabled={isStartingAudioTest}
          >
            {isStartingAudioTest
              ? "Başlatılıyor..."
              : audioTestStream
                ? "Mikrofon Testini Durdur"
                : "Mikrofon Testini Başlat"}
          </button>
          <button
            type="button"
            className="ct-btn-secondary"
            onClick={() => {
              void handlePlayTestTone();
            }}
          >
            Test Sesi Çal
          </button>
        </div>

        <div className="ct-settings-audio-meter-wrap">
          <span>Mikrofon Seviyesi</span>
          <div className="ct-settings-audio-meter" role="presentation">
            <div
              className="ct-settings-audio-meter-fill"
              style={{ width: `${micLevelPercent}%` }}
            />
          </div>
          <strong>%{micLevelPercent}</strong>
        </div>

        {audioNotice && <p className="ct-settings-notice">{audioNotice}</p>}
      </div>
    </div>
  );
}
