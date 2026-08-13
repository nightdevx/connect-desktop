import { useEffect, useRef, useState } from "react";
import type { MediaStatsSnapshot } from "@/features/livekit";

export type AudioConnectionTone = "ok" | "warn" | "error" | "idle";

export interface AudioConnectionSnapshot {
  statusText: string;
  tone: AudioConnectionTone;
  pingMs: number | null;
  packetLossPct: number | null;
  jitterMs: number | null;
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
  liveKitConnectionState?:
    | "connecting"
    | "connected"
    | "reconnecting"
    | "disconnected";
  mediaStats: MediaStatsSnapshot;
}

const PING_EMA_ALPHA = 0.35;

// Thresholds are on the real media path now, so they can be tighter than the
// old backend-HTTP-derived ones.
const PING_WARN_MS = 120;
const PING_ERROR_MS = 250;
const LOSS_WARN_PCT = 3;
const LOSS_ERROR_PCT = 10;
const JITTER_WARN_MS = 30;

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
    pingMs: null,
    packetLossPct: null,
    jitterMs: null,
    successfulSamples: 0,
    failedSamples: 0,
    lastMeasuredAt: null,
    ...getNetworkSnapshot(),
  };
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
  const successfulSamplesRef = useRef(0);
  const failedSamplesRef = useRef(0);

  useEffect(() => {
    smoothedPingRef.current = null;
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
    const packetLossPct = maxOrNull([
      ...audioOut.map((entry) => entry.packetLossPct),
      ...audioIn.map((entry) => entry.packetLossPct),
    ]);
    const jitterMs = maxOrNull(audioIn.map((entry) => entry.jitterMs));

    const pingDisplay =
      effectivePingMs !== null ? ` (${Math.round(effectivePingMs)} ms)` : "";

    let tone: AudioConnectionTone = "ok";
    let statusText = `Ses bağlantısı iyi${pingDisplay}`;

    if (
      (packetLossPct !== null && packetLossPct >= LOSS_ERROR_PCT) ||
      (effectivePingMs !== null && effectivePingMs >= PING_ERROR_MS)
    ) {
      tone = "error";
      statusText = `Ses bağlantısı sorunlu${pingDisplay}`;
    } else if (
      (packetLossPct !== null && packetLossPct >= LOSS_WARN_PCT) ||
      (effectivePingMs !== null && effectivePingMs >= PING_WARN_MS) ||
      (jitterMs !== null && jitterMs >= JITTER_WARN_MS)
    ) {
      tone = "warn";
      statusText = `Ses bağlantısı zayıf${pingDisplay}`;
    } else if (effectivePingMs === null) {
      statusText = "Ses bağlantısı ölçülüyor";
    }

    // Transport state wins over the numbers: stats go stale the moment the
    // peer connection drops, and stale-but-good numbers must not read as green.
    if (liveKitConnectionState === "disconnected") {
      tone = "error";
      statusText = `Ses bağlantısı yok${pingDisplay}`;
    } else if (
      liveKitConnectionState === "reconnecting" ||
      liveKitConnectionState === "connecting"
    ) {
      if (tone !== "error") {
        tone = "warn";
      }
      statusText = "Ses bağlantısı yeniden kuruluyor";
    }

    setAudioConnection({
      statusText,
      tone,
      pingMs:
        effectivePingMs === null ? null : Math.max(1, Math.round(effectivePingMs)),
      packetLossPct,
      jitterMs,
      successfulSamples: successfulSamplesRef.current,
      failedSamples: failedSamplesRef.current,
      lastMeasuredAt:
        mediaStats.at > 0 ? new Date(mediaStats.at).toISOString() : null,
      ...getNetworkSnapshot(),
    });
  }, [activeLobbyId, liveKitConnectionState, mediaStats]);

  return audioConnection;
};
