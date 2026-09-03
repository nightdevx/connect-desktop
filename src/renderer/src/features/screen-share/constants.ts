import {
  estimateLadderBitrateBps,
  SCREEN_SHARE_MAX_ENCODINGS,
} from "@shared/video-layers";
import {
  SCREEN_SHARE_RESOLUTION_DIMENSIONS,
  type ScreenShareQualityOption,
  type ScreenShareQualityPreset,
  type ScreenShareFrameRate,
} from "./types";

// Bitrates target a self-hosted SFU on a VDS, so they are set for quality
// rather than for the lowest common denominator. The publisher still sheds
// bitrate on its own when congestion control says so — these are ceilings.
export const SCREEN_SHARE_QUALITY_OPTIONS: ScreenShareQualityOption[] = [
  {
    id: "smooth",
    label: "Akıcı",
    description: "720p • 60 FPS",
    frameRate: 60,
    resolution: "720p",
    maxBitrateBps: 2_500_000,
  },
  {
    id: "balanced",
    label: "Dengeli",
    description: "1080p • 30 FPS",
    frameRate: 30,
    resolution: "1080p",
    maxBitrateBps: 3_000_000,
  },
  {
    id: "high",
    label: "Yüksek",
    description: "1080p • 60 FPS",
    frameRate: 60,
    resolution: "1080p",
    maxBitrateBps: 5_000_000,
  },
  {
    id: "sharp",
    label: "Net",
    description: "1440p • 60 FPS",
    frameRate: 60,
    resolution: "1440p",
    maxBitrateBps: 9_000_000,
  },
  {
    id: "ultra",
    label: "Ultra",
    description: "2160p • 30 FPS",
    frameRate: 30,
    resolution: "2160p",
    maxBitrateBps: 14_000_000,
  },
];

export const getScreenShareQualityOption = (
  preset: ScreenShareQualityPreset,
): ScreenShareQualityOption => {
  return (
    SCREEN_SHARE_QUALITY_OPTIONS.find((option) => option.id === preset) ??
    SCREEN_SHARE_QUALITY_OPTIONS[1]
  );
};

export const getLowerScreenShareQuality = (
  preset: ScreenShareQualityPreset,
): ScreenShareQualityPreset | null => {
  const index = SCREEN_SHARE_QUALITY_OPTIONS.findIndex(
    (option) => option.id === preset,
  );
  if (index <= 0) {
    return null;
  }
  return SCREEN_SHARE_QUALITY_OPTIONS[index - 1].id;
};

export const getScreenShareQualityDimensions = (
  preset: ScreenShareQualityPreset,
): { width: number; height: number } => {
  return SCREEN_SHARE_RESOLUTION_DIMENSIONS[
    getScreenShareQualityOption(preset).resolution
  ];
};

/**
 * What a preset really costs on the uplink: the whole simulcast ladder, not the
 * headline bitrate. The picker used to advertise "1080p • 60 FPS" and nothing
 * else, so a preset that could not possibly fit looked exactly like one that
 * could — the user found out by watching the stream fall apart.
 */
export const estimateScreenShareUplinkBps = (
  option: ScreenShareQualityOption,
): number => {
  const dimensions = SCREEN_SHARE_RESOLUTION_DIMENSIONS[option.resolution];
  return estimateLadderBitrateBps(
    {
      width: dimensions.width,
      height: dimensions.height,
      maxBitrateBps: option.maxBitrateBps,
      maxFramerate: option.frameRate,
    },
    SCREEN_SHARE_MAX_ENCODINGS,
    true,
  );
};

export const getDefaultScreenShareQuality = (
  frameRate: ScreenShareFrameRate,
): ScreenShareQualityPreset => {
  // 1080p60 rather than 1440p60: the safer default for an unknown uplink, and
  // the user can step up to "Net"/"Ultra" from the share dialog.
  if (frameRate === 60) {
    return "high";
  }

  return "balanced";
};
