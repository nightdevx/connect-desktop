// Simulcast layer derivation. Pure arithmetic, no livekit-client import, so it
// can be checked with plain node — see scripts/check-video-layers.cjs.
//
// The publish layers used to be a hard-coded 720p/360p pair while the actual
// publish could be 1080p or 1440p, so the layers described a stream nobody was
// sending. They are derived from the real target here instead.

export interface VideoLayerSpec {
  width: number;
  height: number;
  maxBitrateBps: number;
  maxFramerate: number;
}

// Bitrate does not scale linearly with pixel count — halving each dimension
// needs roughly a third of the bitrate, not a quarter. 0.75 is the exponent
// that reproduces LiveKit's own preset ladder (1080p 3M -> 720p 1.7M -> 360p 500k).
const BITRATE_PIXEL_EXPONENT = 0.75;

// Below this width an extra encoder costs more CPU than the layer is worth.
const MIN_LAYER_WIDTH = 320;

// Encoders reject odd dimensions.
const toEven = (value: number): number => {
  return Math.max(2, Math.round(value / 2) * 2);
};

const scaleLayer = (
  target: VideoLayerSpec,
  scale: number,
  maxFramerate: number,
): VideoLayerSpec => {
  const pixelRatio = scale * scale;
  return {
    width: toEven(target.width * scale),
    height: toEven(target.height * scale),
    maxBitrateBps: Math.max(
      80_000,
      Math.round(target.maxBitrateBps * pixelRatio ** BITRATE_PIXEL_EXPONENT),
    ),
    maxFramerate: Math.min(target.maxFramerate, maxFramerate),
  };
};

// Above this width a third encoding costs more than it is worth. Every
// simulcast layer is a separate encoder instance, and hardware H.264 encoders
// have a hard concurrent-session limit (consumer NVENC historically 2-3, shared
// with whatever else is recording). At 1440p and up the half layer is already
// 1280x720 or better, which serves a weak subscriber perfectly well, so the
// quarter layer buys very little for a whole extra encode of a huge frame.
const MAX_LADDER_WIDTH_FOR_THREE_ENCODINGS = 2560;

/**
 * Extra simulcast layers below the primary encoding, ordered low quality first
 * (the order LiveKit expects). Returns an empty array when the target is
 * already small enough that extra layers are just wasted encoder passes.
 */
export const buildSimulcastLayerSpecs = (
  target: VideoLayerSpec,
): VideoLayerSpec[] => {
  const layers: VideoLayerSpec[] = [];

  // Quarter scale first (lowest quality), then half.
  if (
    target.width / 4 >= MIN_LAYER_WIDTH &&
    target.width < MAX_LADDER_WIDTH_FOR_THREE_ENCODINGS
  ) {
    layers.push(scaleLayer(target, 1 / 4, 15));
  }
  if (target.width / 2 >= MIN_LAYER_WIDTH) {
    layers.push(scaleLayer(target, 1 / 2, 30));
  }

  return layers;
};

/**
 * Rescales a preset's bitrate ceiling to the resolution actually being captured.
 *
 * The quality presets pair a resolution with a bitrate ("2160p / 14 Mbps"), but
 * the capture constraints are ceilings: sharing a 1080p monitor — or a small
 * window — under the 2160p preset produces a 1920x1080 track that was still
 * being published with the 2160p bitrate. That is four times more than the
 * frame needs. The encoder spends it, send-side BWE probes up to find it, and
 * on any uplink that cannot actually carry it the result is loss and the
 * stuttering this is meant to prevent. A 800x600 window under the same preset
 * was being handed 14 Mbps.
 *
 * Same exponent as the layer ladder, so a downscaled publish lands on the same
 * curve as the layer it would have been.
 */
export const scaleBitrateToResolution = (params: {
  presetBitrateBps: number;
  presetWidth: number;
  presetHeight: number;
  actualWidth: number;
  actualHeight: number;
}): number => {
  const { presetBitrateBps, presetWidth, presetHeight, actualWidth, actualHeight } =
    params;

  const presetPixels = presetWidth * presetHeight;
  const actualPixels = actualWidth * actualHeight;

  if (presetPixels <= 0 || actualPixels <= 0 || actualPixels >= presetPixels) {
    // Never scale UP: the preset is the ceiling the user chose, and a capture
    // larger than the preset is not something the constraints allow anyway.
    return presetBitrateBps;
  }

  return Math.max(
    80_000,
    Math.round(
      presetBitrateBps * (actualPixels / presetPixels) ** BITRATE_PIXEL_EXPONENT,
    ),
  );
};
