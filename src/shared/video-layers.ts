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
  if (target.width / 4 >= MIN_LAYER_WIDTH) {
    layers.push(scaleLayer(target, 1 / 4, 15));
  }
  if (target.width / 2 >= MIN_LAYER_WIDTH) {
    layers.push(scaleLayer(target, 1 / 2, 30));
  }

  return layers;
};
