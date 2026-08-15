#!/usr/bin/env node
// Self-check for describeAuthError in
// src/renderer/src/features/auth/auth-error-messages.ts.
//
// The failure this guards against is silent by construction: rename an error
// code in the Go backend, forget the map here, and every user hitting that case
// gets "Bilinmeyen bir hata oluştu" instead of the reason. Nothing throws,
// nothing fails to compile, and it looks fine in every screenshot.
//
// The list below is the set of codes the backend can actually return from
// POST /auth/login and POST /auth/register, read off internal/auth/service.go.
// When the backend gains a code, it goes here and in the map, together.
//
//   node scripts/check-auth-messages.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

// Every code that can reach the two forms. Split by which form raises it, since
// describeAuthError takes the form as context.
const LOGIN_CODES = [
  "INVALID_CREDENTIALS",
  "USER_BANNED",
  "ACCOUNT_DEACTIVATED",
  "AUTH_PERSISTENCE_ERROR",
  "TOKEN_ISSUE_FAILED",
  "TOKEN_STORE_FAILED",
  "TOO_MANY_REQUESTS",
  "VALIDATION_ERROR",
];

const REGISTER_CODES = [
  "INVALID_EMAIL",
  "INVALID_USERNAME",
  "USERNAME_RESERVED",
  "INVALID_PASSWORD",
  "USERNAME_ALREADY_EXISTS",
  "EMAIL_ALREADY_EXISTS",
  "USER_CREATE_FAILED",
  "USER_LOOKUP_FAILED",
  "HASH_FAILED",
  "TOO_MANY_REQUESTS",
  "VALIDATION_ERROR",
];

// Raised by base-client before the backend is ever reached.
const TRANSPORT_CODES = [
  "BACKEND_UNREACHABLE",
  "REQUEST_TIMEOUT",
  "REQUEST_FAILED",
  "UNEXPECTED_ERROR",
];

const UNKNOWN_TITLE = "Bilinmeyen hata";

// These messages were rewritten once because they had grown into paragraphs
// nobody finishes reading. The limits keep that from creeping back.
const MAX_TITLE = 40;
const MAX_DETAIL = 70;
const MAX_HINT = 70;

const main = async () => {
  const { build } = await import("vite");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-auth-messages-"));

  await build({
    root: projectRoot,
    logLevel: "error",
    // Not vite.config.ts: it carries the Sentry plugin, which would upload a
    // source map for this throwaway bundle on every check run.
    configFile: false,
    resolve: {
      alias: { "@shared": path.join(projectRoot, "src", "shared") },
    },
    build: {
      outDir,
      emptyOutDir: true,
      ssr: true,
      lib: {
        entry: path.join(
          projectRoot,
          "src/renderer/src/features/auth/auth-error-messages.ts",
        ),
        formats: ["es"],
        fileName: () => "auth-error-messages.mjs",
      },
    },
  });

  const bundle = path.join(outDir, "auth-error-messages.mjs");
  const { describeAuthError } = await import(pathToFileURL(bundle).href);

  const describe = (code, context, statusCode = 400) =>
    describeAuthError({ code, message: "", statusCode }, context);

  // --- every real code says something specific ------------------------------
  for (const [codes, context] of [
    [LOGIN_CODES, "login"],
    [REGISTER_CODES, "register"],
    [TRANSPORT_CODES, "login"],
    [TRANSPORT_CODES, "register"],
  ]) {
    for (const code of codes) {
      const info = describe(code, context, code.startsWith("USER_C") ? 500 : 400);
      assert.ok(info, `${code} (${context}) returned nothing`);
      assert.notEqual(
        info.title,
        UNKNOWN_TITLE,
        `${code} on the ${context} form falls through to the unknown-error text — add it to the map`,
      );
      assert.ok(
        info.detail && info.detail.length > 15,
        `${code} (${context}) has no real explanation, only a title`,
      );
      assert.ok(
        info.title.length <= MAX_TITLE,
        `${code} (${context}) title is ${info.title.length} chars, max ${MAX_TITLE}`,
      );
      assert.ok(
        info.detail.length <= MAX_DETAIL,
        `${code} (${context}) detail is ${info.detail.length} chars, max ${MAX_DETAIL} — say it in one short sentence`,
      );
      assert.ok(
        !info.hint || info.hint.length <= MAX_HINT,
        `${code} (${context}) hint is ${(info.hint || "").length} chars, max ${MAX_HINT}`,
      );
      assert.equal(
        typeof info.retryable,
        "boolean",
        `${code} (${context}) must say whether retrying can help`,
      );
    }
  }

  // --- the field-marking contract -------------------------------------------
  // A message that names a field is used to mark that input; one that does not
  // shows the error code instead. Both halves have to keep working.
  assert.equal(describe("USERNAME_ALREADY_EXISTS", "register").field, "username");
  assert.equal(describe("EMAIL_ALREADY_EXISTS", "register").field, "email");
  assert.equal(describe("INVALID_PASSWORD", "register").field, "password");
  assert.equal(describe("USERNAME_RESERVED", "register").field, "username");
  assert.equal(
    describe("BACKEND_UNREACHABLE", "login").field,
    undefined,
    "a transport failure blames no field — nothing the user typed is at fault",
  );

  // --- reserved is NOT the same message as malformed -------------------------
  // Both were INVALID_USERNAME once, which told someone whose name was merely
  // reserved to fix characters and length that were already correct.
  assert.notEqual(
    describe("USERNAME_RESERVED", "register").detail,
    describe("INVALID_USERNAME", "register").detail,
    "reserved and malformed usernames must not share one explanation",
  );

  // --- login must not leak which half was wrong ------------------------------
  const credentials = describe("INVALID_CREDENTIALS", "login");
  assert.ok(
    !/kullanıcı (adı )?bulunamadı|böyle bir (kullanıcı|hesap)|hesap yok/i.test(
      credentials.title + credentials.detail,
    ),
    "the sign-in message must not reveal whether the account exists",
  );

  // --- unrecoverable states are marked as such -------------------------------
  assert.equal(describe("USER_BANNED", "login").retryable, false);
  assert.equal(describe("BACKEND_UNREACHABLE", "login").retryable, true);

  // --- anything unrecognised still degrades to a usable Turkish message ------
  const unknown = describe("A_CODE_THAT_DOES_NOT_EXIST", "login", 400);
  assert.equal(unknown.title, UNKNOWN_TITLE);
  const serverish = describe("SOME_NEW_INTERNAL_FAILURE", "login", 500);
  assert.notEqual(
    serverish.title,
    UNKNOWN_TITLE,
    "an unmapped 5xx should still be explained as a server-side fault",
  );

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log("auth-messages self-check passed");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
