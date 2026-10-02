import type { ChatMessage } from "@shared/auth-contracts";

/**
 * A call leaves its trace in the conversation as ordinary direct messages with
 * fixed bodies, so the history survives on the server with no schema of its
 * own. An older client shows them as plain text, which still reads correctly.
 *
 *   started   the caller, when the other side picks up
 *   ended     whoever hangs up last
 *   missed    the caller, when it is cancelled or times out unanswered
 *   declined  the callee, when they reject it
 */
export const CALL_LOG_BODIES = {
  started: "📞 Arama başladı",
  ended: "📞 Arama bitti",
  missed: "📞 Cevapsız arama",
  declined: "📞 Arama reddedildi",
} as const;

export type CallLogKind = keyof typeof CALL_LOG_BODIES;

const KIND_BY_BODY = new Map(
  (Object.entries(CALL_LOG_BODIES) as Array<[CallLogKind, string]>).map(
    ([kind, body]) => [body, kind],
  ),
);

export const callLogKind = (body: string): CallLogKind | null =>
  KIND_BY_BODY.get(body) ?? null;

export interface CallLogInfo {
  /** A "started" entry folded into the "ended" one that closes it. */
  hidden?: boolean;
  /** On an "ended" entry: how long the call ran. */
  durationSeconds?: number;
}

/**
 * One entry per finished call instead of two: an "ended" that follows a
 * "started" carries the time between them, and the "started" is hidden. A call
 * still running keeps its "started" entry on its own.
 */
export const pairCallLog = (messages: ChatMessage[]): Map<string, CallLogInfo> => {
  const info = new Map<string, CallLogInfo>();
  let openStart: ChatMessage | null = null;

  for (const message of messages) {
    const kind = callLogKind(message.body);
    if (kind === "started") {
      openStart = message;
    } else if (kind === "ended" && openStart) {
      const seconds = Math.round(
        (Date.parse(message.createdAt) - Date.parse(openStart.createdAt)) / 1000,
      );
      if (Number.isFinite(seconds) && seconds >= 0) {
        info.set(openStart.id, { hidden: true });
        info.set(message.id, { durationSeconds: seconds });
      }
      openStart = null;
    } else if (kind) {
      openStart = null;
    }
  }

  return info;
};

/** "45 sn", "3 dk 12 sn", "1 sa 4 dk". */
export const formatCallDuration = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours} sa ${minutes} dk`;
  }
  return minutes > 0 ? `${minutes} dk ${seconds} sn` : `${seconds} sn`;
};

// Callers whose calls ring silently, on this device only.
const MUTED_CALLERS_KEY = "connect_muted_call_users";

export const readMutedCallers = (): string[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(MUTED_CALLERS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
};

export const setCallerMuted = (userId: string, muted: boolean): void => {
  const rest = readMutedCallers().filter((id) => id !== userId);
  try {
    localStorage.setItem(
      MUTED_CALLERS_KEY,
      JSON.stringify(muted ? [...rest, userId] : rest),
    );
  } catch (error) {
    console.error("[call-log] could not save muted callers:", error);
  }
};
