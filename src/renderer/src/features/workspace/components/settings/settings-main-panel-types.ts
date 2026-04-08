export interface CameraPreferences {
  resolution: "720p" | "1080p";
  frameRate: 24 | 30;
}

export interface AudioPreferences {
  defaultMicEnabled: boolean;
  defaultHeadphoneEnabled: boolean;
  notificationSoundsEnabled: boolean;
}

export interface StreamPreferences {
  frameRate: 15 | 30 | 60;
  captureSystemAudio: boolean;
}
