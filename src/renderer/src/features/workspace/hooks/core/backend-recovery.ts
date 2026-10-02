export type StreamStatus = "connected" | "closed";

export const RECOVERY_COOLDOWN_MS = 5_000;

export type RecoveryStream = "lobby" | "users" | "dm";

/**
 * What each stream keeps current while its socket is up, as the first element
 * of the query keys it would have pushed into: the queries a reconnect has to
 * refresh, because nothing arrived for them while it was down.
 *
 * A reconnect used to invalidate every query in the app -- the admin panels,
 * the free-games list, the session itself -- three times over, once per socket.
 */
export const RECOVERED_QUERY_ROOTS: Record<RecoveryStream, readonly string[]> = {
  lobby: ["workspace-lobbies", "lobby-state", "lobby-messages"],
  users: ["workspace-users", "user-card", "friends", "friend-requests"],
  dm: ["direct-messages", "direct-message-preview"],
};

export const isRecoveredBy = (stream: RecoveryStream, queryKey: readonly unknown[]): boolean =>
  typeof queryKey[0] === "string" && RECOVERED_QUERY_ROOTS[stream].includes(queryKey[0]);

export interface RecoveryTracker {
  observe: (status: StreamStatus, now: number) => boolean;
}

export function createRecoveryTracker(
  cooldownMs: number = RECOVERY_COOLDOWN_MS,
): RecoveryTracker {
  let dropped = false;
  let recoveredAt = Number.NEGATIVE_INFINITY;

  return {
    observe: (status, now) => {
      if (status === "closed") {
        dropped = true;
        return false;
      }

      if (!dropped) {
        return false;
      }

      if (now - recoveredAt < cooldownMs) {
        dropped = false;
        return false;
      }

      recoveredAt = now;
      dropped = false;
      return true;
    },
  };
}
