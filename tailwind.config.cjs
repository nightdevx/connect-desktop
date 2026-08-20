/**
 * Tailwind is a *view* onto the design tokens, not a second source of truth.
 * Every value below points at a CSS custom property declared in
 * src/renderer/src/styles/modules/base.css. Change a token there and both the
 * utility classes and Ant Design follow.
 */
module.exports = {
  content: ["./src/renderer/index.html", "./src/renderer/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Space Grotesk", "IBM Plex Sans", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "IBM Plex Mono", "SFMono-Regular", "monospace"],
      },

      // Named steps for the 10-13px range the UI actually lives in. Previously
      // these were written as text-[10px] / text-[11px] / text-[13px] literals.
      fontSize: {
        micro: ["10px", { lineHeight: "14px", letterSpacing: "0.04em" }],
        "3xs": ["10px", { lineHeight: "14px" }],
        "2xs": ["11px", { lineHeight: "16px" }],
        xs: ["12px", { lineHeight: "18px" }],
        sm: ["13px", { lineHeight: "20px" }],
        base: ["14px", { lineHeight: "22px" }],
        lg: ["16px", { lineHeight: "24px" }],
        xl: ["20px", { lineHeight: "28px" }],
        "2xl": ["24px", { lineHeight: "32px" }],
      },

      borderRadius: {
        sm: "var(--ct-radius-sm)",
        DEFAULT: "var(--ct-radius-md)",
        md: "var(--ct-radius-md)",
        lg: "var(--ct-radius-lg)",
        xl: "var(--ct-radius-xl)",
        "2xl": "var(--ct-radius-2xl)",
      },

      colors: {
        ct: {
          surface: {
            0: "var(--ct-surface-0)",
            1: "var(--ct-surface-1)",
            2: "var(--ct-surface-2)",
            3: "var(--ct-surface-3)",
            4: "var(--ct-surface-4)",
          },
          alpha: {
            "02": "var(--ct-alpha-02)",
            "04": "var(--ct-alpha-04)",
            "08": "var(--ct-alpha-08)",
            12: "var(--ct-alpha-12)",
            20: "var(--ct-alpha-20)",
            32: "var(--ct-alpha-32)",
            50: "var(--ct-alpha-50)",
            70: "var(--ct-alpha-70)",
          },
          border: {
            DEFAULT: "var(--ct-border)",
            strong: "var(--ct-border-strong)",
          },
          text: {
            primary: "var(--ct-text-primary)",
            secondary: "var(--ct-text-secondary)",
            muted: "var(--ct-text-muted)",
            inverse: "var(--ct-text-inverse)",
          },
          accent: {
            DEFAULT: "var(--ct-accent)",
            soft: "var(--ct-accent-soft)",
            strong: "var(--ct-accent-strong)",
          },
          success: "var(--ct-success)",
          warning: "var(--ct-warning)",
          danger: "var(--ct-danger)",
          info: "var(--ct-info)",
        },
      },

      // Usable as h-control-md / w-control-md / size-avatar-lg / gap-gutter.
      spacing: {
        gutter: "var(--ct-gutter)",
        "control-xs": "var(--ct-control-xs)",
        "control-sm": "var(--ct-control-sm)",
        "control-md": "var(--ct-control-md)",
        "control-lg": "var(--ct-control-lg)",
        "icon-xs": "var(--ct-icon-xs)",
        "icon-sm": "var(--ct-icon-sm)",
        "icon-md": "var(--ct-icon-md)",
        "icon-lg": "var(--ct-icon-lg)",
        "avatar-xs": "var(--ct-avatar-xs)",
        "avatar-sm": "var(--ct-avatar-sm)",
        "avatar-md": "var(--ct-avatar-md)",
        "avatar-lg": "var(--ct-avatar-lg)",
        "avatar-xl": "var(--ct-avatar-xl)",
        titlebar: "var(--ct-titlebar-height)",
        rail: "var(--ct-rail-width)",
        sidebar: "var(--ct-sidebar-width)",
      },

      boxShadow: {
        "ct-sm": "var(--ct-shadow-sm)",
        "ct-md": "var(--ct-shadow-md)",
        "ct-lg": "var(--ct-shadow-lg)",
        "ct-glow": "var(--ct-shadow-glow)",
      },

      transitionTimingFunction: {
        premium: "var(--ct-ease-premium)",
        spring: "var(--ct-ease-spring)",
      },

      transitionDuration: {
        fast: "var(--ct-duration-fast)",
        base: "var(--ct-duration-base)",
        slow: "var(--ct-duration-slow)",
      },
    },
  },
  plugins: [],
};
