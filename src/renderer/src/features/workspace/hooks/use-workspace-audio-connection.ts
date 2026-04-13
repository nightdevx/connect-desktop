import { useEffect, useState } from "react";
import workspaceService from "../../../services/workspace-service";

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
  onProbeFailure: () => void;
}

const AUDIO_SAMPLE_LIMIT = 16;
const AUDIO_PROBE_TIMEOUT_MS = 2_400;
const AUDIO_PROBE_STABLE_INTERVAL_MS = 2_800;
const AUDIO_PROBE_DEGRADED_INTERVAL_MS = 2_000;
const AUDIO_PROBE_FAILURE_INTERVAL_MS = 1_200;
const AUDIO_PROBE_BACKGROUND_INTERVAL_MS = 4_800;
const AUDIO_PING_EMA_ALPHA = 0.35;

const getNetworkSnapshot = (): Pick<
  AudioConnectionSnapshot,
  "networkType" | "networkRttMs" | "downlinkMbps"
> => {
  if (typeof navigator === "undefined") {
    return {
      networkType: null,
      networkRttMs: null,
      downlinkMbps: null,
    };
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

export const useWorkspaceAudioConnection = ({
  activeLobbyId,
  onProbeFailure,
}: UseWorkspaceAudioConnectionParams): AudioConnectionSnapshot => {
  const [audioConnection, setAudioConnection] =
    useState<AudioConnectionSnapshot>(createIdleAudioSnapshot);

  useEffect(() => {
    if (!activeLobbyId) {
      setAudioConnection(createIdleAudioSnapshot());
      return;
    }

    let disposed = false;
    let probeTimerId: number | null = null;
    let successfulSamples = 0;
    let failedSamples = 0;
    let consecutiveFailures = 0;
    let smoothedPingMs: number | null = null;
    const recentPings: number[] = [];
    const recentOutcomes: boolean[] = [];

    const pushOutcome = (success: boolean): void => {
      recentOutcomes.push(success);
      if (recentOutcomes.length > AUDIO_SAMPLE_LIMIT) {
        recentOutcomes.shift();
      }
    };

    const scheduleNextProbe = (): void => {
      if (disposed) {
        return;
      }

      let nextDelay = AUDIO_PROBE_STABLE_INTERVAL_MS;
      if (consecutiveFailures >= 2) {
        nextDelay = AUDIO_PROBE_FAILURE_INTERVAL_MS;
      } else if (consecutiveFailures === 1) {
        nextDelay = AUDIO_PROBE_DEGRADED_INTERVAL_MS;
      }

      if (smoothedPingMs !== null && smoothedPingMs >= 220) {
        nextDelay = Math.min(nextDelay, AUDIO_PROBE_DEGRADED_INTERVAL_MS);
      }

      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      ) {
        nextDelay = Math.max(nextDelay, AUDIO_PROBE_BACKGROUND_INTERVAL_MS);
      }

      probeTimerId = window.setTimeout(() => {
        void runProbe();
      }, nextDelay);
    };

    const publishSnapshot = (
      latestPingMs: number | null,
      measuredAt: string,
    ): void => {
      const totalSamples = recentOutcomes.length;
      const failedInWindow = recentOutcomes.reduce((sum, outcome) => {
        return sum + (outcome ? 0 : 1);
      }, 0);
      const packetLossPct =
        totalSamples > 0
          ? Number(((failedInWindow / totalSamples) * 100).toFixed(1))
          : null;

      const effectivePingMs =
        smoothedPingMs !== null
          ? smoothedPingMs
          : recentPings.length > 0
            ? recentPings[recentPings.length - 1]
            : latestPingMs;

      const jitterMs =
        recentPings.length > 1
          ? Math.round(
              recentPings.slice(1).reduce((sum, ping, index) => {
                return sum + Math.abs(ping - recentPings[index]);
              }, 0) /
                (recentPings.length - 1),
            )
          : null;

      let tone: AudioConnectionTone = "ok";
      let statusText = "Ses bağlantısı iyi";

      if (successfulSamples === 0 && failedSamples > 0) {
        tone = "error";
        statusText = "Ses bağlantısı yok";
      } else if (
        (packetLossPct !== null && packetLossPct >= 20) ||
        (effectivePingMs !== null && effectivePingMs >= 350)
      ) {
        tone = "error";
        statusText = "Ses bağlantısı sorunlu";
      } else if (
        (packetLossPct !== null && packetLossPct >= 8) ||
        (effectivePingMs !== null && effectivePingMs >= 180) ||
        (jitterMs !== null && jitterMs >= 55)
      ) {
        tone = "warn";
        statusText = "Ses bağlantısı zayıf";
      }

      if (totalSamples < 2 && tone !== "error") {
        statusText = "Ses bağlantısı ölçülüyor";
      }

      setAudioConnection({
        statusText,
        tone,
        pingMs:
          effectivePingMs === null
            ? null
            : Math.max(1, Math.round(effectivePingMs)),
        packetLossPct,
        jitterMs,
        successfulSamples,
        failedSamples,
        lastMeasuredAt: measuredAt,
        ...getNetworkSnapshot(),
      });
    };

    const runProbe = async (): Promise<void> => {
      if (disposed) {
        return;
      }

      const startedAt = performance.now();
      const timeoutToken = Symbol("audio-probe-timeout");
      const resultOrTimeout = await Promise.race([
        workspaceService.getLobbyState({
          lobbyId: activeLobbyId,
        }),
        new Promise<typeof timeoutToken>((resolve) => {
          window.setTimeout(() => {
            resolve(timeoutToken);
          }, AUDIO_PROBE_TIMEOUT_MS);
        }),
      ]);

      if (disposed) {
        return;
      }

      if (resultOrTimeout !== timeoutToken && resultOrTimeout.ok) {
        const pingMs = Math.max(1, Math.round(performance.now() - startedAt));
        const measuredAt = new Date().toISOString();
        successfulSamples += 1;
        consecutiveFailures = 0;
        pushOutcome(true);

        smoothedPingMs =
          smoothedPingMs === null
            ? pingMs
            : smoothedPingMs * (1 - AUDIO_PING_EMA_ALPHA) +
              pingMs * AUDIO_PING_EMA_ALPHA;

        recentPings.push(pingMs);
        if (recentPings.length > AUDIO_SAMPLE_LIMIT) {
          recentPings.shift();
        }

        publishSnapshot(smoothedPingMs, measuredAt);
        scheduleNextProbe();
        return;
      }

      failedSamples += 1;
      consecutiveFailures += 1;
      pushOutcome(false);
      const measuredAt = new Date().toISOString();
      publishSnapshot(smoothedPingMs, measuredAt);
      onProbeFailure();
      scheduleNextProbe();
    };

    void runProbe();

    return () => {
      disposed = true;
      if (probeTimerId !== null) {
        window.clearTimeout(probeTimerId);
        probeTimerId = null;
      }
    };
  }, [activeLobbyId, onProbeFailure]);

  return audioConnection;
};
