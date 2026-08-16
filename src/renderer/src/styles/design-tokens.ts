/**
 * Ant Design reads its theme from the same tokens as the stylesheets.
 *
 * The values live in `modules/base.css` under `:root` (and again, for the light
 * theme, under `:root[data-theme="light"]`); this module reads them back so
 * there is exactly one place to change a colour or a radius. The stylesheet is
 * imported before this runs (dev: injected synchronously by Vite, production: a
 * <link> in <head>), so the properties resolve by the time React mounts.
 *
 * Read through readTokens() rather than a module constant: switching the theme
 * rewrites every one of these under the same names, and a snapshot taken at
 * import time would leave every antd component on the palette the app started
 * with.
 */

/**
 * A custom property whose value is another `var()` reference should already be
 * substituted by the time it is read. If a browser ever hands one back
 * unresolved, treat it as a miss rather than passing the literal text to antd.
 */
const readToken = (
  rootStyle: CSSStyleDeclaration | null,
  name: string,
  fallback: string,
): string => {
  const value = rootStyle?.getPropertyValue(name).trim() ?? "";
  if (!value || value.includes("var(")) {
    return fallback;
  }
  return value;
};

const readPxToken = (
  rootStyle: CSSStyleDeclaration | null,
  name: string,
  fallback: number,
): number => {
  const parsed = Number.parseFloat(readToken(rootStyle, name, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const readTokens = () => {
  // Re-read on every call, never cached: getComputedStyle reflects whatever
  // data-theme is currently on <html>.
  const rootStyle =
    typeof document !== "undefined"
      ? getComputedStyle(document.documentElement)
      : null;

  const token = (name: string, fallback: string): string =>
    readToken(rootStyle, name, fallback);
  const pxToken = (name: string, fallback: number): number =>
    readPxToken(rootStyle, name, fallback);

  return {
    fontSans: token(
      "--ct-font-sans",
      "'Space Grotesk', 'IBM Plex Sans', 'Segoe UI', sans-serif",
    ),

    surface0: token("--ct-surface-0", "#040404"),
    surface1: token("--ct-surface-1", "#090909"),
    surface2: token("--ct-surface-2", "#101010"),
    surface3: token("--ct-surface-3", "#181818"),

    alpha08: token("--ct-alpha-08", "rgba(255, 255, 255, 0.08)"),
    alpha20: token("--ct-alpha-20", "rgba(255, 255, 255, 0.2)"),

    textPrimary: token("--ct-text-primary", "#ffffff"),
    textSecondary: token("--ct-text-secondary", "#d4d4d8"),
    textMuted: token("--ct-text-muted", "#8f8f8f"),
    textInverse: token("--ct-text-inverse", "#0b0b0b"),

    accent: token("--ct-accent", "#ffffff"),
    success: token("--ct-success", "#10b981"),
    warning: token("--ct-warning", "#f59e0b"),
    danger: token("--ct-danger", "#ef4444"),
    info: token("--ct-info", "#3b82f6"),

    radiusSm: pxToken("--ct-radius-sm", 6),
    radiusMd: pxToken("--ct-radius-md", 10),
    radiusLg: pxToken("--ct-radius-lg", 14),

    controlSm: pxToken("--ct-control-sm", 32),
    controlMd: pxToken("--ct-control-md", 40),
    controlLg: pxToken("--ct-control-lg", 48),
  };
};

export type DesignTokens = ReturnType<typeof readTokens>;
