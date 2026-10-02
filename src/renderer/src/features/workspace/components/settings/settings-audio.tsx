import { useEffect, useRef, useState } from "react";
import { Select, Switch, Button, Slider } from "antd";
import {
  AudioMutedOutlined,
  AudioOutlined,
  ControlOutlined,
  CustomerServiceOutlined,
  FilterOutlined,
  KeyOutlined,
  NotificationOutlined,
  PlayCircleOutlined,
  SoundOutlined,
  StopOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import type { AudioPreferences } from "./settings-main-panel-types";
import { NOISE_SUPPRESSION_PRESET_OPTIONS } from "../../workspace-media-utils";
import {
  HotkeyCaptureField,
  useDesktopAppPreferences,
} from "./settings-app-preferences";
import { toast } from "@/services/toast";
import { SettingsGroup, SettingsPage, SettingsRow } from "./settings-layout";

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
  const [audioTestStream, setAudioTestStream] = useState<MediaStream | null>(
    null,
  );
  const [isStartingAudioTest, setIsStartingAudioTest] = useState(false);
  const [micLevelPercent, setMicLevelPercent] = useState(0);
  // Push-to-talk and the mute/deafen accelerators are stored with the desktop
  // app preferences, not with AudioPreferences, but they are microphone
  // controls and this is where people look for them.
  const {
    preferences: appPreferences,
    isSaving: isSavingAppPreference,
    savePreference,
  } = useDesktopAppPreferences();

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
    // Captured now, not inside the cleanup: React detaches refs around unmount,
    // so reading audioPreviewRef.current from in there can find null and leave
    // the preview playing over the rest of the app. The <audio> element is
    // rendered unconditionally, so this is the same node for the whole lifetime.
    const previewElement = audioPreviewRef.current;

    return () => {
      stopMediaStreamTracks(audioTestStreamRef.current);

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

  // The draft follows the preferences it was seeded from.
  //
  // Without this it was seeded once, on mount, and every control on the page
  // then wrote that whole stale copy back. Picking an output device from the
  // lobby tile and then touching any switch here put the old device back,
  // silently, with the page still showing the new one.
  useEffect(() => {
    setDraftAudioPreferences(audioPreferences);
  }, [audioPreferences]);

  const handlePreferenceChange = (
    key: keyof AudioPreferences,
    value: unknown,
  ): void => {
    // Built from the draft here rather than inside a state updater. An updater
    // runs during React's render pass, and calling the parent's setter from
    // inside one is an update to another component mid-render — which React
    // warns about and is free to run twice. Everything this needs is already
    // in hand at the moment of the click.
    const nextPrefs: AudioPreferences = {
      ...draftAudioPreferences,
      [key]: value,
    };

    setDraftAudioPreferences(nextPrefs);
    onSaveAudioPreferences(nextPrefs);
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
        channelCount: 1,
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
        toast.info(
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
        toast.warning(
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
              toast.warning(
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

      toast.success(
        `Mikrofon testi başlatıldı.${usedDeviceLabel ? ` Aktif mikrofon: ${usedDeviceLabel}.` : ""} Konuşurken seviye çubuğunu kontrol et.`,
      );
    } catch (error) {
      toast.error(
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

      const sinkTarget = audioContext as AudioContext & {
        setSinkId?: (sinkId: string) => Promise<void>;
      };
      if (typeof sinkTarget.setSinkId === "function") {
        await sinkTarget
          .setSinkId(draftAudioPreferences.selectedAudioOutputDeviceId ?? "")
          .catch(() => {
            toast.warning(
              "Seçili çıkış cihazı kullanılamadı, test sesi varsayılan cihazdan çalınıyor.",
            );
          });
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

      toast.success("Test sesi çalındı.");
    } catch (error) {
      toast.error(
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
    <SettingsPage
      title="Ses"
      description="Hangi cihazla konuşup duyduğun, seslerin seviyesi, sesin nasıl temizlendiği ve mikrofon kısayolların."
    >
      <SettingsGroup
        title="Cihazlar"
        description="Varsayılan, Windows'ta seçili olan cihazdır."
      >
        <SettingsRow
          icon={<AudioOutlined />}
          title="Mikrofon"
          description="Konuşurken sesini alan cihaz."
          htmlFor="settings-audio-input"
        >
          <Select
            id="settings-audio-input"
            value={draftAudioPreferences.selectedAudioInputDeviceId ?? ""}
            onChange={(value) => {
              const nextValue = value.trim();
              handlePreferenceChange(
                "selectedAudioInputDeviceId",
                nextValue.length > 0 ? nextValue : null,
              );
            }}
            options={inputOptions}
            className="ct-settings-row-select wide"
          />
        </SettingsRow>

        <SettingsRow
          icon={<CustomerServiceOutlined />}
          title="Hoparlör veya kulaklık"
          description="Odadaki sesleri duyduğun cihaz."
          htmlFor="settings-audio-output"
        >
          <Select
            id="settings-audio-output"
            value={draftAudioPreferences.selectedAudioOutputDeviceId ?? ""}
            onChange={(value) => {
              const nextValue = value.trim();
              handlePreferenceChange(
                "selectedAudioOutputDeviceId",
                nextValue.length > 0 ? nextValue : null,
              );
            }}
            options={outputOptions}
            className="ct-settings-row-select wide"
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Seviyeler"
        description="%100'ün üstü sesi yükseltir; çok açılırsa cızırdayabilir."
      >
        <SettingsRow
          icon={<SoundOutlined />}
          title="Çıkış seviyesi"
          description="Duyduğun her şeyin ortak seviyesi."
          htmlFor="settings-audio-master-volume"
        >
          <LevelControl
            id="settings-audio-master-volume"
            value={draftAudioPreferences.masterVolume}
            onChange={(next) => handlePreferenceChange("masterVolume", next)}
          />
        </SettingsRow>

        <SettingsRow
          icon={<AudioOutlined />}
          title="Mikrofon seviyesi"
          description="Diğerlerine giden sesinin gücü."
          htmlFor="settings-audio-mic-volume"
        >
          <LevelControl
            id="settings-audio-mic-volume"
            value={draftAudioPreferences.microphoneVolume}
            onChange={(next) => handlePreferenceChange("microphoneVolume", next)}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Mikrofon testi"
        description="Testi başlatıp konuş: sesini seçili çıkıştan duyarsın, çubuk ne kadar yüksek geldiğini gösterir."
        action={
          <>
            <Button icon={<PlayCircleOutlined />} onClick={handlePlayTestTone}>
              Test sesi
            </Button>
            <Button
              type={audioTestStream ? "default" : "primary"}
              icon={audioTestStream ? <StopOutlined /> : <AudioOutlined />}
              onClick={() => {
                if (audioTestStream) {
                  void stopAudioTest().then(() => {
                    toast.info("Mikrofon testi durduruldu.");
                  });
                  return;
                }

                void handleStartAudioTest();
              }}
              loading={isStartingAudioTest}
              disabled={isStartingAudioTest}
              danger={Boolean(audioTestStream)}
            >
              {audioTestStream ? "Durdur" : "Testi başlat"}
            </Button>
          </>
        }
      >
        {/* The sink the test stream plays back through, so it lives with the
            test rather than at the top of the panel. */}
        <audio ref={audioPreviewRef} hidden playsInline />

        <div className="ct-settings-block">
          <div
            className={`ct-mic-meter${audioTestStream ? " live" : ""}`}
            role="meter"
            aria-label="Mikrofon seviyesi"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={micLevelPercent}
          >
            <span style={{ clipPath: `inset(0 ${100 - micLevelPercent}% 0 0)` }} />
          </div>
        </div>
      </SettingsGroup>

      <SettingsGroup
        title="Ses işleme"
        description="Mikrofonundan giden ve sana gelen sesin nasıl temizleneceği."
      >
        {/* Kulaklık kullanan biri için yankı iptali saf kayıptır: geri
            besleyecek hoparlör yokken bile Chromium'un AEC'si sesi işler,
            spektral olarak zayıflatır ve konuşmayı inceltir. Hoparlör
            kullananlarda ise kapatmak odayı yankıya boğar, o yüzden
            varsayılan açık kalıyor ve bu bilinçli bir tercih. */}
        <SettingsRow
          icon={<SwapOutlined />}
          title="Yankı iptali (AEC)"
          description="Hoparlörden çıkan sesin mikrofona geri dönmesini engeller. Kulaklık kullanıyorsan kapatmak sesini daha doğal ve dolgun yapar."
        >
          <Switch
            checked={draftAudioPreferences.echoCancellationEnabled}
            onChange={(checked) =>
              handlePreferenceChange("echoCancellationEnabled", checked)
            }
          />
        </SettingsRow>

        <SettingsRow
          icon={<FilterOutlined />}
          title="Gelişmiş gürültü bastırma (RNNoise)"
          description="Mikrofon açıkken klavye, fan ve ortam seslerini azaltır."
        >
          <Switch
            checked={draftAudioPreferences.enhancedNoiseSuppressionEnabled}
            onChange={(checked) =>
              handlePreferenceChange("enhancedNoiseSuppressionEnabled", checked)
            }
          />
        </SettingsRow>

        {/* The profile only exists while the switch above is on, so it hangs
            under that switch rather than standing as a setting of its own. */}
        {draftAudioPreferences.enhancedNoiseSuppressionEnabled && (
          <SettingsRow
            detail
            title="Kalite profili"
            description="Daha güçlü profiller daha çok gürültü keser, karşılığında biraz daha işlemci harcar."
          >
            <Select
              aria-label="RNNoise kalite profili"
              value={draftAudioPreferences.noiseSuppressionPreset}
              onChange={(value) => {
                handlePreferenceChange("noiseSuppressionPreset", value);
              }}
              options={NOISE_SUPPRESSION_PRESET_OPTIONS.map((preset) => ({
                value: preset.id,
                label: preset.label,
                title: preset.description,
              }))}
              className="ct-settings-row-select"
            />
          </SettingsRow>
        )}

        {/* Diğerlerinin sesine uygulanır, mikrofona değil. Kişi başı
            kompresörün 6 ms'lik ileriye bakışı her kelimeye eklenir;
            kapatan bu gecikmeden kurtulur, seviye farkı kalır. */}
        <SettingsRow
          icon={<ControlOutlined />}
          title="Ses seviyelerini dengele"
          description="Yüksek sesle konuşanları kısarak herkesi benzer seviyede duymanı sağlar. Kapatırsan sesler işlenmeden ve biraz daha erken gelir."
        >
          <Switch
            checked={draftAudioPreferences.voiceLevellingEnabled}
            onChange={(checked) =>
              handlePreferenceChange("voiceLevellingEnabled", checked)
            }
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Odaya girerken"
        description="Bir odaya katıldığında mikrofonun ve kulaklığın hangi durumda başlasın."
      >
        <SettingsRow
          icon={<AudioOutlined />}
          title="Mikrofon açık başlasın"
          description="Kapalıysa odaya sessiz girersin; istediğin an açabilirsin."
        >
          <Switch
            checked={draftAudioPreferences.defaultMicEnabled}
            onChange={(checked) =>
              handlePreferenceChange("defaultMicEnabled", checked)
            }
          />
        </SettingsRow>

        <SettingsRow
          icon={<CustomerServiceOutlined />}
          title="Kulaklık açık başlasın"
          description="Kapalıysa odadakileri duymadan girersin."
        >
          <Switch
            checked={draftAudioPreferences.defaultHeadphoneEnabled}
            onChange={(checked) =>
              handlePreferenceChange("defaultHeadphoneEnabled", checked)
            }
          />
        </SettingsRow>
      </SettingsGroup>

      {/* Its own group rather than a third row under "Odaya girerken": those
          two decide what YOUR microphone and headphones do on the way in, and
          this one decides what you hear about everybody else for the whole
          session. Filed together, people looked for it under Genel >
          Bildirimler, which is the OS toast. */}
      <SettingsGroup title="Bildirim sesleri">
        <SettingsRow
          icon={<NotificationOutlined />}
          title="Oda sesleri"
          description="Birisi odaya girdiğinde, çıktığında, kamerasını açtığında veya yayın başlattığında kısa bir ses çalar. Her olayın kendi sesi vardır."
        >
          <Switch
            checked={draftAudioPreferences.notificationSoundsEnabled}
            onChange={(checked) =>
              handlePreferenceChange("notificationSoundsEnabled", checked)
            }
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Kısayollar"
        description="Genel kısayollar uygulama arka plandayken de çalışır. Bir kısayolu silmek için alanına tıklayıp Backspace'e bas."
      >
        <SettingsRow
          icon={<KeyOutlined />}
          title="Bas-konuş"
          description="Mikrofon kapalı kalır, tuşu basılı tuttuğun sürece açılır. Yalnızca uygulama penceresi öndeyken çalışır."
        >
          <Switch
            checked={appPreferences.pushToTalk}
            onChange={(checked) => {
              void savePreference("pushToTalk", checked);
            }}
            disabled={isSavingAppPreference}
          />
        </SettingsRow>

        {appPreferences.pushToTalk && (
          <HotkeyCaptureField
            label="Bas-konuş tuşu"
            hint="Alana tıklayıp kullanmak istediğin tuşa bas."
            value={appPreferences.pushToTalkKey}
            mode="key"
            detail
            disabled={isSavingAppPreference}
            onChange={(next) => {
              void savePreference("pushToTalkKey", next);
            }}
          />
        )}

        <HotkeyCaptureField
          icon={<AudioMutedOutlined />}
          label="Mikrofonu aç/kapat"
          hint="Mikrofonunu her yerden susturur ya da açar."
          value={appPreferences.hotkeyToggleMute}
          mode="accelerator"
          disabled={isSavingAppPreference}
          onChange={(next) => {
            void savePreference("hotkeyToggleMute", next);
          }}
        />

        <HotkeyCaptureField
          icon={<CustomerServiceOutlined />}
          label="Sesi aç/kapat"
          hint="Kulaklığını her yerden kapatır ya da açar."
          value={appPreferences.hotkeyToggleDeafen}
          mode="accelerator"
          disabled={isSavingAppPreference}
          onChange={(next) => {
            void savePreference("hotkeyToggleDeafen", next);
          }}
        />
      </SettingsGroup>
    </SettingsPage>
  );
}

interface LevelControlProps {
  id: string;
  value: number;
  onChange: (value: number) => void;
}

/** A 0-200% slider and the number it is at; amber once it is boosting. */
function LevelControl({ id, value, onChange }: LevelControlProps) {
  return (
    <div className="ct-settings-level">
      <Slider
        id={id}
        min={0}
        max={200}
        value={value}
        onChange={onChange}
        tooltip={{ formatter: (next) => `%${next ?? 0}` }}
      />
      <span className={`ct-settings-level-value${value > 100 ? " boost" : ""}`}>
        %{value}
      </span>
    </div>
  );
}
