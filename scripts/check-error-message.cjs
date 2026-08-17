#!/usr/bin/env node
// Self-check for toErrorMessage in src/shared/error-message.ts.
//
// It replaced ~20 hand-written `catch (err: any) { err.message || "..." }`
// sites, so every shape those used to be handed has to keep working — and the
// shapes they got WRONG have to stop producing "undefined" in a toast.
//
//   node scripts/check-error-message.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

const main = async () => {
  const { build } = await import("vite");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-error-message-"));

  await build({
    root: projectRoot,
    logLevel: "error",
    configFile: false,
    build: {
      outDir,
      emptyOutDir: true,
      ssr: true,
      lib: {
        entry: path.join(projectRoot, "src/shared/error-message.ts"),
        formats: ["es"],
        fileName: () => "error-message.mjs",
      },
      rollupOptions: { external: ["electron"] },
    },
  });

  const { toErrorMessage } = await import(
    pathToFileURL(path.join(outDir, "error-message.mjs")).href
  );

  const FALLBACK = "Bilinmeyen hata";

  // --- the three shapes the app actually throws -----------------------------
  assert.equal(toErrorMessage(new Error("boom"), FALLBACK), "boom");
  assert.equal(toErrorMessage("boom", FALLBACK), "boom");
  assert.equal(
    toErrorMessage({ code: "LOBBY_FULL", message: "Oda dolu" }, FALLBACK),
    "Oda dolu",
    "a rejected IPC envelope is message-shaped without being an Error",
  );

  // --- everything else must reach the fallback, never render "undefined" ----
  for (const value of [
    undefined,
    null,
    0,
    42,
    true,
    {},
    [],
    { message: undefined },
    { message: null },
    { message: 42 },
    { message: {} },
    new Error(""),
    "",
    "   ",
    { message: "   " },
  ]) {
    const result = toErrorMessage(value, FALLBACK);
    assert.equal(
      result,
      FALLBACK,
      `${JSON.stringify(value) ?? String(value)} must fall back, got ${result}`,
    );
  }

  // --- the result is always a usable string --------------------------------
  // The whole point is that a toast never says "undefined". Asserted as an
  // invariant rather than case by case, so a future branch cannot break it.
  const everything = [
    new Error("x"),
    "x",
    { message: "x" },
    undefined,
    null,
    {},
    Symbol("s"),
    () => undefined,
    new Map(),
  ];
  for (const value of everything) {
    const result = toErrorMessage(value, FALLBACK);
    assert.equal(typeof result, "string");
    assert.ok(result.trim().length > 0, "never an empty message");
    assert.ok(!result.includes("undefined"), "never the word undefined");
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log("error-message self-check passed");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
