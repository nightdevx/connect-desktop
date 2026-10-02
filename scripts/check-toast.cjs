#!/usr/bin/env node
// Self-check for the toast store in src/renderer/src/services/toast.ts.
//
// It replaced antd's `message` in ~30 files, including the app-wide status line
// that setStatus() drives from fifty places. Three behaviours carry that weight
// and are easy to break without anything failing to compile:
//
//   - a keyed toast REPLACES the one under its key (the status line must not
//     stack a copy per setStatus call),
//   - a blank title is dropped (callers interpolate error text that can come
//     back empty — a toast that says nothing is worse than none),
//   - the stack is capped, newest first.
//
//   node scripts/check-toast.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

const main = async () => {
  const { build } = await import("vite");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-toast-"));

  await build({
    root: projectRoot,
    logLevel: "error",
    configFile: false,
    build: {
      outDir,
      emptyOutDir: true,
      ssr: true,
      lib: {
        entry: path.join(projectRoot, "src/renderer/src/services/toast.ts"),
        formats: ["es"],
        fileName: () => "toast.mjs",
      },
    },
  });

  const { toast } = await import(pathToFileURL(path.join(outDir, "toast.mjs")).href);

  let notified = 0;
  const unsubscribe = toast.subscribe(() => {
    notified += 1;
  });

  // --- tones and shapes -----------------------------------------------------
  toast.success("Kaydedildi");
  toast.error({ title: "Bağlanılamadı", description: "Tekrar dene." });
  let items = toast.getSnapshot();
  assert.equal(items.length, 2);
  assert.equal(items[0].tone, "error", "newest first");
  assert.equal(items[0].description, "Tekrar dene.");
  assert.ok(items[0].duration > items[1].duration, "errors stay longer than successes");
  assert.equal(notified, 2);

  // --- antd-compatible open() ------------------------------------------------
  toast.open({ type: "warning", key: "ct-status", content: "Ses cihazı çıkarıldı" });
  toast.open({ type: "success", key: "ct-status", content: "Mikrofon değişti" });
  items = toast.getSnapshot();
  const status = items.filter((t) => t.key === "ct-status");
  assert.equal(status.length, 1, "a keyed toast replaces the one under its key");
  assert.equal(status[0].title, "Mikrofon değişti");
  assert.equal(status[0].tone, "success");

  // --- blank titles never render ----------------------------------------------
  const before = toast.getSnapshot().length;
  toast.error("");
  toast.info("   ");
  toast.warning({ title: "  \n " });
  assert.equal(toast.getSnapshot().length, before, "blank toasts are dropped");

  // --- cap -------------------------------------------------------------------
  for (let i = 0; i < 10; i += 1) toast.info(`bildirim ${i}`);
  items = toast.getSnapshot();
  assert.equal(items.length, 4, "at most four on screen");
  assert.equal(items[0].title, "bildirim 9", "the newest survives the cap");

  // --- dismiss ---------------------------------------------------------------
  toast.dismiss(items[0].id);
  assert.equal(toast.getSnapshot().length, 3);
  assert.ok(!toast.getSnapshot().some((t) => t.id === items[0].id));
  const afterDismiss = notified;
  toast.dismiss(-1);
  assert.equal(notified, afterDismiss, "dismissing nothing does not notify");

  unsubscribe();
  toast.info("sessiz");
  assert.equal(notified, afterDismiss, "an unsubscribed listener hears nothing");

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log("toast self-check passed");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
