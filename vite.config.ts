import { sentryVitePlugin } from "@sentry/vite-plugin";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import { defineConfig } from "vite";

const { version } = JSON.parse(
  readFileSync(resolve(__dirname, "package.json"), "utf8"),
) as { version: string };

export default defineConfig({
  root: resolve(__dirname, "src/renderer"),
  // React Compiler memoizes components and hooks at build time. plugin-react 6
  // dropped its own `babel` option; @rolldown/plugin-babel runs the compiler,
  // and the preset limits it to files that can hold components or hooks.
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), sentryVitePlugin({
    org: "night-ki",
    project: "connect-desktop",
    // The release @sentry/electron gives every event: "<app name>@<version>",
    // and the packaged app's name is productName in electron-builder.yml. The
    // plugin defaulted to GITHUB_SHA, so the uploaded source maps sat under a
    // release no event ever carried and stack traces stayed minified.
    release: { name: `Connect@${version}` },
  })],
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
    // Scripts and WASM are never inlined as data: URLs. Worklets are loaded
    // with addModule(url), and the CSP (script-src 'self') refuses a data: URL:
    // an earlier 1.1 kB noise-gate worklet fell under the 4 kB default and never
    // ran in a production build. Everything else keeps the default.
    assetsInlineLimit: (file: string) =>
      /\.(js|wasm)$/.test(file) ? false : undefined,

    rollupOptions: {
      output: {
        // Grouped by package name, not by substring of the whole path.
        //
        // `id.includes("react")` used to decide the react chunk, which also
        // matched emoji-picker-react — ~300 kB of emoji table pinned into the
        // chunk that loads before first paint, defeating the lazy boundary in
        // components/common/emoji-keyboard.tsx. Anything not named here is left
        // unassigned on purpose: rollup then puts a dynamically-imported package
        // in its own async chunk instead of the startup bundle.
        manualChunks(id) {
          const afterModules = id.replace(/\\/g, "/").split("node_modules/").pop();
          if (afterModules === undefined || afterModules === id) {
            return;
          }

          const segments = afterModules.split("/");
          const pkg = segments[0].startsWith("@")
            ? `${segments[0]}/${segments[1]}`
            : segments[0];

          if (pkg === "antd" || pkg.startsWith("@ant-design/") || pkg.startsWith("rc-")) {
            return "vendor-ui";
          }
          if (
            pkg === "react" ||
            pkg === "react-dom" ||
            pkg === "scheduler" ||
            pkg.startsWith("@tanstack/")
          ) {
            return "vendor-react";
          }
          if (pkg === "livekit-client") {
            return "vendor-livekit";
          }
          if (pkg === "emoji-picker-react" || pkg === "three") {
            return;
          }
          return "vendor";
        },
      },
    },

    // Uploaded to Sentry but not referenced from the bundle. electron-builder
    // leaves *.map out of the package either way.
    sourcemap: "hidden",
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
