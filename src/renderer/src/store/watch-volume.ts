/**
 * How loud this user hears the room's shared video, and whether they muted it.
 *
 * ponytail: localStorage, like the emote volume, the theme and the
 * per-participant volumes. It is a property of this machine's speakers rather
 * than of the account, and it is deliberately NOT part of the watch session:
 * the server carries what the room is watching and where it has got to, never
 * how loud it is for any one person.
 *
 * Kept out of view-preferences because that store restores booleans only — a
 * number written there reads back as its default on every launch, which is the
 * silent kind of broken.
 */
const WATCH_VOLUME_STORAGE_KEY = "ct.settings.watchVolume";
const WATCH_MUTED_STORAGE_KEY = "ct.settings.watchMuted";

export const DEFAULT_WATCH_VOLUME_PERCENT = 70;

export const clampWatchVolumePercent = (percent: number): number => {
  if (!Number.isFinite(percent)) {
    return DEFAULT_WATCH_VOLUME_PERCENT;
  }
  return Math.min(100, Math.max(0, Math.round(percent)));
};

export const readWatchVolumePercent = (): number => {
  try {
    const raw = localStorage.getItem(WATCH_VOLUME_STORAGE_KEY);
    if (raw === null) {
      return DEFAULT_WATCH_VOLUME_PERCENT;
    }
    // Number("") is 0, which would silently start a fresh install silent.
    const parsed = raw.trim() === "" ? Number.NaN : Number(raw);
    return clampWatchVolumePercent(parsed);
  } catch {
    return DEFAULT_WATCH_VOLUME_PERCENT;
  }
};

export const saveWatchVolumePercent = (percent: number): void => {
  try {
    localStorage.setItem(
      WATCH_VOLUME_STORAGE_KEY,
      String(clampWatchVolumePercent(percent)),
    );
  } catch {
    // A locked-down storage costs the user this preference on next launch, not
    // this session's.
  }
};

export const readWatchMuted = (): boolean => {
  try {
    return localStorage.getItem(WATCH_MUTED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

export const saveWatchMuted = (muted: boolean): void => {
  try {
    localStorage.setItem(WATCH_MUTED_STORAGE_KEY, muted ? "true" : "false");
  } catch {
    // See saveWatchVolumePercent.
  }
};
