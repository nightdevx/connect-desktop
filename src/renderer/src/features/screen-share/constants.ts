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
  // The floor, and the only rung that is cheaper than "Dengeli" on BOTH axes.
  // Without it a CPU-limited 1080p30 share had nowhere to go: the next preset
  // down the list runs at 60 FPS, so "step down" doubled the framerate. The
  // field logs caught exactly that — 1080p30 → 720p60 under a CPU limit bought
  // 0.9 FPS (27.0 → 27.9) in exchange for half the resolution.
  {
    id: "light",
    label: "Hafif",
    description: "720p • 30 FPS",
    frameRate: 30,
    resolution: "720p",
    maxBitrateBps: 1_500_000,
  },
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

export const DEFAULT_SCREEN_SHARE_QUALITY: ScreenShareQualityPreset = "balanced";

export const getScreenShareQualityOption = (
  preset: ScreenShareQualityPreset,
): ScreenShareQualityOption => {
  return (
    SCREEN_SHARE_QUALITY_OPTIONS.find((option) => option.id === preset) ??
    // By id, not by index: the list gained a rung at the bottom and a positional
    // fallback silently became "Akıcı".
    SCREEN_SHARE_QUALITY_OPTIONS.find(
      (option) => option.id === DEFAULT_SCREEN_SHARE_QUALITY,
    ) ??
    SCREEN_SHARE_QUALITY_OPTIONS[0]
  );
};

/** Pixels per second the encoder has to chew through — the CPU cost proxy. */
const pixelRate = (option: ScreenShareQualityOption): number => {
  const dimensions = SCREEN_SHARE_RESOLUTION_DIMENSIONS[option.resolution];
  return dimensions.width * dimensions.height * option.frameRate;
};

/**
 * The next preset down that is genuinely cheaper for the reason we are stepping.
 *
 * Not simply `index - 1`. The list is ordered for the menu, and the menu order
 * is not monotonic in cost: "Akıcı" (720p60) sits below "Dengeli" (1080p30) but
 * runs at twice the framerate, so plain index arithmetic answered a CPU
 * overload by asking the encoder for more frames per second. That is what
 * happened in production, and it bought nothing.
 *
 * A CPU step therefore refuses to raise the framerate at all, on top of
 * requiring a lower pixel rate. A bandwidth step only has to lower the bitrate
 * ceiling, which is what the uplink actually cares about.
 *
 * Null means the floor: the caller tells the user quality cannot drop further
 * rather than performing a swap that costs resolution and returns nothing.
 */
export const getLowerScreenShareQuality = (
  preset: ScreenShareQualityPreset,
  reason: "cpu" | "bandwidth" = "cpu",
): ScreenShareQualityPreset | null => {
  const index = SCREEN_SHARE_QUALITY_OPTIONS.findIndex(
    (option) => option.id === preset,
  );
  if (index <= 0) {
    return null;
  }

  const current = SCREEN_SHARE_QUALITY_OPTIONS[index];

  for (let candidate = index - 1; candidate >= 0; candidate -= 1) {
    const option = SCREEN_SHARE_QUALITY_OPTIONS[candidate];

    if (reason === "bandwidth") {
      if (option.maxBitrateBps < current.maxBitrateBps) {
        return option.id;
      }
      continue;
    }

    if (
      option.frameRate <= current.frameRate &&
      pixelRate(option) < pixelRate(current)
    ) {
      return option.id;
    }
  }

  return null;
};

/**
 * One rung back up, capped at what the user actually asked for.
 *
 * The ladder used to be one-way: an overload that lasted four stats ticks cost
 * the share its quality for the rest of the session, even when the cause was a
 * thirty-second background job. Logs showed shares finishing three hours at
 * 720p because of two step-downs half an hour in.
 */
export const getHigherScreenShareQuality = (
  preset: ScreenShareQualityPreset,
  ceiling: ScreenShareQualityPreset,
): ScreenShareQualityPreset | null => {
  const index = SCREEN_SHARE_QUALITY_OPTIONS.findIndex(
    (option) => option.id === preset,
  );
  const ceilingIndex = SCREEN_SHARE_QUALITY_OPTIONS.findIndex(
    (option) => option.id === ceiling,
  );
  if (index < 0 || ceilingIndex < 0 || index >= ceilingIndex) {
    return null;
  }
  return SCREEN_SHARE_QUALITY_OPTIONS[index + 1].id;
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
