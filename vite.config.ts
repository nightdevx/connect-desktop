import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(__dirname, "src/renderer"),
  plugins: [react()],
  base: "./",
  resolve: {
    alias: {
      "@": resolve(__dirname, "src/renderer/src"),
      "@shared": resolve(__dirname, "src/shared"),
    },
  },
  build: {
    outDir: resolve(__dirname, "dist/renderer"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("antd") || id.includes("@ant-design") || id.includes("rc-")) {
              return "vendor-ui";
            }
            if (id.includes("react") || id.includes("react-dom") || id.includes("react-router")) {
              return "vendor-react";
            }
            if (id.includes("livekit") || id.includes("livekit-client")) {
              return "vendor-livekit";
            }
            if (id.includes("lucide") || id.includes("icons")) {
              return "vendor-icons";
            }
            return "vendor";
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
