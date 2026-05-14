import { ipcMain } from "electron";
import { DesktopApiError } from "../backend-client";
import {
  STREAMING_START_CAPTURE_CHANNEL,
  STREAMING_STOP_CAPTURE_CHANNEL,
  type CaptureType,
  type StartCaptureRequest,
} from "../../shared/streaming-contracts";

import { CaptureEngine } from "./capture-engine";

interface StreamingIpcDependencies {
  captureEngine: CaptureEngine;
}

interface RateLimitRule {
  maxRequests: number;
  intervalMs: number;
}

const rateRules: Record<string, RateLimitRule> = {
  [STREAMING_START_CAPTURE_CHANNEL]: { maxRequests: 4, intervalMs: 1000 },
  [STREAMING_STOP_CAPTURE_CHANNEL]: { maxRequests: 4, intervalMs: 1000 },

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
] as const;

// registerStreamingIpcHandlers installs rate-limited IPC handlers for streaming controls.
export const registerStreamingIpcHandlers = ({
  captureEngine,
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
        throw error;
      }
    },
  );

  ipcMain.handle(STREAMING_STOP_CAPTURE_CHANNEL, async (event) => {
    try {
      enforceRateLimit(STREAMING_STOP_CAPTURE_CHANNEL, event.sender.id);
      return captureEngine.stopCapture();
    } catch (error) {
      throw error;
    }
  });


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


