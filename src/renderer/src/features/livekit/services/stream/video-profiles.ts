import {
  VideoPreset,
  type ScalabilityMode,
  type TrackPublishOptions,
  type VideoCodec,
} from "livekit-client";
import {
  buildSimulcastLayerSpecs,
  CAMERA_MAX_ENCODINGS,
  CAMERA_MAX_ENCODINGS_WHILE_SHARING,
  SCREEN_SHARE_MAX_ENCODINGS,
  type VideoLayerSpec,
} from "@shared/video-layers";

export type VideoCodecPreference = "auto" | "h264" | "vp8" | "vp9" | "av1";
export type VideoContentMode = "motion" | "detail";

export type VideoPublishTarget = VideoLayerSpec;

export interface VideoPublishPreferences {
  codec: VideoCodecPreference;
  hardwareAcceleration: boolean;
}

export const DEFAULT_VIDEO_PUBLISH_PREFERENCES: VideoPublishPreferences = {
  codec: "auto",
  hardwareAcceleration: true,
};

const isSvcCodec = (codec: VideoCodec): boolean => {
  return codec === "vp9" || codec === "av1";
};

/**
 * Codec for the automatic setting.
 *
 * H.264 is the only codec with broad hardware-encode coverage on Windows
 * (NVENC, QuickSync, AMF) and every client can decode it, so it needs no backup
 * track. VP9/AV1 compress better but on most machines they encode in software:
 * at 1440p60 that pins the CPU, which is exactly the failure this replaces.
 *
 * With hardware acceleration off, VP8 is the cheapest software encoder that
 * every client can still decode.
 */
export const resolveVideoCodec = (
  preferences: VideoPublishPreferences,
): VideoCodec => {
  if (preferences.codec !== "auto") {
    return preferences.codec;
  }
  return preferences.hardwareAcceleration ? "h264" : "vp8";
};

const toVideoPreset = (layer: VideoLayerSpec): VideoPreset => {
  return new VideoPreset({
    width: layer.width,
    height: layer.height,
    maxBitrate: layer.maxBitrateBps,
    maxFramerate: layer.maxFramerate,
  });
};

const resolveScalabilityMode = (layerCount: number): ScalabilityMode => {
  if (layerCount >= 2) {
    return "L3T3_KEY";
  }
  if (layerCount === 1) {
    return "L2T3_KEY";
  }
  return "L1T3";
};

export type VideoPublishPlan = Pick<
  TrackPublishOptions,
  | "videoCodec"
  | "videoEncoding"
  | "screenShareEncoding"
  | "simulcast"
  | "videoSimulcastLayers"
  | "screenShareSimulcastLayers"
  | "scalabilityMode"
  | "backupCodec"
  | "degradationPreference"
>;

/**
 * Which option keys LiveKit actually reads for this track's source.
 *
 * This is the whole reason the selected quality never reached the encoder.
 * `computeVideoEncodings` starts with:
 *
 *     let videoEncoding = options?.videoEncoding;
 *     if (isScreenShare) videoEncoding = options?.screenShareEncoding;
 *
 * and picks `screenShareSimulcastLayers` over `videoSimulcastLayers` the same
 * way. A screen share published with `videoEncoding`/`videoSimulcastLayers` had
 * both silently dropped and fell back to the library default,
 * `ScreenSharePresets.h1080fps15` — 1920x1080 at 2.5 Mbps and **15 fps**, plus
 * one default half layer at 625 kbps. Which is exactly what the stats panel
 * reported (1920x1080 / 15 fps / 3.11 Mbps / 2 layers) no matter which preset
 * was chosen: 720p60, 1080p60, 1440p60 and 2160p30 all published at 15 fps.
 *
 * Both key pairs carry the same values here rather than only the source's own.
 * They are read by source, never merged, so the unused pair is inert — and a
 * track published under the other source (a screen capture sent as a camera
 * track, for instance) still gets the right encoding instead of silently
 * reverting to a library default. That silent revert is the bug.
 */
const applySourceKeyedEncoding = (
  plan: VideoPublishPlan,
  encoding: { maxBitrate: number; maxFramerate: number },
  layers: VideoPreset[] | undefined,
): VideoPublishPlan => {
  return {
    ...plan,
    videoEncoding: encoding,
    screenShareEncoding: encoding,
    ...(layers
      ? { videoSimulcastLayers: layers, screenShareSimulcastLayers: layers }
      : {}),
  };
};

/**
 * Publish options for one video track.
 *
 * Screen share used to publish a single non-simulcast layer, which meant the
 * weakest subscriber in the room dragged everyone's quality down — the SFU had
 * nothing lower to forward. Every track now ships a layer ladder: simulcast for
 * H.264/VP8, temporal+spatial SVC for VP9/AV1.
 */
export const buildVideoPublishPlan = (params: {
  target: VideoPublishTarget;
  codec: VideoCodec;
  contentMode: VideoContentMode;
  isScreenShare: boolean;
  // True while this machine is also publishing a screen share. The camera drops
  // a layer then, so the two sources together stay inside what a hardware
  // encoder will take — see CAMERA_MAX_ENCODINGS_WHILE_SHARING.
  isSharingScreen?: boolean;
  maxEncodingsOverride?: number;
}): VideoPublishPlan => {
  const {
    target,
    codec,
    contentMode,
    isScreenShare,
    isSharingScreen,
    maxEncodingsOverride,
  } = params;
  const cameraMaxEncodings = isSharingScreen
    ? CAMERA_MAX_ENCODINGS_WHILE_SHARING
    : CAMERA_MAX_ENCODINGS;

  const degradationPreference: RTCDegradationPreference =
    contentMode === "motion" ? "maintain-framerate" : "maintain-resolution";

  const encoding = {
    maxBitrate: target.maxBitrateBps,
    maxFramerate: target.maxFramerate,
  };

  const maxEncodings = Math.max(
    1,
    maxEncodingsOverride ??
      (isScreenShare ? SCREEN_SHARE_MAX_ENCODINGS : cameraMaxEncodings),
  );

  const layers = buildSimulcastLayerSpecs(target, maxEncodings, isScreenShare);

  if (isSvcCodec(codec)) {
    return applySourceKeyedEncoding(
      {
        videoCodec: codec,
        // LiveKit ignores simulcast for SVC codecs; the ladder comes from
        // scalabilityMode instead.
        simulcast: false,
        scalabilityMode: resolveScalabilityMode(layers.length),
        // VP9/AV1 are not decodable everywhere. The default backup policy only
        // spins up the VP8 track when a subscriber actually needs it, so this
        // costs nothing in an all-Chromium fleet.
        backupCodec: true,
        degradationPreference,
      },
      encoding,
      undefined,
    );
  }

  return applySourceKeyedEncoding(
    {
      videoCodec: codec,
      simulcast: layers.length > 0,
      // H.264 and VP8 decode everywhere; a backup track would be pure waste.
      backupCodec: false,
      degradationPreference,
    },
    encoding,
    layers.map(toVideoPreset),
  );
};

/**
 * Content mode for a screen capture. 60fps presets are video/gameplay, where
 * dropped frames are more visible than softness; 30fps presets are treated as
 * slides/code, where sharp text matters more.
 */
export const resolveScreenContentMode = (
  requested: "auto" | VideoContentMode,
  frameRate: number,
): VideoContentMode => {
  if (requested !== "auto") {
    return requested;
  }
  return frameRate >= 60 ? "motion" : "detail";
};
