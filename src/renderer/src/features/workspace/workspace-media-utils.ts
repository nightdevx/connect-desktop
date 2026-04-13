import type {
  AudioPreferences,
  CameraPreferences,
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
        selectedAudioInputDeviceId: null,
        selectedAudioOutputDeviceId: null,
      };
    }

    const parsed = JSON.parse(raw) as {
      defaultMicEnabled?: boolean;
      defaultHeadphoneEnabled?: boolean;
      notificationSoundsEnabled?: boolean;
      enhancedNoiseSuppressionEnabled?: boolean;
      selectedAudioInputDeviceId?: string | null;
      selectedAudioOutputDeviceId?: string | null;
    };

    return {
      defaultMicEnabled: parsed.defaultMicEnabled !== false,
      defaultHeadphoneEnabled: parsed.defaultHeadphoneEnabled !== false,
      notificationSoundsEnabled: parsed.notificationSoundsEnabled !== false,
      enhancedNoiseSuppressionEnabled:
        parsed.enhancedNoiseSuppressionEnabled === true,
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
