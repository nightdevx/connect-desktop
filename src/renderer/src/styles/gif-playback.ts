/** How animated images in a conversation behave. */
export type GifPlayback = "always" | "hover";

const GIF_PLAYBACK_STORAGE_KEY = "ct.settings.gifPlayback";

export const DEFAULT_GIF_PLAYBACK: GifPlayback = "always";

export const readGifPlayback = (): GifPlayback => {
  try {
    return localStorage.getItem(GIF_PLAYBACK_STORAGE_KEY) === "hover"
      ? "hover"
      : DEFAULT_GIF_PLAYBACK;
  } catch {
    return DEFAULT_GIF_PLAYBACK;
  }
};

export const saveGifPlayback = (mode: GifPlayback): void => {
  try {
    localStorage.setItem(GIF_PLAYBACK_STORAGE_KEY, mode);
  } catch {
    // A locked-down storage costs the user this preference on next launch, not
    // this session's.
  }
};
