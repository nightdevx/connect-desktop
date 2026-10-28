#!/usr/bin/env node
// Self-check for the main process's window and file plumbing:
//   - src/main/utils/atomic-write.ts: a write that dies halfway leaves the old
//     file whole (session.json, app-preferences.json).
//
// Each module is bundled on its own with Vite, as check-access-token.cjs does,
// and output goes under node_modules/.cache so bare specifiers resolve.
//
//   node scripts/check-desktop-shell.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

const bundle = async (outDir, entry, fileName, { alias = {}, external = [] } = {}) => {
  const { build } = await import("vite");
  await build({
    root: projectRoot,
    logLevel: "error",
    configFile: false,
    publicDir: false,
    resolve: { alias },
    build: {
      outDir,
      emptyOutDir: false,
      ssr: true,
      rollupOptions: { external },
      lib: { entry: path.join(projectRoot, entry), formats: ["es"], fileName: () => fileName },
    },
  });
  return import(pathToFileURL(path.join(outDir, fileName)).href);
};

const main = async () => {
  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-desktop-shell-"));

  try {
    // --- atomic write ------------------------------------------------------
    {
      const { writeFileAtomic } = await bundle(outDir, "src/main/utils/atomic-write.ts", "atomic-write.mjs", {
        external: ["node:fs"],
      });
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ct-atomic-"));
      const target = path.join(dir, "session.json");
      const leftovers = () => fs.readdirSync(dir).filter((name) => name !== "session.json");

      writeFileAtomic(target, '{"v":1}');
      assert.equal(fs.readFileSync(target, "utf8"), '{"v":1}');
      writeFileAtomic(target, '{"v":2}');
      assert.equal(fs.readFileSync(target, "utf8"), '{"v":2}', "a second write replaces the first");
      assert.deepEqual(leftovers(), [], "no temp file is left after a good write");

      // The write dies after half the bytes reached the disk: what a power cut or
      // a full disk does to writeFileSync on the real path.
      const realWrite = fs.writeFileSync;
      fs.writeFileSync = (file, data, options) => {
        realWrite(file, String(data).slice(0, 4), options);
        throw new Error("ENOSPC: no space left on device");
      };
      try {
        assert.throws(() => writeFileAtomic(target, '{"v":3,"long":"payload"}'), /ENOSPC/);
      } finally {
        fs.writeFileSync = realWrite;
      }
      assert.equal(fs.readFileSync(target, "utf8"), '{"v":2}', "an interrupted write leaves the old file whole");
      assert.deepEqual(leftovers(), [], "an interrupted write cleans its temp file up");

      fs.rmSync(dir, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }

  console.log("desktop-shell self-check passed");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
