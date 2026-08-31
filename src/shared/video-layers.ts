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

// Above this width a third encoding costs more than it is worth for a CAMERA.
// Every simulcast layer is a separate encoder instance, and hardware H.264
// encoders have a hard concurrent-session limit (consumer NVENC historically
// 2-3, shared with whatever else is recording). A camera's half layer is already
// small, so the quarter layer buys very little for a whole extra encode.
//
// A large screen share is the opposite case, which is why this no longer applies
// to it: at 1440p the half layer is 1280x720 and at 2160p it is 1920x1080, so a
// viewer whose tile is 400px wide — the grid, the rail, the new picture-in-
// picture window — has nothing in the ladder to ask for and gets a layer many
// times its own size or a stalled one. See SCREEN_SHARE_QUARTER_LAYER_MIN_WIDTH.
const MAX_LADDER_WIDTH_FOR_THREE_ENCODINGS = 2560;

// Below this width a screen share stays on two encodings: the half layer is
// already tile-sized and a third encode would be spent on nothing. At or above
// it the quarter layer is what a small tile actually subscribes to (960x540 of
// a 4K share, 640x360 of a 1440p one), and dynacast pauses it whenever nobody
// is watching at that size — so the extra encoder only runs when it is wanted.
const SCREEN_SHARE_QUARTER_LAYER_MIN_WIDTH = 2560;

/**
 * Encoding budget for a screen share.
 *
 * Uplink is spent on the SUM of the ladder, not on the top layer: a 1080p60
 * share asks for 5 Mbps at the top and roughly 1.8 more for the half layer.
 * Screen video is also the one source where a bottom layer can be useless — a
 * 480x270 desktop is unreadable, so nobody watching would rather have it than a
 * paused stream.
 *
 * The budget is three, but SCREEN_SHARE_QUARTER_LAYER_MIN_WIDTH is what decides
 * whether the third rung is ever built: below 1440p a screen share gets two
 * encodings and the quarter layer is skipped as unreadable, at 1440p and above
 * it is built because the half rung is still 720p or 1080p and no grid tile can
 * use one. Dynacast pauses it whenever nobody is watching at that size, so the
 * third encoder only runs when somebody actually asked for it.
 *
 * Camera keeps three for a different reason: those frames are small, and a
 * 320x180 face in a grid tile is perfectly usable.
 */
export const SCREEN_SHARE_MAX_ENCODINGS = 3;
export const CAMERA_MAX_ENCODINGS = 3;

// What the camera drops to while a screen share is live. Three camera layers
// plus three screen layers is six concurrent encoder sessions, which is past
// what consumer hardware encoders will take — they fall back to software and
// both streams suffer. The face in a grid tile is the cheaper thing to trim.
export const CAMERA_MAX_ENCODINGS_WHILE_SHARING = 2;

/**
 * Extra simulcast layers below the primary encoding, ordered low quality first
 * (the order LiveKit expects). Returns an empty array when the target is
 * already small enough that extra layers are just wasted encoder passes.
 *
 * `maxEncodings` counts the primary encoding too, so 2 means "one extra layer".
 */
export const buildSimulcastLayerSpecs = (
  target: VideoLayerSpec,
  maxEncodings: number = CAMERA_MAX_ENCODINGS,
  isScreenShare = false,
): VideoLayerSpec[] => {
  const layers: VideoLayerSpec[] = [];
  const extraLayerBudget = Math.max(0, maxEncodings - 1);

  // A big screen share earns its quarter layer precisely where a camera does
  // not: the ladder's half rung is still 720p or 1080p, which no grid tile can
  // use.
  const allowQuarterLayer = isScreenShare
    ? target.width >= SCREEN_SHARE_QUARTER_LAYER_MIN_WIDTH
    : target.width < MAX_LADDER_WIDTH_FOR_THREE_ENCODINGS;

  // Quarter scale first (lowest quality), then half.
  if (
    extraLayerBudget >= 2 &&
    target.width / 4 >= MIN_LAYER_WIDTH &&
    allowQuarterLayer
  ) {
    layers.push(scaleLayer(target, 1 / 4, 15));
  }
  if (extraLayerBudget >= 1 && target.width / 2 >= MIN_LAYER_WIDTH) {
    layers.push(scaleLayer(target, 1 / 2, 30));
  }

  return layers;
};

/**
 * What the whole ladder asks of the uplink, primary encoding included.
 *
 * The quality picker used to show only the primary bitrate ("1080p / 5 Mbps"),
 * which is not the number that has to fit: simulcast sends every active layer.
 * Comparing this against `availableOutgoingBitrate` is the only way to tell a
 * user their preset does not fit before they publish it and watch it stutter.
 */
export const estimateLadderBitrateBps = (
  target: VideoLayerSpec,
  maxEncodings: number = CAMERA_MAX_ENCODINGS,
  isScreenShare = false,
): number => {
  return buildSimulcastLayerSpecs(target, maxEncodings, isScreenShare).reduce(
    (total, layer) => total + layer.maxBitrateBps,
    target.maxBitrateBps,
  );
};

/**
 * Compares what the encoder is really doing against what was asked for.
 *
 * The layer arithmetic below has had a self-check all along, but nothing
 * verified that LiveKit *consumed* it — which is exactly the gap a publish bug
 * lived in: a screen share sent with `videoEncoding` had it silently replaced
 * by the library's `screenShareEncoding` default (1080p at 15fps / 2.5 Mbps),
 * and every preset published at 15fps no matter what the user picked. Sender
 * parameters are the one place where the option merge, SDP negotiation and the
 * browser have all had their say.
 *
 * Returns a human-readable complaint, or null when the publish landed.
 */
export const describeEncodingMismatch = (
  target: VideoLayerSpec,
  encodings: {
    maxBitrate?: number;
    maxFramerate?: number;
  }[],
): string | null => {
  if (encodings.length === 0) {
    return "encoder reported no encodings";
  }

  // The primary encoding is the last one: presets are ordered lowest first.
  const primary = encodings[encodings.length - 1];
  const problems: string[] = [];

  if (
    typeof primary.maxFramerate === "number" &&
    primary.maxFramerate < target.maxFramerate
  ) {
    problems.push(
      `maxFramerate ${primary.maxFramerate} < requested ${target.maxFramerate}`,
    );
  }

  // A tolerance rather than equality: LiveKit trims the bitrate of SVC codecs
  // (0.85 for VP9, 0.7 for AV1) on purpose, and that is not a fault.
  if (
    typeof primary.maxBitrate === "number" &&
    primary.maxBitrate < target.maxBitrateBps * 0.6
  ) {
    problems.push(
      `maxBitrate ${primary.maxBitrate} << requested ${target.maxBitrateBps}`,
    );
  }

  return problems.length > 0 ? problems.join(", ") : null;
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
