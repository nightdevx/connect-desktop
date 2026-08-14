import { useMemo } from "react";
import type { MediaStatsSnapshot } from "@/features/livekit";

export type VideoQualityTone = "ok" | "warn" | "error" | "idle";

export interface VideoQualitySnapshot {
  /** Something is being published or received; false hides the whole section. */
  active: boolean;
  tone: VideoQualityTone;
  /** One line naming whatever is currently wrong, or null when nothing is. */
  problem: string | null;
  outgoing: {
    resolution: string;
    fps: number | null;
    bitrateMbps: number | null;
    codec: string | null;
    /** null when Chromium reports nothing usable. */
    hardware: boolean | null;
    layerCount: number;
    limitation: string | null;
  } | null;
  incoming: {
    resolution: string;
    fps: number | null;
    bitrateMbps: number | null;
    /** Cumulative for the life of the track, not a rate. */
    freezeCount: number | null;
    jitterBufferMs: number | null;
  } | null;
  headroomMbps: number | null;
}

const IDLE: VideoQualitySnapshot = {
  active: false,
  tone: "idle",
  problem: null,
  outgoing: null,
  incoming: null,
  headroomMbps: null,
};

const mbps = (bps: number | null): number | null => {
  return bps === null ? null : Number((bps / 1_000_000).toFixed(2));
};

const resolutionLabel = (
  width: number | null,
  height: number | null,
): string => {
  if (width === null || height === null) {
    return "-";
  }
  return `${width}x${height}`;
};

/**
 * Video half of the media stats.
 *
 * The collector has been sampling frame size, framerate, codec, encoder
 * implementation, active layer count, qualityLimitationReason and freezeCount
 * once a second all along — and nothing in the tree read any of it. Only the
 * audio half was ever rendered, so "the stream looks bad" had no number
 * attached to it anywhere in the app: no way to tell a CPU-bound software
 * encoder from a starved uplink from a receiver dropping frames.
 */
export const useVideoQuality = (
  mediaStats: MediaStatsSnapshot,
): VideoQualitySnapshot => {
  return useMemo(() => {
    const out = mediaStats.outbound.find((entry) => entry.kind === "video");
    // The largest inbound video is the one the user is actually looking at; a
    // thumbnail-sized camera tile should not decide the badge.
    const inbound = mediaStats.inbound
      .filter((entry) => entry.kind === "video")
      .sort(
        (a, b) =>
          (b.frameWidth ?? 0) * (b.frameHeight ?? 0) -
          (a.frameWidth ?? 0) * (a.frameHeight ?? 0),
      )[0];

    if (!out && !inbound) {
      return IDLE;
    }

    let tone: VideoQualityTone = "ok";
    let problem: string | null = null;

    if (out?.qualityLimitationReason === "cpu") {
      tone = "error";
      problem =
        out.hardwareEncoder === false
          ? "İşlemci yetişemiyor — video yazılımla kodlanıyor."
          : "İşlemci yayın kalitesini karşılayamıyor.";
    } else if (out?.qualityLimitationReason === "bandwidth") {
      tone = "error";
      problem = "Yükleme hızı seçilen kaliteye yetmiyor.";
    } else if (out?.hardwareEncoder === false) {
      // Not an error on its own — software encode is fine at 720p30 — but it
      // is the first thing to check when the stream stutters.
      tone = "warn";
      problem = "Video yazılımla kodlanıyor (donanım hızlandırma kapalı).";
    } else if (out?.qualityLimitationReason) {
      tone = "warn";
      problem = `Kodlayıcı sınırlı: ${out.qualityLimitationReason}`;
    }

    return {
      active: true,
      tone,
      problem,
      outgoing: out
        ? {
            resolution: resolutionLabel(out.frameWidth, out.frameHeight),
            fps: out.framesPerSecond === null ? null : Math.round(out.framesPerSecond),
            bitrateMbps: mbps(out.bitrateBps),
            codec: out.codec,
            hardware: out.hardwareEncoder,
            layerCount: out.layerCount,
            limitation: out.qualityLimitationReason,
          }
        : null,
      incoming: inbound
        ? {
            resolution: resolutionLabel(inbound.frameWidth, inbound.frameHeight),
            fps:
              inbound.framesPerSecond === null
                ? null
                : Math.round(inbound.framesPerSecond),
            bitrateMbps: mbps(inbound.bitrateBps),
            freezeCount: inbound.freezeCount,
            jitterBufferMs:
              inbound.jitterBufferDelayMs === null
                ? null
                : Math.round(inbound.jitterBufferDelayMs),
          }
        : null,
      headroomMbps: mbps(mediaStats.availableOutgoingBitrateBps),
    };
  }, [mediaStats]);
};
