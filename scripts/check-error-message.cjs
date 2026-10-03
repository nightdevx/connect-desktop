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

  const { toErrorMessage, isTransientApiError, TRANSIENT_API_ERROR_MESSAGE } =
    await import(pathToFileURL(path.join(outDir, "error-message.mjs")).href);

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

  // --- a request that never got an answer ------------------------------------
  // The main process's timeout and transport errors, and the proxy's 502-504
  // during a deploy: transient, said plainly, never with a URL in it.
  const timeout = { code: "REQUEST_TIMEOUT", statusCode: 504, message: "Sunucu yanıt vermedi." };
  for (const error of [
    timeout,
    { code: "BACKEND_UNREACHABLE", statusCode: 503, message: "Sunucuya bağlanılamadı." },
    { code: "REQUEST_FAILED", statusCode: 502, message: "Bad Gateway" },
    { code: "REQUEST_FAILED", statusCode: 503, message: "x" },
  ]) {
    assert.ok(isTransientApiError(error), `${error.code} ${error.statusCode} is transient`);
  }
  for (const error of [
    undefined,
    { code: "REQUEST_FAILED", statusCode: 500, message: "a server bug is not a blip" },
    { code: "FORBIDDEN", statusCode: 403, message: "x" },
    { code: "LOBBY_FULL", statusCode: 409, message: "Oda dolu" },
  ]) {
    assert.ok(!isTransientApiError(error), `${JSON.stringify(error)} is not transient`);
  }
  assert.equal(toErrorMessage(timeout, FALLBACK), TRANSIENT_API_ERROR_MESSAGE);
  assert.ok(!/https?:|yeniden deneniyor/.test(TRANSIENT_API_ERROR_MESSAGE), "no URL, and no promise of a retry a one-shot action does not make");

  // --- the lobby views: thrown, so the last good answer stays and is retried --
  const queryOut = fs.mkdtempSync(path.join(cacheRoot, "ct-query-client-"));
  await build({
    root: projectRoot,
    logLevel: "error",
    configFile: false,
    resolve: { alias: { "@shared": path.join(projectRoot, "src", "shared") } },
    build: {
      outDir: queryOut,
      emptyOutDir: true,
      ssr: true,
      lib: {
        entry: path.join(projectRoot, "src/renderer/src/services/query-client.ts"),
        formats: ["es"],
        fileName: () => "query-client.mjs",
      },
      rollupOptions: { external: ["@tanstack/react-query"] },
    },
  });
  const { queryClient, throwIfTransient, TransientQueryError } = await import(
    pathToFileURL(path.join(queryOut, "query-client.mjs")).href
  );
  const good = { ok: true, data: [1] };
  assert.equal(throwIfTransient(good), good);
  const refused = { ok: false, error: { code: "FORBIDDEN", statusCode: 403, message: "x" } };
  assert.equal(throwIfTransient(refused), refused, "a refusal is an answer, shown as before");
  assert.throws(
    () => throwIfTransient({ ok: false, error: timeout }),
    (error) => error instanceof TransientQueryError && /yeniden deneniyor/.test(error.message),
    "a timeout is thrown, which keeps the last good data and earns retries",
  );
  const retry = queryClient.getDefaultOptions().queries.retry;
  assert.deepEqual(
    [0, 1, 2, 3].map((count) => retry(count, new TransientQueryError("x"))),
    [true, true, true, false],
    "three more tries for a request that never got an answer",
  );
  assert.deepEqual([0, 1].map((count) => retry(count, new Error("x"))), [true, false], "one for anything else, as before");
  fs.rmSync(queryOut, { recursive: true, force: true });

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log("error-message self-check passed (shapes, transient failures, lobby query retries)");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
