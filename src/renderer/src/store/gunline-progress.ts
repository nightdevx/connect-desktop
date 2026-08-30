const GUNLINE_PROFILE_STORAGE_KEY = "ct.minigames.gunline.profile";

export function readGunlineProfileRaw(): unknown {
  try {
    const raw = localStorage.getItem(GUNLINE_PROFILE_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function writeGunlineProfileRaw(profile: unknown): void {
  try {
    localStorage.setItem(GUNLINE_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    return;
  }
}

export function clearGunlineProfile(): void {
  try {
    localStorage.removeItem(GUNLINE_PROFILE_STORAGE_KEY);
  } catch {
    return;
  }
}
