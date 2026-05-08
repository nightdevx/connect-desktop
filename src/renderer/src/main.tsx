import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider, theme } from "antd";
import App from "./App";
import { queryClient } from "./services/query-client";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        theme={{
          algorithm: theme.darkAlgorithm,
          token: {
            colorPrimary: "#ffffff",
            colorBgBase: "#050505",
            colorBgContainer: "#0d0d0d",
            colorBgElevated: "#121212",
            colorBorder: "rgba(255, 255, 255, 0.08)",
            colorTextBase: "#f5f5f5",
            borderRadius: 12,
            fontFamily: "'Space Grotesk', 'IBM Plex Sans', sans-serif",
          },
          components: {
            Button: {
              colorPrimary: "#ffffff",
              colorPrimaryHover: "#f5f5f5",
              colorPrimaryActive: "#e5e5e5",
              colorTextLightSolid: "#050505",
            },
            Input: {
              colorBgContainer: "#0d0d0d",
              colorBorder: "rgba(255, 255, 255, 0.08)",
              activeBorderColor: "#ffffff",
              hoverBorderColor: "rgba(255, 255, 255, 0.2)",
            },
            Tabs: {
              itemColor: "#c7c7c7",
              itemSelectedColor: "#ffffff",
              itemHoverColor: "#ffffff",
              inkBarColor: "#ffffff",
            },
            Modal: {
              contentBg: "#0d0d0d",
              headerBg: "#0d0d0d",
            },
            Switch: {
              colorPrimary: "#ffffff",
              colorPrimaryHover: "#f5f5f5",
            }
          }
        }}
      >
        <App />
      </ConfigProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
