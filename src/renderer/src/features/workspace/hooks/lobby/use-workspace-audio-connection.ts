import { useEffect, useRef, useState } from "react";
import {
  classifyIcePath,
  downlinkVoiceJitterMs,
  downlinkVoiceLossPct,
  INITIAL_HELD_READINGS,
  poolPacketLossPct,
  stepHeldReadings,
  type HeldReadingsState,
  type IcePathKind,
  type MediaIcePaths,
} from "@shared/media-stats";
import type {
  LiveKitConnectionStatus,
  MediaStatsSnapshot,
} from "@/features/livekit";

export type AudioConnectionTone = "ok" | "warn" | "error" | "idle";

/**
 * Which reading put the card in warn or error, so the panel can name it.
 * Calling every warning "high ping" sent people looking at a 23 ms ping.
 */
export type AudioConnectionReason =
  | "ping"
  | "loss"
  | "jitter"
  | "path"
  | "reconnecting"
  | "disconnected";

export interface AudioConnectionSnapshot {
  statusText: string;
  tone: AudioConnectionTone;
  /** Null while the tone is ok or idle. */
  reason: AudioConnectionReason | null;
  pingMs: number | null;
  packetLossPct: number | null;
  jitterMs: number | null;
  /**
   * The worst path either connection is on. Anything but "udp" means the
   * audio is not on the direct path the server is built for: TCP holds every
   * packet behind a lost one, and a relay adds a hop.
   */
  transportPath: IcePathKind | null;
  successfulSamples: number;
  failedSamples: number;
  networkType: string | null;
  networkRttMs: number | null;
  downlinkMbps: number | null;
  lastMeasuredAt: string | null;
}

interface NavigatorConnectionLike {
  effectiveType?: string;
  rtt?: number;
  downlink?: number;
}

interface UseWorkspaceAudioConnectionParams {
  activeLobbyId: string | null;
  liveKitConnectionState?: LiveKitConnectionStatus;
  mediaStats: MediaStatsSnapshot;
}

const PING_EMA_ALPHA = 0.35;

// Thresholds are on the real media path now, so they can be tighter than the
// old backend-HTTP-derived ones.
const PING_WARN_MS = 120;
const PING_ERROR_MS = 250;
const LOSS_WARN_PCT = 3;
const LOSS_ERROR_PCT = 10;
// Exported for the detail panel, which marks the same value it is judged by.
export const JITTER_WARN_MS = 30;

const getNetworkSnapshot = (): Pick<
  AudioConnectionSnapshot,
  "networkType" | "networkRttMs" | "downlinkMbps"
> => {
  if (typeof navigator === "undefined") {
    return { networkType: null, networkRttMs: null, downlinkMbps: null };
  }

  const navigatorWithConnection = navigator as Navigator & {
    connection?: NavigatorConnectionLike;
    mozConnection?: NavigatorConnectionLike;
    webkitConnection?: NavigatorConnectionLike;
  };

  const connection =
    navigatorWithConnection.connection ??
    navigatorWithConnection.mozConnection ??
    navigatorWithConnection.webkitConnection;

  const networkRttMs =
    typeof connection?.rtt === "number" && Number.isFinite(connection.rtt)
      ? Math.round(connection.rtt)
      : null;

  const downlinkMbps =
    typeof connection?.downlink === "number" &&
    Number.isFinite(connection.downlink)
      ? Number(connection.downlink.toFixed(1))
      : null;

  return {
    networkType: connection?.effectiveType ?? null,
    networkRttMs,
    downlinkMbps,
  };
};

const createIdleAudioSnapshot = (): AudioConnectionSnapshot => {
  return {
    statusText: "Ses bağlantısı: Lobiye bağlı değil",
    tone: "idle",
    reason: null,
    pingMs: null,
    packetLossPct: null,
    jitterMs: null,
    transportPath: null,
    successfulSamples: 0,
    failedSamples: 0,
    lastMeasuredAt: null,
    ...getNetworkSnapshot(),
  };
};

const PATH_SEVERITY: Record<IcePathKind, number> = {
  udp: 0,
  tcp: 1,
  relay: 2,
};

// The publisher and subscriber connections are separate and can land on
// different paths; the one that is worse is what the user hears.
const worstTransportPath = (paths: MediaIcePaths): IcePathKind | null => {
  let worst: IcePathKind | null = null;
  for (const kind of [
    classifyIcePath(paths.publisher),
    classifyIcePath(paths.subscriber),
  ]) {
    if (kind && (worst === null || PATH_SEVERITY[kind] > PATH_SEVERITY[worst])) {
      worst = kind;
    }
  }
  return worst;
};

const windowsOf = (
  tracks: { window: { packets: number; packetsLost: number } | null }[],
): { packets: number; packetsLost: number }[] => {
  const windows: { packets: number; packetsLost: number }[] = [];
  for (const track of tracks) {
    if (track.window) {
      windows.push(track.window);
    }
  }
  return windows;
};

const maxOrNull = (values: (number | null)[]): number | null => {
  let best: number | null = null;
  for (const value of values) {
    if (value === null) {
      continue;
    }
    best = best === null ? value : Math.max(best, value);
  }
  return best;
};

/**
 * Connection quality derived from real WebRTC stats.
 *
 * This used to time a `/lobby/state` REST round trip and call it "ping", which
 * measured backend reachability and told the user nothing about the media path
 * — a healthy backend with a collapsing audio stream still read as green.
 */
export const useWorkspaceAudioConnection = ({
  activeLobbyId,
  liveKitConnectionState,
  mediaStats,
}: UseWorkspaceAudioConnectionParams): AudioConnectionSnapshot => {
  const [audioConnection, setAudioConnection] =
    useState<AudioConnectionSnapshot>(createIdleAudioSnapshot);

  const smoothedPingRef = useRef<number | null>(null);
  const previousReadingsRef = useRef<HeldReadingsState>(INITIAL_HELD_READINGS);
  const successfulSamplesRef = useRef(0);
  const failedSamplesRef = useRef(0);

  useEffect(() => {
    smoothedPingRef.current = null;
    previousReadingsRef.current = INITIAL_HELD_READINGS;
    successfulSamplesRef.current = 0;
    failedSamplesRef.current = 0;
    if (!activeLobbyId) {
      setAudioConnection(createIdleAudioSnapshot());
    }
  }, [activeLobbyId]);

  useEffect(() => {
    if (!activeLobbyId) {
      return;
    }

    // Voice quality is what the badge is about: a struggling 1440p screen share
    // is expected to shed bitrate and must not paint the call as broken.
    const audioOut = mediaStats.outbound.filter((entry) => entry.kind === "audio");
    const audioIn = mediaStats.inbound.filter((entry) => entry.kind === "audio");

    const rttMs = mediaStats.rttMs;
    if (rttMs !== null) {
      successfulSamplesRef.current += 1;
      smoothedPingRef.current =
        smoothedPingRef.current === null
          ? rttMs
          : smoothedPingRef.current * (1 - PING_EMA_ALPHA) +
            rttMs * PING_EMA_ALPHA;
    } else if (mediaStats.at > 0) {
      failedSamplesRef.current += 1;
    }

    const effectivePingMs = smoothedPingRef.current;
    // The worse of this machine's two directions. Uplink is pooled over what it
    // sends. Download is not pooled over every inbound track: the SFU forwards
    // a speaker's own uplink loss as a gap, so one remote on bad Wi-Fi painted
    // everyone else's card. downlinkVoiceLossPct says why the lowest voice is
    // this machine's share.
    const packetLossPct = maxOrNull([
      poolPacketLossPct(windowsOf(audioOut)),
      downlinkVoiceLossPct(audioIn),
    ]);
    // Not the worst inbound track: that counted muted microphones, whose
    // jitter freezes at whatever their last packet left, screen-share audio,
    // and any one remote's bad uplink. downlinkVoiceJitterMs says why.
    const jitterMs = downlinkVoiceJitterMs(mediaStats.inbound);

    // Judged on the raw round trip, not the smoothed one shown: the smoothing
    // is for a steady number on screen, and it drags a spike out.
    const step = stepHeldReadings(previousReadingsRef.current, mediaStats.at, {
      rttMs,
      packetLossPct,
      jitterMs,
    });
    previousReadingsRef.current = step.state;
    const { rttMs: heldRttMs, packetLossPct: heldLossPct, jitterMs: heldJitterMs } =
      step.held;

    const pingDisplay =
      effectivePingMs !== null ? ` (${Math.round(effectivePingMs)} ms)` : "";

    let tone: AudioConnectionTone = "ok";
    let reason: AudioConnectionReason | null = null;
    let statusText = `Ses bağlantısı iyi${pingDisplay}`;

    const lossErrors = heldLossPct !== null && heldLossPct >= LOSS_ERROR_PCT;
    const pingErrors = heldRttMs !== null && heldRttMs >= PING_ERROR_MS;
    const lossWarns = heldLossPct !== null && heldLossPct >= LOSS_WARN_PCT;
    const pingWarns = heldRttMs !== null && heldRttMs >= PING_WARN_MS;
    const jitterWarns = heldJitterMs !== null && heldJitterMs >= JITTER_WARN_MS;

    if (lossErrors || pingErrors) {
      tone = "error";
      reason = lossErrors ? "loss" : "ping";
      statusText = `Ses bağlantısı sorunlu${pingDisplay}`;
    } else if (lossWarns || pingWarns || jitterWarns) {
      tone = "warn";
      reason = lossWarns ? "loss" : pingWarns ? "ping" : "jitter";
      statusText = `Ses bağlantısı zayıf${pingDisplay}`;
    } else if (effectivePingMs === null) {
      statusText = "Ses bağlantısı ölçülüyor";
    }

    // Not an error on its own — the call works — but not the path the server
    // is built for, and the numbers above can look fine right up to the first
    // lost packet, which on TCP stalls everything queued behind it.
    const transportPath = worstTransportPath(mediaStats.icePaths);
    if (transportPath && transportPath !== "udp" && tone === "ok") {
      tone = "warn";
      reason = "path";
      statusText =
        transportPath === "tcp"
          ? `Ses yedek yoldan (TCP) akıyor${pingDisplay}`
          : `Ses aktarma sunucusundan (TURN) akıyor${pingDisplay}`;
    }

    // Transport state wins over the numbers: stats go stale the moment the
    // peer connection drops, and stale-but-good numbers must not read as green.
    if (liveKitConnectionState === "closed") {
      // Ended deliberately by the server, so nothing is retrying behind this.
      tone = "error";
      reason = "disconnected";
      statusText = "Ses bağlantısı sonlandırıldı";
    } else if (liveKitConnectionState === "disconnected") {
      tone = "error";
      reason = "disconnected";
      statusText = `Ses bağlantısı yok${pingDisplay}`;
    } else if (
      liveKitConnectionState === "reconnecting" ||
      liveKitConnectionState === "connecting"
    ) {
      if (tone !== "error") {
        tone = "warn";
      }
      reason = "reconnecting";
      statusText = "Ses bağlantısı yeniden kuruluyor";
    }

    setAudioConnection({
      statusText,
      tone,
      reason,
      pingMs:
        effectivePingMs === null ? null : Math.max(1, Math.round(effectivePingMs)),
      packetLossPct,
      jitterMs,
      transportPath,
      successfulSamples: successfulSamplesRef.current,
      failedSamples: failedSamplesRef.current,
      lastMeasuredAt:
        mediaStats.at > 0 ? new Date(mediaStats.at).toISOString() : null,
      ...getNetworkSnapshot(),
    });
  }, [activeLobbyId, liveKitConnectionState, mediaStats]);

  return audioConnection;
};
