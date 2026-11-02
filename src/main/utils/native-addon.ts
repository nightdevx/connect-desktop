import { app } from "electron";
import { createRequire } from "node:module";
import { join } from "node:path";

const nativeRequire = createRequire(__filename);

// Resolves native/<name> across dev (project root) and packaged (asarUnpack'd
// app dir) layouts. Returns null if it cannot be loaded so the caller can
// degrade instead of crashing. Never the working directory: a .node file
// planted wherever the app happens to be started from would run as native code.
export const loadNativeAddon = <T>(name: string): T | null => {
  const candidates = [
    // dev: dist/main/utils -> up to project root -> native/...
    join(__dirname, "..", "..", "..", "native", name),
    join(app.getAppPath(), "native", name),
    join(app.getAppPath(), "..", "native", name),
    // packaged: native is asarUnpack'd next to resources
    join(process.resourcesPath ?? "", "native", name),
    join(process.resourcesPath ?? "", "app.asar.unpacked", "native", name),
  ];

  const errors: string[] = [];
  for (const candidate of candidates) {
    try {
      const addon = nativeRequire(candidate) as T;
      console.log(`[native] ${name} loaded from: ${candidate}`);
      return addon;
    } catch (error) {
      errors.push(
        `  - ${candidate}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.warn(
    `[native] ${name} NOT loaded.\n` +
      `appPath=${app.getAppPath()} resourcesPath=${process.resourcesPath}\n` +
      "tried:\n" +
      errors.join("\n"),
  );
  return null;
};
