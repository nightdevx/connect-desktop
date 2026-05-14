type LiveKitDebugValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Record<string, unknown>
  | Array<unknown>;

interface LiveKitDebugEntry {
  id: number;
  sessionId: string;
  ts: string;
  scope: string;
  event: string;
  payload?: Record<string, LiveKitDebugValue>;
}

const DEBUG_STORE_KEY = "__CT_LIVEKIT_DEBUG_LOGS__";
const DEBUG_SESSION_KEY = "__CT_LIVEKIT_DEBUG_SESSION__";
const MAX_DEBUG_ENTRIES = 500;

let debugSequence = 0;

const resolveSessionId = (): string => {
  const debugWindow = window as Window & {
    __CT_LIVEKIT_DEBUG_SESSION__?: string;
  };

  if (!debugWindow[DEBUG_SESSION_KEY]) {
    const randomToken = Math.random().toString(36).slice(2, 8);
    debugWindow[DEBUG_SESSION_KEY] =
      `${Date.now().toString(36)}-${randomToken}`;
  }

  return debugWindow[DEBUG_SESSION_KEY] as string;
};

const normalizePayload = (
  payload?: Record<string, unknown>,
): Record<string, LiveKitDebugValue> | undefined => {
  if (!payload) {
    return undefined;
  }

  const normalized: Record<string, LiveKitDebugValue> = {};

  Object.entries(payload).forEach(([key, value]) => {
    if (value instanceof Error) {
      normalized[key] = {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
      return;
    }

    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      typeof value === "undefined" ||
      Array.isArray(value)
    ) {
      normalized[key] = value;
      return;
    }

    if (typeof value === "object") {
      normalized[key] = value as Record<string, unknown>;
      return;
    }

    normalized[key] = String(value);
  });

  return normalized;
};

export const logLiveKitDebug = (
  scope: string,
  event: string,
  payload?: Record<string, unknown>,
): void => {
  if (typeof window === "undefined") {
    return;
  }

  const entry: LiveKitDebugEntry = {
    id: (debugSequence += 1),
    sessionId: resolveSessionId(),
    ts: new Date().toISOString(),
    scope,
    event,
    payload: normalizePayload(payload),
  };

  const debugWindow = window as Window & {
    __CT_LIVEKIT_DEBUG_LOGS__?: LiveKitDebugEntry[];
  };

  if (!debugWindow[DEBUG_STORE_KEY]) {
    debugWindow[DEBUG_STORE_KEY] = [];
  }

  const store = debugWindow[DEBUG_STORE_KEY] as LiveKitDebugEntry[];
  store.push(entry);

  if (store.length > MAX_DEBUG_ENTRIES) {
    store.splice(0, store.length - MAX_DEBUG_ENTRIES);
  }

  console.info(
    `[CT-LiveKit][${entry.sessionId}][${entry.scope}]#${entry.id} ${entry.event}`,
    entry.payload ?? {},
  );
};
