import { useEffect, useRef, useState } from "react";
import type { AudioPreferences } from "./settings-main-panel-types";

interface SettingsAudioProps {
  audioPreferences: AudioPreferences;
  audioInputDevices: MediaDeviceInfo[];
  audioOutputDevices: MediaDeviceInfo[];
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

const closeAudioContextSafely = async (
  audioContext: AudioContext | null,
): Promise<void> => {
  if (!audioContext || audioContext.state === "closed") {
    return;
  }

  try {
    await audioContext.close();
  } catch {
    // no-op
  }
};

export function SettingsAudio({
  audioPreferences,
  audioInputDevices,
  audioOutputDevices,
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
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const audioAnimationRef = useRef<number | null>(null);
  const audioTestStreamRef = useRef<MediaStream | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioTestStreamRef.current = audioTestStream;
  }, [audioTestStream]);

  useEffect(() => {
    setDraftAudioPreferences(audioPreferences);
  }, [audioPreferences]);

  useEffect(() => {
    return () => {
      stopMediaStreamTracks(audioTestStreamRef.current);

      const previewElement = audioPreviewRef.current;
      if (previewElement) {
        previewElement.pause();
        previewElement.srcObject = null;
      }

      if (audioAnimationRef.current !== null) {
        window.cancelAnimationFrame(audioAnimationRef.current);
      }

      audioAnalyserRef.current = null;
      audioSourceRef.current = null;
      audioDataRef.current = null;

      const activeAudioContext = audioContextRef.current;
      audioContextRef.current = null;
      void closeAudioContextSafely(activeAudioContext);
    };
  }, []);

  const stopAudioTest = async (): Promise<void> => {
    stopMediaStreamTracks(audioTestStream);
    setAudioTestStream(null);

    const previewElement = audioPreviewRef.current;
    if (previewElement) {
      previewElement.pause();
      previewElement.srcObject = null;
    }

    if (audioAnimationRef.current !== null) {
      window.cancelAnimationFrame(audioAnimationRef.current);
      audioAnimationRef.current = null;
    }

    audioAnalyserRef.current = null;
    audioSourceRef.current = null;
    audioDataRef.current = null;
    setMicLevelPercent(0);

    const activeAudioContext = audioContextRef.current;
    audioContextRef.current = null;
    await closeAudioContextSafely(activeAudioContext);
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

      const buildAudioConstraints = (
        deviceId: string | null,
      ): MediaTrackConstraints => ({
        echoCancellation: true,
        noiseSuppression: true,
        deviceId: deviceId ? { exact: deviceId } : undefined,
      });

      const preferredInputDeviceId =
        draftAudioPreferences.selectedAudioInputDeviceId;

      if (
        preferredInputDeviceId &&
        !audioInputDevices.some(
          (device) =>
            device.kind === "audioinput" &&
            device.deviceId === preferredInputDeviceId,
        )
      ) {
        setAudioNotice(
          "Secili mikrofon su anda bagli degil. Test varsayilan mikrofonla denenecek.",
        );
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: buildAudioConstraints(
            preferredInputDeviceId &&
              audioInputDevices.some(
                (device) =>
                  device.kind === "audioinput" &&
                  device.deviceId === preferredInputDeviceId,
              )
              ? preferredInputDeviceId
              : null,
          ),
          video: false,
        });
      } catch (error) {
        if (!preferredInputDeviceId) {
          throw error;
        }

        stream = await navigator.mediaDevices.getUserMedia({
          audio: buildAudioConstraints(null),
          video: false,
        });
        setAudioNotice(
          "Secili mikrofon bulunamadi. Test varsayilan mikrofonla baslatildi.",
        );
      }

      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;
      analyser.minDecibels = -100;
      analyser.maxDecibels = -10;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const previewElement = audioPreviewRef.current;
      if (previewElement) {
        previewElement.srcObject = stream;
        previewElement.muted = false;
        previewElement.volume = 1;

        const selectedOutputDeviceId =
          draftAudioPreferences.selectedAudioOutputDeviceId;
        if (selectedOutputDeviceId) {
          const sinkTarget = previewElement as HTMLAudioElement & {
            setSinkId?: (sinkId: string) => Promise<void>;
          };

          if (typeof sinkTarget.setSinkId === "function") {
            try {
              await sinkTarget.setSinkId(selectedOutputDeviceId);
            } catch {
              setAudioNotice(
                "Secili ses cikis cihazi testte kullanilamadi. Varsayilan cikisa gecildi.",
              );
            }
          }
        }

        await previewElement.play();
      }

      const data = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      audioContextRef.current = audioContext;
      audioAnalyserRef.current = analyser;
      audioSourceRef.current = source;
      audioDataRef.current = data as Uint8Array<ArrayBuffer>;
      setAudioTestStream(stream);

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const updateMeter = (): void => {
        const activeAnalyser = audioAnalyserRef.current;
        const activeData = audioDataRef.current;
        if (!activeAnalyser || !activeData) {
          return;
        }

        activeAnalyser.getByteFrequencyData(activeData);

        let peak = 0;
        for (let index = 0; index < activeData.length; index += 1) {
          if (activeData[index] > peak) {
            peak = activeData[index];
          }
        }

        const percent = Math.min(100, Math.round((peak / 255) * 100));
        setMicLevelPercent(percent);
        audioAnimationRef.current = window.requestAnimationFrame(updateMeter);
      };

      updateMeter();
      const activeTrack = stream.getAudioTracks()[0] ?? null;
      const usedDeviceId = activeTrack?.getSettings().deviceId;
      const usedDeviceLabel =
        audioInputDevices.find((device) => device.deviceId === usedDeviceId)
          ?.label ?? activeTrack?.label;

      setAudioNotice((previous) => {
        const deviceSuffix = usedDeviceLabel
          ? ` Aktif mikrofon: ${usedDeviceLabel}.`
          : "";
        const monitorSuffix = " Konusurken kendi sesini duyabilirsin.";

        if (previous.length > 0) {
          return `${previous} Konusarak seviye cubugunu kontrol et.${deviceSuffix}${monitorSuffix}`;
        }

        return `Mikrofon testi baslatildi. Konusarak seviye cubugunu kontrol et.${deviceSuffix}${monitorSuffix}`;
      });
    } catch (error) {
      setAudioNotice(
        `Ses testi baslatilamadi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
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
        void closeAudioContextSafely(audioContext);
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
        <audio ref={audioPreviewRef} hidden playsInline />

        <div className="ct-settings-actions">
          <label className="ct-settings-device-field">
            <span>Mikrofon giriş cihazı</span>
            <select
              className="ct-input"
              value={draftAudioPreferences.selectedAudioInputDeviceId ?? ""}
              onChange={(event) => {
                const nextValue = event.target.value.trim();
                setDraftAudioPreferences((previous) => ({
                  ...previous,
                  selectedAudioInputDeviceId:
                    nextValue.length > 0 ? nextValue : null,
                }));
              }}
            >
              <option value="">Varsayılan mikrofon</option>
              {audioInputDevices.map((device, index) => (
                <option
                  key={device.deviceId || `audio-input-${index}`}
                  value={device.deviceId}
                >
                  {device.label || `Mikrofon ${index + 1}`}
                </option>
              ))}
            </select>
          </label>

          <label className="ct-settings-device-field">
            <span>Ses çıkış cihazı</span>
            <select
              className="ct-input"
              value={draftAudioPreferences.selectedAudioOutputDeviceId ?? ""}
              onChange={(event) => {
                const nextValue = event.target.value.trim();
                setDraftAudioPreferences((previous) => ({
                  ...previous,
                  selectedAudioOutputDeviceId:
                    nextValue.length > 0 ? nextValue : null,
                }));
              }}
            >
              <option value="">Varsayılan ses çıkışı</option>
              {audioOutputDevices.map((device, index) => (
                <option
                  key={device.deviceId || `audio-output-${index}`}
                  value={device.deviceId}
                >
                  {device.label || `Çıkış ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
        </div>

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
