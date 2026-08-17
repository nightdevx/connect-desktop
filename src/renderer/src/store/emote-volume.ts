/**
 * How loud this user hears other people's soundboard, 0-200%.
 *
 * ponytail: localStorage, like the theme, the GIF playback mode and the
 * per-participant volumes. It is a property of this machine's speakers, not of
 * the account -- the answer on a laptop in a quiet room is not the answer on a
 * desktop with the volume already up.
 *
 * Separate from the app's other sound effects on purpose. Join, leave and the
 * microphone toggle are this user's own feedback about their own actions; the
 * soundboard is other people making noise, which is the thing anybody actually
 * wants a knob for.
 */
const EMOTE_VOLUME_STORAGE_KEY = "ct.settings.emoteVolume";

export const DEFAULT_EMOTE_VOLUME_PERCENT = 100;
export const MAX_EMOTE_VOLUME_PERCENT = 200;

export const clampEmoteVolumePercent = (percent: number): number => {
  if (!Number.isFinite(percent)) {
    return DEFAULT_EMOTE_VOLUME_PERCENT;
  }
  return Math.min(MAX_EMOTE_VOLUME_PERCENT, Math.max(0, Math.round(percent)));
};

export const readEmoteVolumePercent = (): number => {
  try {
    const raw = localStorage.getItem(EMOTE_VOLUME_STORAGE_KEY);
    if (raw === null) {
      return DEFAULT_EMOTE_VOLUME_PERCENT;
    }
    // Number("") is 0, which would silently start a fresh install muted.
    const parsed = raw.trim() === "" ? Number.NaN : Number(raw);
    return clampEmoteVolumePercent(parsed);
  } catch {
    return DEFAULT_EMOTE_VOLUME_PERCENT;
  }
};

export const saveEmoteVolumePercent = (percent: number): void => {
  try {
    localStorage.setItem(
      EMOTE_VOLUME_STORAGE_KEY,
      String(clampEmoteVolumePercent(percent)),
    );
  } catch {
    // A locked-down storage costs the user this preference on next launch, not
    // this session's.
  }
};
