import type { MinigameId } from "./minigame-scores";

const MINIGAME_SEEN_STORAGE_KEY = "ct.minigames.rulesSeen";

export function readSeenMinigameRules(): Set<MinigameId> {
  try {
    const raw = localStorage.getItem(MINIGAME_SEEN_STORAGE_KEY);
    if (!raw) {
      return new Set();
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(parsed.filter((id): id is MinigameId => typeof id === "string"));
  } catch {
    return new Set();
  }
}

export function writeSeenMinigameRules(seen: Set<MinigameId>): void {
  try {
    localStorage.setItem(MINIGAME_SEEN_STORAGE_KEY, JSON.stringify([...seen]));
  } catch {
    // A full or disabled store means the popup opens again next time, which is
    // the harmless direction to fail in.
  }
}
