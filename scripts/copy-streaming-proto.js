const { copyFileSync, existsSync, mkdirSync } = require("node:fs");
const { dirname, resolve } = require("node:path");

const sourcePath = resolve(
  process.cwd(),
  "src/main/streaming/proto/adaptive-controller.proto",
);
const targetPath = resolve(
  process.cwd(),
  "dist/main/streaming/proto/adaptive-controller.proto",
);

if (!existsSync(sourcePath)) {
  throw new Error(`Streaming proto not found: ${sourcePath}`);
}

mkdirSync(dirname(targetPath), { recursive: true });
copyFileSync(sourcePath, targetPath);
console.log(`[copy-streaming-proto] copied to ${targetPath}`);
