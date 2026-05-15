import type {
  AudioPreferences,
  CameraPreferences,
  StreamPreferences,
} from "./components/settings/settings-main-panel-types";

import {
  type ScreenShareSourceKind,
  type ScreenShareQualityPreset,
  type ScreenShareQualityOption,
  SCREEN_SHARE_QUALITY_OPTIONS,
  getDefaultScreenShareQuality as getBaseDefaultScreenShareQuality,
} from "../screen-share";

export type {
  ScreenShareSourceKind,
  ScreenShareQualityPreset,
  ScreenShareQualityOption,
};

const CAMERA_SETTINGS_STORAGE_KEY = "ct.settings.camera";
const AUDIO_SETTINGS_STORAGE_KEY = "ct.settings.audio";
const STREAM_SETTINGS_STORAGE_KEY = "ct.settings.stream";

import {
  type NoiseSuppressionPreset,
  NOISE_SUPPRESSION_PRESET_OPTIONS,
  DEFAULT_NOISE_SUPPRESSION_PRESET,
  normalizeNoiseSuppressionPreset,
} from "../rnnoise";

export { SCREEN_SHARE_QUALITY_OPTIONS };
export { NOISE_SUPPRESSION_PRESET_OPTIONS, DEFAULT_NOISE_SUPPRESSION_PRESET };
export type { NoiseSuppressionPreset };

export const getDefaultScreenShareQuality = (
  frameRate: StreamPreferences["frameRate"],
): ScreenShareQualityPreset => {
  return getBaseDefaultScreenShareQuality(frameRate as any);
};

export const buildCameraVideoConstraints = (
  preferences: CameraPreferences,
): MediaTrackConstraints => {
  return {
    width: preferences.resolution === "1080p" ? 1920 : 1280,
    height: preferences.resolution === "1080p" ? 1080 : 720,
    frameRate: preferences.frameRate,
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
  masterVolume: number;
  microphoneVolume: number;
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
        masterVolume: 100,
        microphoneVolume: 100,
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
      masterVolume?: number;
      microphoneVolume?: number;
    };

    const normalizeVolume = (value: unknown): number => {
      const num = typeof value === "number" ? value : 100;
      return Math.max(0, Math.min(200, num));
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
      masterVolume: normalizeVolume(parsed.masterVolume),
      microphoneVolume: normalizeVolume(parsed.microphoneVolume),
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
      masterVolume: 100,
      microphoneVolume: 100,
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
