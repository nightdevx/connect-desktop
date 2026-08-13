/**
 * Ant Design reads its theme from the same tokens as the stylesheets.
 *
 * The values live in `modules/base.css` under `:root`; this module reads them
 * back so there is exactly one place to change a colour or a radius. The
 * stylesheet is imported before this runs (dev: injected synchronously by
 * Vite, production: a <link> in <head>), so the properties resolve by the time
 * React mounts.
 */

const ROOT_STYLE =
  typeof document !== "undefined"
    ? getComputedStyle(document.documentElement)
    : null;

/**
 * A custom property whose value is another `var()` reference should already be
 * substituted by the time it is read. If a browser ever hands one back
 * unresolved, treat it as a miss rather than passing the literal text to antd.
 */
const token = (name: string, fallback: string): string => {
  const value = ROOT_STYLE?.getPropertyValue(name).trim() ?? "";
  if (!value || value.includes("var(")) {
    return fallback;
  }
  return value;
};

const pxToken = (name: string, fallback: number): number => {
  const parsed = Number.parseFloat(token(name, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const tokens = {
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
} as const;
