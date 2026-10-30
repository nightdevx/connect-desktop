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

  const { toast, humanizeError } = await import(pathToFileURL(path.join(outDir, "toast.mjs")).href);

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

  // --- a keyed replacement stays in place, keeps its id, restarts its rev ----
  toast.progress({ key: "yukle", title: "Ses yükleniyor", value: 10 });
  toast.info("üstte");
  const progress = toast.getSnapshot().find((t) => t.key === "yukle");
  assert.equal(progress.tone, "progress");
  assert.equal(progress.duration, Number.POSITIVE_INFINITY, "progress stays until done");
  toast.progress({ key: "yukle", title: "Ses yükleniyor", value: 64 });
  const moved = toast.getSnapshot().find((t) => t.key === "yukle");
  assert.equal(moved.id, progress.id, "same card, so it does not slide in again");
  assert.equal(moved.value, 64);
  assert.ok(moved.rev > progress.rev, "a replacement restarts the countdown");
  assert.equal(toast.getSnapshot()[0].title, "üstte", "replaced in place, not moved to the top");
  toast.success({ key: "yukle", title: "Ses eklendi" });
  const done = toast.getSnapshot().find((t) => t.key === "yukle");
  assert.equal(done.tone, "success");
  assert.equal(done.id, progress.id);
  assert.ok(Number.isFinite(done.duration), "done, it leaves on its own");
  assert.equal(done.value, undefined);

  // --- a card that finished leaving takes only its own version down ----------
  toast.dismiss(done.id, moved.rev);
  assert.ok(toast.getSnapshot().some((t) => t.id === done.id), "the newer version stays");
  toast.dismiss(done.id, done.rev);
  assert.ok(!toast.getSnapshot().some((t) => t.id === done.id));

  // --- raw technical errors become a sentence, the raw text the detail --------
  const raw =
    "Lobi bağlantısı geri yüklenemedi: could not establish signal connection: Failed to fetch (127.0.0.1:7880)";
  toast.open({ type: "warning", key: "ct-status", content: raw });
  const human = toast.getSnapshot().find((t) => t.key === "ct-status");
  assert.equal(human.title, "Lobi bağlantısı geri yüklenemedi");
  assert.equal(human.description, "Sunucuya ulaşılamıyor. Bağlantını kontrol et.");
  assert.equal(human.detail, raw);
  assert.deepEqual(humanizeError("Failed to fetch"), {
    title: "Bir şeyler ters gitti",
    description: "Sunucuya ulaşılamıyor. Bağlantını kontrol et.",
    detail: "Failed to fetch",
  });
  assert.equal(humanizeError("Mikrofon açılamadı: NotAllowedError").description, "İzin verilmedi.");
  assert.match(humanizeError("İstek zaman aşımına uğradı: timed out").description, /zamanında/);
  for (const plain of [
    "Ekran paylaşımı başladı",
    "Kullanıcı bulunamadı.",
    "Dosya en fazla 5 MB olabilir",
    "Lobi bağlantısı geri yüklenemedi: Bilinmeyen hata",
    "Ses cihazı çıkarıldı: Varsayılan cihaza geçildi",
  ]) {
    assert.equal(humanizeError(plain), null, `already human: ${plain}`);
  }
  toast.success("Bağlantı kuruldu: 127.0.0.1");
  assert.equal(toast.getSnapshot()[0].title, "Bağlantı kuruldu: 127.0.0.1", "only errors and warnings are rewritten");

  const beforeUnsubscribe = notified;
  unsubscribe();
  toast.info("sessiz");
  assert.equal(notified, beforeUnsubscribe, "an unsubscribed listener hears nothing");

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log("toast self-check passed");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
