import { 
  type ScreenShareQualityOption, 
  type ScreenShareQualityPreset,
  type ScreenShareFrameRate
} from "./types";

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
  frameRate: ScreenShareFrameRate,
): ScreenShareQualityPreset => {
  if (frameRate === 60) {
    return "sharp";
  }

  return "balanced";
};
