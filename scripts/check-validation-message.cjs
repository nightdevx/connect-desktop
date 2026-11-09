#!/usr/bin/env node
// Self-check for describeValidationError in src/shared/validation-message.ts.
//
// A zod failure used to reach a toast as the issue list in JSON. This feeds the
// real schema shapes the admin panel uses through it and requires a sentence.
//
//   node scripts/check-validation-message.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

const main = async () => {
  const { build } = await import("vite");
  const { z } = require("zod");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-validation-message-"));

  await build({
    root: projectRoot,
    logLevel: "error",
    configFile: false,
    build: {
      outDir,
      emptyOutDir: true,
      ssr: true,
      lib: {
        entry: path.join(projectRoot, "src/shared/validation-message.ts"),
        formats: ["es"],
        fileName: () => "validation-message.mjs",
      },
    },
  });

  const { describeValidationError } = await import(
    pathToFileURL(path.join(outDir, "validation-message.mjs")).href
  );

  const failure = (schema, value) => {
    const result = schema.safeParse(value);
    assert.equal(result.success, false);
    return describeValidationError(result.error);
  };

  assert.equal(failure(z.object({ reason: z.string().min(1) }), { reason: "" }), "Gerekçe boş olamaz.");
  assert.equal(
    failure(z.object({ reason: z.string().min(3) }), { reason: "ab" }),
    "Gerekçe en az 3 karakter olmalı.",
  );
  assert.equal(
    failure(z.object({ name: z.string().max(4) }), { name: "uzunad" }),
    "Ad en fazla 4 karakter olabilir.",
  );
  assert.equal(
    failure(z.object({ email: z.string().email() }), { email: "x" }),
    "Geçerli bir e-posta adresi gir.",
  );
  assert.equal(
    failure(z.object({ maxUses: z.number().int().min(1) }), { maxUses: 0 }),
    "Kullanım sayısı en az 1 olmalı.",
  );
  // A key nobody labelled, and a wrong type: still a sentence, never JSON.
  const unknown = failure(z.object({ weird: z.string() }), {});
  assert.equal(unknown, "Girilen bilgi geçersiz.");
  assert.equal(describeValidationError(new Error("boom")), null);
  assert.equal(describeValidationError("boom"), null);

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log("check-validation-message: ok");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
