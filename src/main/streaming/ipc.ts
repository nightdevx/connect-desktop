import { ipcMain } from "electron";
import { DesktopApiError } from "../backend-client";
import {
  STREAMING_REPORT_BANDWIDTH_CHANNEL,
  STREAMING_ERROR_CHANNEL,
  STREAMING_GET_NETWORK_STATUS_CHANNEL,
  STREAMING_SET_MANUAL_QUALITY_CHANNEL,
  STREAMING_START_CAPTURE_CHANNEL,
  STREAMING_STOP_CAPTURE_CHANNEL,
  type BandwidthEstimatePayload,
  type CaptureType,
  type StartCaptureRequest,
  type StreamingQualityProfileName,
} from "../../shared/streaming-contracts";
import { AdaptiveController } from "./adaptive-controller";
import { CaptureEngine } from "./capture-engine";

interface StreamingIpcDependencies {
  captureEngine: CaptureEngine;
  adaptiveController: AdaptiveController;
}

interface RateLimitRule {
  maxRequests: number;
  intervalMs: number;
}

const rateRules: Record<string, RateLimitRule> = {
  [STREAMING_START_CAPTURE_CHANNEL]: { maxRequests: 4, intervalMs: 1000 },
  [STREAMING_STOP_CAPTURE_CHANNEL]: { maxRequests: 4, intervalMs: 1000 },
  [STREAMING_GET_NETWORK_STATUS_CHANNEL]: { maxRequests: 20, intervalMs: 1000 },
  [STREAMING_SET_MANUAL_QUALITY_CHANNEL]: { maxRequests: 8, intervalMs: 1000 },
  [STREAMING_REPORT_BANDWIDTH_CHANNEL]: { maxRequests: 25, intervalMs: 1000 },
};

const rateState = new Map<
  string,
  {
    count: number;
    windowStart: number;
  }
>();

const streamingInvokeChannels = [
  STREAMING_START_CAPTURE_CHANNEL,
  STREAMING_STOP_CAPTURE_CHANNEL,
  STREAMING_GET_NETWORK_STATUS_CHANNEL,
  STREAMING_SET_MANUAL_QUALITY_CHANNEL,
  STREAMING_REPORT_BANDWIDTH_CHANNEL,
] as const;

// registerStreamingIpcHandlers installs rate-limited IPC handlers for streaming controls.
export const registerStreamingIpcHandlers = ({
  captureEngine,
  adaptiveController,
}: StreamingIpcDependencies): void => {
  clearStreamingHandlers();

  ipcMain.handle(
    STREAMING_START_CAPTURE_CHANNEL,
    async (event, payload: unknown) => {
      try {
        enforceRateLimit(STREAMING_START_CAPTURE_CHANNEL, event.sender.id);
        const parsed = parseStartCapturePayload(payload);
        return await captureEngine.startCapture(parsed);
      } catch (error) {
        notifyError(event.sender, error);
        throw error;
      }
    },
  );

  ipcMain.handle(STREAMING_STOP_CAPTURE_CHANNEL, async (event) => {
    try {
      enforceRateLimit(STREAMING_STOP_CAPTURE_CHANNEL, event.sender.id);
      return captureEngine.stopCapture();
    } catch (error) {
      notifyError(event.sender, error);
      throw error;
    }
  });

  ipcMain.handle(STREAMING_GET_NETWORK_STATUS_CHANNEL, async (event) => {
    try {
      enforceRateLimit(STREAMING_GET_NETWORK_STATUS_CHANNEL, event.sender.id);
      return adaptiveController.getNetworkStatus();
    } catch (error) {
      notifyError(event.sender, error);
      throw error;
    }
  });

  ipcMain.handle(
    STREAMING_SET_MANUAL_QUALITY_CHANNEL,
    async (event, payload: unknown) => {
      try {
        enforceRateLimit(STREAMING_SET_MANUAL_QUALITY_CHANNEL, event.sender.id);
        const profile = parseManualProfile(payload);
        return adaptiveController.setManualQuality(profile);
      } catch (error) {
        notifyError(event.sender, error);
        throw error;
      }
    },
  );

  ipcMain.handle(
    STREAMING_REPORT_BANDWIDTH_CHANNEL,
    async (event, payload: unknown) => {
      try {
        enforceRateLimit(STREAMING_REPORT_BANDWIDTH_CHANNEL, event.sender.id);
        const parsed = parseBandwidthEstimatePayload(payload);
        await adaptiveController.reportBandwidthEstimate(parsed);
      } catch (error) {
        notifyError(event.sender, error);
        throw error;
      }
    },
  );
};

// unregisterStreamingIpcHandlers removes all streaming invoke handlers.
export const unregisterStreamingIpcHandlers = (): void => {
  clearStreamingHandlers();
};

const clearStreamingHandlers = (): void => {
  for (const channel of streamingInvokeChannels) {
    ipcMain.removeHandler(channel);
  }
};

const parseStartCapturePayload = (payload: unknown): StartCaptureRequest => {
  if (typeof payload !== "object" || payload === null) {
    throw new DesktopApiError(
      "VALIDATION_ERROR",
      400,
      "startCapture payload must be an object",
    );
  }

  const source = payload as {
    sourceId?: unknown;
    type?: unknown;
  };

  const type = parseCaptureType(source.type);

  if (source.sourceId == null) {
    return {
      type,
    };
  }

  if (
    typeof source.sourceId !== "string" ||
    source.sourceId.trim().length === 0
  ) {
    throw new DesktopApiError(
      "VALIDATION_ERROR",
      400,
      "sourceId must be a non-empty string when provided",
    );
  }

  return {
    sourceId: source.sourceId.trim(),
    type,
  };
};

const parseCaptureType = (raw: unknown): CaptureType => {
  if (typeof raw !== "string") {
    throw new DesktopApiError(
      "VALIDATION_ERROR",
      400,
      "capture type must be a string",
    );
  }

  const normalized = raw.trim().toLowerCase();
  if (
    normalized === "screen" ||
    normalized === "window" ||
    normalized === "game" ||
    normalized === "camera"
  ) {
    return normalized;
  }

  throw new DesktopApiError(
    "VALIDATION_ERROR",
    400,
    "capture type must be one of screen, window, game, camera",
  );
};

const parseManualProfile = (
  payload: unknown,
): StreamingQualityProfileName | null => {
  if (payload == null) {
    return null;
  }

  if (typeof payload === "string") {
    return parseManualProfileName(payload);
  }

  if (typeof payload !== "object") {
    throw new DesktopApiError(
      "VALIDATION_ERROR",
      400,
      "manual quality payload must be null, string, or object",
    );
  }

  const source = payload as {
    profile?: unknown;
  };

  if (source.profile == null) {
    return null;
  }

  if (typeof source.profile !== "string") {
    throw new DesktopApiError(
      "VALIDATION_ERROR",
      400,
      "manual quality profile must be a string",
    );
  }

  return parseManualProfileName(source.profile);
};

const parseManualProfileName = (raw: string): StreamingQualityProfileName => {
  const normalized = raw.trim().toUpperCase();
  if (normalized === "ULTRA") {
    return "ULTRA";
  }
  if (normalized === "HIGH") {
    return "HIGH";
  }
  if (normalized === "MEDIUM") {
    return "MEDIUM";
  }
  if (normalized === "LOW") {
    return "LOW";
  }
  if (normalized === "EMERGENCY") {
    return "EMERGENCY";
  }

  throw new DesktopApiError(
    "VALIDATION_ERROR",
    400,
    "manual quality profile must be ULTRA, HIGH, MEDIUM, LOW, or EMERGENCY",
  );
};

const parseBandwidthEstimatePayload = (
  payload: unknown,
): BandwidthEstimatePayload => {
  if (typeof payload !== "object" || payload === null) {
    throw new DesktopApiError(
      "VALIDATION_ERROR",
      400,
      "bandwidth payload must be an object",
    );
  }

  const source = payload as Partial<BandwidthEstimatePayload>;

  if (!source.roomId || typeof source.roomId !== "string") {
    throw new DesktopApiError("VALIDATION_ERROR", 400, "roomId is required");
  }

  if (source.source !== "camera" && source.source !== "screen") {
    throw new DesktopApiError(
      "VALIDATION_ERROR",
      400,
      "source must be camera or screen",
    );
  }

  if (
    source.profile !== "ULTRA" &&
    source.profile !== "HIGH" &&
    source.profile !== "MEDIUM" &&
    source.profile !== "LOW" &&
    source.profile !== "EMERGENCY"
  ) {
    throw new DesktopApiError("VALIDATION_ERROR", 400, "invalid profile");
  }

  const toNumber = (value: unknown, field: string): number => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new DesktopApiError(
        "VALIDATION_ERROR",
        400,
        `${field} must be a finite number`,
      );
    }
    return value;
  };

  if (!source.timestamp || typeof source.timestamp !== "string") {
    throw new DesktopApiError("VALIDATION_ERROR", 400, "timestamp is required");
  }

  return {
    roomId: source.roomId,
    source: source.source,
    profile: source.profile,
    bitrateBps: toNumber(source.bitrateBps, "bitrateBps"),
    packetsLost: toNumber(source.packetsLost, "packetsLost"),
    packetsSent: toNumber(source.packetsSent, "packetsSent"),
    rttMs: toNumber(source.rttMs, "rttMs"),
    timestamp: source.timestamp,
  };
};

const enforceRateLimit = (channel: string, senderId: number): void => {
  const rule = rateRules[channel];
  if (!rule) {
    return;
  }

  const now = Date.now();
  const key = `${senderId}:${channel}`;
  const snapshot = rateState.get(key);

  if (!snapshot || now - snapshot.windowStart >= rule.intervalMs) {
    rateState.set(key, { count: 1, windowStart: now });
    return;
  }

  if (snapshot.count >= rule.maxRequests) {
    throw new DesktopApiError(
      "RATE_LIMITED",
      429,
      `${channel} request rate exceeded`,
    );
  }

  snapshot.count += 1;
  rateState.set(key, snapshot);
};

const notifyError = (sender: Electron.WebContents, error: unknown): void => {
  if (sender.isDestroyed()) {
    return;
  }

  const message =
    error instanceof Error ? error.message : "Unknown streaming error";

  sender.send(STREAMING_ERROR_CHANNEL, {
    code: "STREAMING_IPC_ERROR",
    message,
    timestamp: new Date().toISOString(),
  });
};
