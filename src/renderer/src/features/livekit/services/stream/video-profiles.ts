import {
  VideoPreset,
  type ScalabilityMode,
  type TrackPublishOptions,
  type VideoCodec,
} from "livekit-client";
import { buildSimulcastLayerSpecs, type VideoLayerSpec } from "@shared/video-layers";

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
  | "simulcast"
  | "videoSimulcastLayers"
  | "scalabilityMode"
  | "backupCodec"
  | "degradationPreference"
>;

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
}): VideoPublishPlan => {
  const { target, codec, contentMode } = params;

  const degradationPreference: RTCDegradationPreference =
    contentMode === "motion" ? "maintain-framerate" : "maintain-resolution";

  const videoEncoding = {
    maxBitrate: target.maxBitrateBps,
    maxFramerate: target.maxFramerate,
  };

  const layers = buildSimulcastLayerSpecs(target);

  if (isSvcCodec(codec)) {
    return {
      videoCodec: codec,
      videoEncoding,
      // LiveKit ignores simulcast for SVC codecs; the ladder comes from
      // scalabilityMode instead.
      simulcast: false,
      scalabilityMode: resolveScalabilityMode(layers.length),
      // VP9/AV1 are not decodable everywhere. The default backup policy only
      // spins up the VP8 track when a subscriber actually needs it, so this
      // costs nothing in an all-Chromium fleet.
      backupCodec: true,
      degradationPreference,
    };
  }

  return {
    videoCodec: codec,
    videoEncoding,
    simulcast: layers.length > 0,
    videoSimulcastLayers: layers.map(toVideoPreset),
    // H.264 and VP8 decode everywhere; a backup track would be pure waste.
    backupCodec: false,
    degradationPreference,
  };
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
