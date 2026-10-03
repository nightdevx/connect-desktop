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
const MAX_LADDER_WIDTH_FOR_THREE_ENCODINGS = 2560;

// --- the screen-share ladder ----------------------------------------------------
//
// The bottom rung of a screen share is 360 on its short side, at 15 fps. It is
// what grid tiles, the picture-in-picture window and a viewer with a weak
// downlink receive. 360 is not arbitrary: Chromium encodes anything shorter in
// software (ForceSoftwareForLowResolutions), so this is the smallest layer that
// stays on the hardware encoder. The rung it replaces was half the resolution at
// 30 fps: a quarter of a 1080p ladder's uplink, and 270 tall on an ultrawide
// monitor (640x270 of a 1280x540 share), which production showed going to
// OpenH264 next to a hardware top layer.
const SCREEN_SHARE_LOW_LAYER_SHORT_SIDE = 360;
const SCREEN_SHARE_LOW_LAYER_FRAMERATE = 15;
// LiveKit's own ScreenSharePresets.h360fps15, scaled by area for other aspects.
const SCREEN_SHARE_LOW_LAYER_BITRATE_BPS = 400_000;
const SCREEN_SHARE_LOW_LAYER_REFERENCE_PIXELS = 640 * 360;
// Below this short side the low rung saves too little to be worth an encoder.
const SCREEN_SHARE_LOW_LAYER_MIN_SOURCE_SHORT_SIDE = 540;

// The low rung's scale is one of these, never the exact short side / 360.
// With simulcast WebRTC crops the input to one alignment shared by every layer
// (for H.264 a multiple of 2, at most 16) and moves any scale it cannot hit
// exactly to the nearest one it can. 2.25, a 1920x810 capture's 810 / 360,
// became 7/3 that way, and the rung came out 342 tall: under 360, so software.
// Each of these is hit exactly beside the primary, and beside a half rung too.
const SCREEN_SHARE_LOW_LAYER_SCALES = [1, 1.5, 2, 3, 4, 6, 8];

/** The largest of those that keeps the low rung 360 or more on its short side. */
const screenShareLowScale = (target: VideoLayerSpec): number => {
  const exact =
    Math.min(target.width, target.height) / SCREEN_SHARE_LOW_LAYER_SHORT_SIDE;
  return (
    SCREEN_SHARE_LOW_LAYER_SCALES.filter((scale) => scale <= exact).pop() ?? 1
  );
};

// The middle rung's scale: half, unless the low rung is already that large.
// Then it steps in between the low rung and the primary, on a scale that is
// still hit exactly beside both (1.5 beside 2, 1.2 beside 1.5).
const screenShareMidScale = (lowScale: number): number =>
  lowScale > 2 ? 2 : lowScale > 1.5 ? 1.5 : 1.2;

// At or above this width the share also gets a half-resolution rung (1280x720
// of a 1440p share, 1920x1080 of a 4K one): a viewer on a 1080p stage between
// the 360p rung and a full layer it may not have the downlink for.
const SCREEN_SHARE_MID_LAYER_MIN_WIDTH = 2560;

/**
 * Encoding budget for a screen share: the low rung, the half rung only at
 * 2560 wide and above, and the primary. Uplink is spent on the SUM of the
 * ladder, so the cheap low rung is what lets the primary carry a higher
 * ceiling for about the same total. Dynacast pauses any rung nobody watches.
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

  if (isScreenShare) {
    if (
      extraLayerBudget >= 1 &&
      Math.min(target.width, target.height) >=
        SCREEN_SHARE_LOW_LAYER_MIN_SOURCE_SHORT_SIDE
    ) {
      layers.push(screenShareLowLayer(target));
      if (
        extraLayerBudget >= 2 &&
        target.width >= SCREEN_SHARE_MID_LAYER_MIN_WIDTH
      ) {
        layers.push(
          scaleLayer(target, 1 / screenShareMidScale(screenShareLowScale(target)), 30),
        );
      }
    }
    return layers;
  }

  // Quarter scale first (lowest quality), then half.
  if (
    extraLayerBudget >= 2 &&
    target.width / 4 >= MIN_LAYER_WIDTH &&
    target.width < MAX_LADDER_WIDTH_FOR_THREE_ENCODINGS
  ) {
    layers.push(scaleLayer(target, 1 / 4, 15));
  }
  if (extraLayerBudget >= 1 && target.width / 2 >= MIN_LAYER_WIDTH) {
    layers.push(scaleLayer(target, 1 / 2, 30));
  }

  return layers;
};

/** The screen share's low rung for this target: 360 or more on the short side, 15 fps. */
const screenShareLowLayer = (target: VideoLayerSpec): VideoLayerSpec => {
  const scale = screenShareLowScale(target);
  const width = toEven(target.width / scale);
  const height = toEven(target.height / scale);
  const byArea = Math.round(
    SCREEN_SHARE_LOW_LAYER_BITRATE_BPS *
      ((width * height) / SCREEN_SHARE_LOW_LAYER_REFERENCE_PIXELS) **
        BITRATE_PIXEL_EXPONENT,
  );
  return {
    width,
    height,
    // Never more than half of what the primary may spend.
    maxBitrateBps: Math.max(
      80_000,
      Math.min(byArea, Math.round(target.maxBitrateBps / 2)),
    ),
    maxFramerate: Math.min(target.maxFramerate, SCREEN_SHARE_LOW_LAYER_FRAMERATE),
  };
};

export interface LiveEncodingSpec {
  scaleResolutionDownBy: number;
  maxBitrate: number;
  maxFramerate: number;
}

/**
 * Encodings for a live screen-share sender whose capture just changed.
 *
 * A quality change re-captures and replaces the track without republishing,
 * so the sender keeps the encodings it was published with: their number is
 * fixed, their scale is not. The low rung's scale has to follow the new
 * capture or it stops being 360 on the short side. A 1440p publish's low rung
 * is a scale of 4, which on a 1080p capture is 270 tall and back on OpenH264.
 *
 * Lowest first, like the sender's own list: of several encodings the first is
 * the low rung, the last the primary, a middle one the half rung.
 */
export const screenShareLiveEncodings = (
  target: VideoLayerSpec,
  encodingCount: number,
): LiveEncodingSpec[] => {
  const primary: LiveEncodingSpec = {
    scaleResolutionDownBy: 1,
    maxBitrate: target.maxBitrateBps,
    maxFramerate: target.maxFramerate,
  };
  if (encodingCount <= 1) {
    return [primary];
  }

  const lowScale = screenShareLowScale(target);
  const low = screenShareLowLayer(target);
  const specs: LiveEncodingSpec[] = [
    {
      scaleResolutionDownBy: lowScale,
      maxBitrate: low.maxBitrateBps,
      maxFramerate: low.maxFramerate,
    },
  ];
  const midScale = screenShareMidScale(lowScale);
  const mid = scaleLayer(target, 1 / midScale, 30);
  for (let index = 1; index < encodingCount - 1; index += 1) {
    specs.push({
      scaleResolutionDownBy: midScale,
      maxBitrate: mid.maxBitrateBps,
      maxFramerate: mid.maxFramerate,
    });
  }
  specs.push(primary);
  return specs;
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
