import { ipcMain } from "electron";
import { DesktopApiError } from "../backend-client";
import {
  STREAMING_LOOPBACK_START_CHANNEL,
  STREAMING_LOOPBACK_STOP_CHANNEL,
} from "../../shared/streaming-contracts";

import { systemAudioLoopback } from "./system-audio-loopback";

interface RateLimitRule {
  maxRequests: number;
  intervalMs: number;
}

const rateRules: Record<string, RateLimitRule> = {
  [STREAMING_LOOPBACK_START_CHANNEL]: { maxRequests: 4, intervalMs: 1000 },
  [STREAMING_LOOPBACK_STOP_CHANNEL]: { maxRequests: 4, intervalMs: 1000 },
};

const rateState = new Map<
  string,
  {
    count: number;
    windowStart: number;
  }
>();

const streamingInvokeChannels = [
  STREAMING_LOOPBACK_START_CHANNEL,
  STREAMING_LOOPBACK_STOP_CHANNEL,
] as const;

// registerStreamingIpcHandlers installs rate-limited IPC handlers for the
// system-audio loopback. Screen/camera capture is handled entirely in the
// renderer via getUserMedia, so there is nothing else to register here.
export const registerStreamingIpcHandlers = (): void => {
  clearStreamingHandlers();

  ipcMain.handle(STREAMING_LOOPBACK_START_CHANNEL, async (event) => {
    enforceRateLimit(STREAMING_LOOPBACK_START_CHANNEL, event.sender.id);
    return systemAudioLoopback.start(event.sender);
  });

  ipcMain.handle(STREAMING_LOOPBACK_STOP_CHANNEL, async (event) => {
    enforceRateLimit(STREAMING_LOOPBACK_STOP_CHANNEL, event.sender.id);
    systemAudioLoopback.stop();
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
