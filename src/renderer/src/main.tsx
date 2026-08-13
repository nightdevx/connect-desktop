// The stylesheet must be evaluated before design-tokens reads :root back off
// the document, so this import stays first.
import "./styles/global.css";

import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/electron/renderer";
import { QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider, theme } from "antd";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { queryClient } from "./services/query-client";
import { tokens } from "./styles/design-tokens";

// Initialize Sentry for renderer process. It automatically tunnels events to main process.
if (process.env.NODE_ENV !== "development") {
  Sentry.init({});
}

// An error boundary cannot see these. Without them a rejected promise in a
// websocket callback or a throw inside a setTimeout vanished into the devtools
// console, which nobody has open in a packaged build.
window.addEventListener("unhandledrejection", (event) => {
  console.error("[renderer] unhandled promise rejection:", event.reason);
});
window.addEventListener("error", (event) => {
  console.error("[renderer] uncaught error:", event.error ?? event.message);
});

// Every value here comes from the design tokens, so Ant Design components and
// the hand-written .ct-* classes cannot drift apart.
const antdTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: tokens.accent,
    colorBgBase: tokens.surface0,
    colorBgContainer: tokens.surface1,
    colorBgElevated: tokens.surface3,
    colorBorder: tokens.alpha08,
    colorBorderSecondary: tokens.alpha08,
    colorTextBase: tokens.textPrimary,
    colorSuccess: tokens.success,
    colorWarning: tokens.warning,
    colorError: tokens.danger,
    colorInfo: tokens.info,
    borderRadius: tokens.radiusMd,
    borderRadiusSM: tokens.radiusSm,
    borderRadiusLG: tokens.radiusLg,
    controlHeight: tokens.controlMd,
    controlHeightSM: tokens.controlSm,
    controlHeightLG: tokens.controlLg,
    fontFamily: tokens.fontSans,
    fontSize: 13,
  },
  components: {
    Button: {
      colorTextLightSolid: tokens.textInverse,
      primaryShadow: "none",
    },
    Input: {
      colorBgContainer: tokens.surface1,
      activeBorderColor: tokens.accent,
      hoverBorderColor: tokens.alpha20,
      activeShadow: "none",
    },
    Select: {
      optionSelectedBg: tokens.alpha08,
    },
    Tabs: {
      itemColor: tokens.textSecondary,
      itemSelectedColor: tokens.textPrimary,
      itemHoverColor: tokens.textPrimary,
      inkBarColor: tokens.accent,
    },
    Segmented: {
      itemSelectedBg: tokens.accent,
      itemSelectedColor: tokens.textInverse,
      itemColor: tokens.textMuted,
      itemHoverColor: tokens.textPrimary,
    },
    Modal: {
      contentBg: tokens.surface2,
      headerBg: tokens.surface2,
      titleColor: tokens.textPrimary,
    },
    Switch: {
      colorPrimary: tokens.accent,
      colorPrimaryHover: tokens.accent,
    },
    Tooltip: {
      colorBgSpotlight: tokens.surface3,
      colorTextLightSolid: tokens.textPrimary,
    },
    Card: {
      colorBgContainer: tokens.surface2,
    },
  },
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConfigProvider theme={antdTheme}>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </ConfigProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
