export type ThemeMode = "dark" | "light";

const THEME_STORAGE_KEY = "ct.settings.theme";

export const DEFAULT_THEME_MODE: ThemeMode = "dark";

export const readThemeMode = (): ThemeMode => {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "light"
      ? "light"
      : DEFAULT_THEME_MODE;
  } catch {
    return DEFAULT_THEME_MODE;
  }
};

/**
 * Stamps the mode on <html>, which is what every token override in base.css
 * keys off.
 *
 * Called once at startup BEFORE React renders — a first paint in the wrong
 * theme is a white flash on a dark app, or the reverse — and again on every
 * change.
 */
export const applyThemeMode = (mode: ThemeMode): void => {
  document.documentElement.setAttribute("data-theme", mode);
  // The system caption buttons over the title bar (Windows) are not part of the
  // page; main recolours them. Absent outside the app (preview pages).
  void window.desktopApi?.setWindowTheme(mode);
};

export const saveThemeMode = (mode: ThemeMode): void => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // A locked-down storage costs the user their theme on next launch, not
    // this session's.
  }
};
