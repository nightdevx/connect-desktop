import type { ReconnectPolicy } from "livekit-client";

// Field drops (2026-11-23/24): the server closes a silent participant ~15 s after
// ICE goes quiet and refuses every resume, so the SDK's default table (up to 7 s
// + 1 s jitter between tries) made the call return 5.5 s and 11 s after the
// network did. Each try is already bounded by the 6 s websocket timeout, so the
// wait between tries is capped at 2 s. Gives up at the same point as the default
// (~100 s with a dead network); the app's own rejoin then takes over.
const DELAYS_MS = [0, 300, 800, 1400, 2000];
const GIVE_UP_AFTER_MS = 90_000;
const JITTER_MS = 300;

export const RECONNECT_POLICY: ReconnectPolicy = {
  nextRetryDelayInMs: ({ retryCount, elapsedMs }) => {
    if (elapsedMs >= GIVE_UP_AFTER_MS) return null;
    const base = DELAYS_MS[Math.min(retryCount, DELAYS_MS.length - 1)];
    return retryCount >= 2 ? base + Math.random() * JITTER_MS : base;
  },
};
