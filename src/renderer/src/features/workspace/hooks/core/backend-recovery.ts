export type StreamStatus = "connected" | "closed";

export const RECOVERY_COOLDOWN_MS = 5_000;

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
