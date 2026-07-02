// Builds the audio-loopback native addon against Electron's ABI (not the host
// Node ABI), so it loads inside the packaged Electron runtime. Run via
// `npm run build:native`. Requires Visual Studio Build Tools (Desktop C++) and
// Python 3 on Windows.
const { execSync } = require("node:child_process");
const path = require("node:path");

const electronVersion = require("electron/package.json").version;
const cwd = path.join(__dirname, "..", "native", "audio-loopback");

console.log(`[build-native] target electron ${electronVersion} (${process.arch})`);

// --ignore-scripts: skip npm's implicit node-gyp build (it targets the HOST node
// ABI, which is wrong for Electron and also fails). We build explicitly below
// against Electron's headers.
execSync("npm install --ignore-scripts --no-audit --no-fund", {
  cwd,
  stdio: "inherit",
});
execSync(
  `npx node-gyp rebuild --runtime=electron --target=${electronVersion} --dist-url=https://electronjs.org/headers --arch=${process.arch}`,
  { cwd, stdio: "inherit" },
);

console.log("[build-native] done");
