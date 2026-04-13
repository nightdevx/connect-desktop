import type {
  AudioPreferences,
  CameraPreferences,
  NoiseSuppressionPreset,
  StreamPreferences,
} from "./components/settings/settings-main-panel-types";

export type ScreenShareSourceKind = "screen" | "window";

export type ScreenShareQualityPreset = "smooth" | "balanced" | "sharp";

export interface ScreenShareQualityOption {
  id: ScreenShareQualityPreset;
  label: string;
  description: string;
  frameRate: 15 | 30 | 60;
  resolution: "720p" | "1080p" | "1440p";
}

const CAMERA_SETTINGS_STORAGE_KEY = "ct.settings.camera";
const AUDIO_SETTINGS_STORAGE_KEY = "ct.settings.audio";
const STREAM_SETTINGS_STORAGE_KEY = "ct.settings.stream";

export interface NoiseSuppressionPresetOption {
  id: NoiseSuppressionPreset;
  label: string;
  description: string;
}

export const NOISE_SUPPRESSION_PRESET_OPTIONS: NoiseSuppressionPresetOption[] =
  [
    {
      id: "natural",
      label: "Doğal",
      description: "Sesi daha canlı tutar, hafif arka plan temizliği yapar.",
    },
    {
      id: "balanced",
      label: "Dengeli",
      description: "Konuşma netliği ve gürültü bastırma arasında denge kurar.",
    },
    {
      id: "aggressive",
      label: "Agresif",
      description: "Klavye, tıklama ve fan gibi sesleri daha sert bastırır.",
    },
  ];

export const DEFAULT_NOISE_SUPPRESSION_PRESET: NoiseSuppressionPreset =
  "balanced";

const normalizeNoiseSuppressionPreset = (
  value: unknown,
): NoiseSuppressionPreset => {
  if (value === "natural" || value === "aggressive") {
    return value;
  }

  return DEFAULT_NOISE_SUPPRESSION_PRESET;
};

export const SCREEN_SHARE_QUALITY_OPTIONS: ScreenShareQualityOption[] = [
  {
    id: "smooth",
    label: "Akıcı",
    description: "720p • 30 FPS",
    frameRate: 30,
    resolution: "720p",
  },
  {
    id: "balanced",
    label: "Dengeli",
    description: "1080p • 30 FPS",
    frameRate: 30,
    resolution: "1080p",
  },
  {
    id: "sharp",
    label: "Net",
    description: "1440p • 60 FPS",
    frameRate: 60,
    resolution: "1440p",
  },
];

export const getDefaultScreenShareQuality = (
  frameRate: StreamPreferences["frameRate"],
): ScreenShareQualityPreset => {
  if (frameRate === 60) {
    return "sharp";
  }

  return "balanced";
};

export const buildCameraVideoConstraints = (
  preferences: CameraPreferences,
): MediaTrackConstraints => {
  return {
    width: {
      ideal: preferences.resolution === "1080p" ? 1920 : 1280,
    },
    height: {
      ideal: preferences.resolution === "1080p" ? 1080 : 720,
    },
    frameRate: {
      ideal: preferences.frameRate,
      max: preferences.frameRate,
    },
  };
};

export const readCameraPreferences = (): CameraPreferences => {
  try {
    const raw = localStorage.getItem(CAMERA_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return { resolution: "720p", frameRate: 30 };
    }

    const parsed = JSON.parse(raw) as Partial<CameraPreferences>;
    return {
      resolution: parsed.resolution === "1080p" ? "1080p" : "720p",
      frameRate: parsed.frameRate === 24 ? 24 : 30,
    };
  } catch {
    return { resolution: "720p", frameRate: 30 };
  }
};

export const readAudioPreferences = (): {
  defaultMicEnabled: boolean;
  defaultHeadphoneEnabled: boolean;
  notificationSoundsEnabled: boolean;
  enhancedNoiseSuppressionEnabled: boolean;
  noiseSuppressionPreset: NoiseSuppressionPreset;
  selectedAudioInputDeviceId: string | null;
  selectedAudioOutputDeviceId: string | null;
} => {
  try {
    const raw = localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return {
        defaultMicEnabled: true,
        defaultHeadphoneEnabled: true,
        notificationSoundsEnabled: true,
        enhancedNoiseSuppressionEnabled: false,
        noiseSuppressionPreset: DEFAULT_NOISE_SUPPRESSION_PRESET,
        selectedAudioInputDeviceId: null,
        selectedAudioOutputDeviceId: null,
      };
    }

    const parsed = JSON.parse(raw) as {
      defaultMicEnabled?: boolean;
      defaultHeadphoneEnabled?: boolean;
      notificationSoundsEnabled?: boolean;
      enhancedNoiseSuppressionEnabled?: boolean;
      noiseSuppressionPreset?: NoiseSuppressionPreset;
      selectedAudioInputDeviceId?: string | null;
      selectedAudioOutputDeviceId?: string | null;
    };

    return {
      defaultMicEnabled: parsed.defaultMicEnabled !== false,
      defaultHeadphoneEnabled: parsed.defaultHeadphoneEnabled !== false,
      notificationSoundsEnabled: parsed.notificationSoundsEnabled !== false,
      enhancedNoiseSuppressionEnabled:
        parsed.enhancedNoiseSuppressionEnabled === true,
      noiseSuppressionPreset: normalizeNoiseSuppressionPreset(
        parsed.noiseSuppressionPreset,
      ),
      selectedAudioInputDeviceId:
        typeof parsed.selectedAudioInputDeviceId === "string" &&
        parsed.selectedAudioInputDeviceId.trim().length > 0
          ? parsed.selectedAudioInputDeviceId
          : null,
      selectedAudioOutputDeviceId:
        typeof parsed.selectedAudioOutputDeviceId === "string" &&
        parsed.selectedAudioOutputDeviceId.trim().length > 0
          ? parsed.selectedAudioOutputDeviceId
          : null,
    };
  } catch {
    return {
      defaultMicEnabled: true,
      defaultHeadphoneEnabled: true,
      notificationSoundsEnabled: true,
      enhancedNoiseSuppressionEnabled: false,
      noiseSuppressionPreset: DEFAULT_NOISE_SUPPRESSION_PRESET,
      selectedAudioInputDeviceId: null,
      selectedAudioOutputDeviceId: null,
    };
  }
};

export const readStreamPreferences = (): StreamPreferences => {
  try {
    const raw = localStorage.getItem(STREAM_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return {
        frameRate: 30,
        captureSystemAudio: false,
      };
    }

    const parsed = JSON.parse(raw) as Partial<StreamPreferences>;
    const parsedFrameRate =
      parsed.frameRate === 15 || parsed.frameRate === 60
        ? parsed.frameRate
        : 30;

    return {
      frameRate: parsedFrameRate,
      captureSystemAudio: Boolean(parsed.captureSystemAudio),
    };
  } catch {
    return {
      frameRate: 30,
      captureSystemAudio: false,
    };
  }
};

export const stopMediaStreamTracks = (stream: MediaStream | null): void => {
  if (!stream) {
    return;
  }

  stream.getTracks().forEach((track) => {
    track.onended = null;
    track.stop();
  });
};

export const saveCameraPreferences = (next: CameraPreferences): void => {
  localStorage.setItem(CAMERA_SETTINGS_STORAGE_KEY, JSON.stringify(next));
};

export const saveAudioPreferences = (next: AudioPreferences): void => {
  localStorage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(next));
};

export const saveStreamPreferences = (next: StreamPreferences): void => {
  localStorage.setItem(STREAM_SETTINGS_STORAGE_KEY, JSON.stringify(next));
};
