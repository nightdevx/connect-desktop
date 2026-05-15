import { useEffect, useRef, useState } from "react";
import { Select, Switch, Button, Progress, Slider, message } from "antd";
import {
  AudioOutlined,
  SaveOutlined,
  PlayCircleOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
} from "@ant-design/icons";
import type { AudioPreferences } from "./settings-main-panel-types";
import { NOISE_SUPPRESSION_PRESET_OPTIONS } from "../../workspace-media-utils";

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
  const [messageApi, contextHolder] = message.useMessage();
  const [draftAudioPreferences, setDraftAudioPreferences] =
    useState<AudioPreferences>(audioPreferences);
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
    messageApi.success("Ses ayarları kaydedildi ve uygulandı.");
  };

  const handleStartAudioTest = async (): Promise<void> => {
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
        messageApi.info(
          "Seçili mikrofon şu anda bağlı değil. Test varsayılan mikrofonla denenecek.",
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
        messageApi.warning(
          "Seçili mikrofon bulunamadı. Test varsayılan mikrofonla başlatıldı.",
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
              messageApi.warning(
                "Seçili ses çıkış cihazı testte kullanılamadı. Varsayılan çıkışa geçildi.",
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

      messageApi.success(
        `Mikrofon testi başlatıldı.${usedDeviceLabel ? ` Aktif mikrofon: ${usedDeviceLabel}.` : ""} Konuşurken seviye çubuğunu kontrol et.`,
      );
    } catch (error) {
      messageApi.error(
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
        void closeAudioContextSafely(audioContext);
      };

      messageApi.success("Test sesi çalındı.");
    } catch (error) {
      messageApi.error(
        `Test sesi çalınamadı: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
      );
    }
  };

  const inputOptions = [
    { value: "", label: "Varsayılan mikrofon" },
    ...audioInputDevices.map((device, index) => ({
      value: device.deviceId,
      label: device.label || `Mikrofon ${index + 1}`,
    })),
  ];

  const outputOptions = [
    { value: "", label: "Varsayılan ses çıkışı" },
    ...audioOutputDevices.map((device, index) => ({
      value: device.deviceId,
      label: device.label || `Çıkış ${index + 1}`,
    })),
  ];

  return (
    <div className="ct-settings-section">
      {contextHolder}
      <div className="ct-settings-section-header">
        <div className="ct-settings-section-header-icon">
          <AudioOutlined style={{ fontSize: "20px" }} />
        </div>
        <div>
          <h4>Ses Ayarları</h4>
          <p className="ct-settings-section-description">
            Ses için varsayılan başlangıç davranışını belirleyebilirsin.
          </p>
        </div>
      </div>

      <div className="ct-settings-content" style={{ marginTop: "24px" }}>
        <audio ref={audioPreviewRef} hidden playsInline />

        <div
          className="ct-settings-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          <div>
            <label
              className="ct-label"
              htmlFor="settings-audio-input"
              style={{
                display: "block",
                marginBottom: "6px",
                fontSize: "12px",
                color: "rgba(255,255,255,0.45)",
              }}
            >
              Mikrofon giriş cihazı
            </label>
            <Select
              id="settings-audio-input"
              value={draftAudioPreferences.selectedAudioInputDeviceId ?? ""}
              onChange={(value) => {
                const nextValue = value.trim();
                setDraftAudioPreferences((previous) => ({
                  ...previous,
                  selectedAudioInputDeviceId:
                    nextValue.length > 0 ? nextValue : null,
                }));
              }}
              options={inputOptions}
              style={{ width: "100%", height: "40px" }}
            />
          </div>

          <div>
            <label
              className="ct-label"
              htmlFor="settings-audio-output"
              style={{
                display: "block",
                marginBottom: "6px",
                fontSize: "12px",
                color: "rgba(255,255,255,0.45)",
              }}
            >
              Ses çıkış cihazı
            </label>
            <Select
              id="settings-audio-output"
              value={draftAudioPreferences.selectedAudioOutputDeviceId ?? ""}
              onChange={(value) => {
                const nextValue = value.trim();
                setDraftAudioPreferences((previous) => ({
                  ...previous,
                  selectedAudioOutputDeviceId:
                    nextValue.length > 0 ? nextValue : null,
                }));
              }}
              options={outputOptions}
              style={{ width: "100%", height: "40px" }}
            />
          </div>
        </div>

        <div className="ct-settings-volume-grid">
          <div className="ct-settings-volume-card">
            <div className="ct-settings-volume-header">
              <label
                className="ct-settings-volume-label"
                htmlFor="settings-audio-master-volume"
              >
                Ses Seviyesi
              </label>
              <span
                className={`ct-settings-volume-value${draftAudioPreferences.masterVolume > 100 ? " boost" : ""}`}
              >
                {draftAudioPreferences.masterVolume}%
              </span>
            </div>
            <Slider
              id="settings-audio-master-volume"
              min={0}
              max={200}
              value={draftAudioPreferences.masterVolume}
              onChange={(value) => {
                const nextValue = Array.isArray(value) ? value[0] : value;
                setDraftAudioPreferences((previous) => ({
                  ...previous,
                  masterVolume: nextValue,
                }));
              }}
              tooltip={{ formatter: (value) => `${value ?? 0}%` }}
            />
          </div>

          <div className="ct-settings-volume-card">
            <div className="ct-settings-volume-header">
              <label
                className="ct-settings-volume-label"
                htmlFor="settings-audio-mic-volume"
              >
                Mikrofon Seviyesi
              </label>
              <span
                className={`ct-settings-volume-value${draftAudioPreferences.microphoneVolume > 100 ? " boost" : ""}`}
              >
                {draftAudioPreferences.microphoneVolume}%
              </span>
            </div>
            <Slider
              id="settings-audio-mic-volume"
              min={0}
              max={200}
              value={draftAudioPreferences.microphoneVolume}
              onChange={(value) => {
                const nextValue = Array.isArray(value) ? value[0] : value;
                setDraftAudioPreferences((previous) => ({
                  ...previous,
                  microphoneVolume: nextValue,
                }));
              }}
              tooltip={{ formatter: (value) => `${value ?? 0}%` }}
            />
          </div>
        </div>

        <div
          className="ct-settings-switch-list"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            background: "rgba(255,255,255,0.01)",
            border: "1px solid rgba(255,255,255,0.03)",
            borderRadius: "8px",
            padding: "16px",
            marginBottom: "24px",
          }}
        >
          <div
            className="ct-settings-switch-item"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div
              className="ct-settings-switch-item-content"
              style={{ display: "flex", flexDirection: "column", gap: "2px" }}
            >
              <strong
                style={{
                  fontSize: "13px",
                  color: "#ffffff",
                  fontWeight: "600",
                }}
              >
                Mikrofon varsayılan olarak açık olsun
              </strong>
              <span
                style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)" }}
              >
                Lobiye girişte mikrofon durumu bu ayara göre uygulanır.
              </span>
            </div>
            <Switch
              checked={draftAudioPreferences.defaultMicEnabled}
              onChange={(checked) =>
                setDraftAudioPreferences((previous) => ({
                  ...previous,
                  defaultMicEnabled: checked,
                }))
              }
            />
          </div>

          <div
            className="ct-settings-switch-item"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div
              className="ct-settings-switch-item-content"
              style={{ display: "flex", flexDirection: "column", gap: "2px" }}
            >
              <strong
                style={{
                  fontSize: "13px",
                  color: "#ffffff",
                  fontWeight: "600",
                }}
              >
                Kulaklık varsayılan olarak açık olsun
              </strong>
              <span
                style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)" }}
              >
                Lobiye girişte duyma durumu bu ayara göre uygulanır.
              </span>
            </div>
            <Switch
              checked={draftAudioPreferences.defaultHeadphoneEnabled}
              onChange={(checked) =>
                setDraftAudioPreferences((previous) => ({
                  ...previous,
                  defaultHeadphoneEnabled: checked,
                }))
              }
            />
          </div>

          <div
            className="ct-settings-switch-item"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div
              className="ct-settings-switch-item-content"
              style={{ display: "flex", flexDirection: "column", gap: "2px" }}
            >
              <strong
                style={{
                  fontSize: "13px",
                  color: "#ffffff",
                  fontWeight: "600",
                }}
              >
                Lobi bildirim sesleri açık olsun
              </strong>
              <span
                style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)" }}
              >
                Kullanıcı giriş-çıkışları ve hızlı medya değişimlerinde ses
                bildirimi çalar.
              </span>
            </div>
            <Switch
              checked={draftAudioPreferences.notificationSoundsEnabled}
              onChange={(checked) =>
                setDraftAudioPreferences((previous) => ({
                  ...previous,
                  notificationSoundsEnabled: checked,
                }))
              }
            />
          </div>

          <div
            className="ct-settings-switch-item"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div
              className="ct-settings-switch-item-content"
              style={{ display: "flex", flexDirection: "column", gap: "2px" }}
            >
              <strong
                style={{
                  fontSize: "13px",
                  color: "#ffffff",
                  fontWeight: "600",
                }}
              >
                Gelişmiş gürültü bastırma (RNNoise) kullan
              </strong>
              <span
                style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)" }}
              >
                Mikrofon açıkken arka plan seslerini azaltmak için RNNoise
                işleme katmanı kullanılır.
              </span>
            </div>
            <Switch
              checked={draftAudioPreferences.enhancedNoiseSuppressionEnabled}
              onChange={(checked) =>
                setDraftAudioPreferences((previous) => ({
                  ...previous,
                  enhancedNoiseSuppressionEnabled: checked,
                }))
              }
            />
          </div>

          {draftAudioPreferences.enhancedNoiseSuppressionEnabled && (
            <div
              style={{
                marginTop: "8px",
                borderTop: "1px solid rgba(255,255,255,0.05)",
                paddingTop: "12px",
              }}
            >
              <label
                className="ct-label"
                htmlFor="settings-audio-preset"
                style={{
                  display: "block",
                  marginBottom: "6px",
                  fontSize: "12px",
                  color: "rgba(255,255,255,0.45)",
                }}
              >
                RNNoise kalite profili
              </label>
              <Select
                id="settings-audio-preset"
                value={draftAudioPreferences.noiseSuppressionPreset}
                onChange={(value) => {
                  setDraftAudioPreferences((previous) => ({
                    ...previous,
                    noiseSuppressionPreset:
                      value as AudioPreferences["noiseSuppressionPreset"],
                  }));
                }}
                options={NOISE_SUPPRESSION_PRESET_OPTIONS.map((preset) => ({
                  value: preset.id,
                  label: `${preset.label} - ${preset.description}`,
                }))}
                style={{ width: "100%", height: "40px" }}
              />
            </div>
          )}
        </div>

        <div
          className="ct-settings-actions"
          style={{ display: "flex", gap: "12px", marginBottom: "24px" }}
        >
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSaveAudioPreferences}
            style={{
              background: "#ffffff",
              borderColor: "#ffffff",
              color: "#000000",
              fontWeight: "600",
              height: "40px",
              borderRadius: "6px",
            }}
          >
            Ses Ayarlarını Kaydet
          </Button>

          <Button
            type="text"
            icon={audioTestStream ? <EyeInvisibleOutlined /> : <EyeOutlined />}
            onClick={() => {
              if (audioTestStream) {
                void stopAudioTest().then(() => {
                  messageApi.info("Mikrofon testi durduruldu.");
                });
                return;
              }

              void handleStartAudioTest();
            }}
            loading={isStartingAudioTest}
            disabled={isStartingAudioTest}
            style={{
              background: isStartingAudioTest
                ? "rgba(255, 255, 255, 0.02)"
                : audioTestStream
                  ? "rgba(239, 68, 68, 0.08)"
                  : "rgba(255, 255, 255, 0.05)",
              color: isStartingAudioTest
                ? "rgba(255, 255, 255, 0.25)"
                : audioTestStream
                  ? "#ef4444"
                  : "#ffffff",
              height: "40px",
              borderRadius: "6px",
            }}
          >
            {audioTestStream
              ? "Mikrofon Testini Durdur"
              : "Mikrofon Testini Başlat"}
          </Button>

          <Button
            type="text"
            icon={<PlayCircleOutlined />}
            onClick={handlePlayTestTone}
            style={{
              background: "rgba(255, 255, 255, 0.05)",
              color: "#ffffff",
              height: "40px",
              borderRadius: "6px",
            }}
          >
            Test Sesi Çal
          </Button>
        </div>

        <div
          className="ct-settings-audio-meter-wrap"
          style={{
            background: "rgba(255,255,255,0.01)",
            border: "1px solid rgba(255,255,255,0.03)",
            borderRadius: "8px",
            padding: "16px",
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <span
            style={{
              fontSize: "12px",
              fontWeight: "600",
              color: "rgba(255,255,255,0.45)",
            }}
          >
            Mikrofon Seviyesi
          </span>
          <div style={{ flex: 1 }}>
            <Progress
              percent={micLevelPercent}
              showInfo={false}
              strokeColor="#ffffff"
              trailColor="rgba(255,255,255,0.08)"
              style={{ margin: 0 }}
            />
          </div>
          <strong
            style={{
              fontSize: "12px",
              color: "#ffffff",
              minWidth: "32px",
              textAlign: "right",
            }}
          >
            %{micLevelPercent}
          </strong>
        </div>
      </div>
    </div>
  );
}
