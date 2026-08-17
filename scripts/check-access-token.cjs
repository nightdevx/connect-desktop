#!/usr/bin/env node
// Self-check for src/main/access-token.ts.
//
// These predicates decide when the session refreshes. Both directions are
// silent failures that only show up in production:
//
//   * too eager (or a decode that throws) => a refresh on every request, and
//     the refresh token is single-use, so the store churns a new pair per call.
//   * too lax (exp misread, base64url mishandled) => the proactive refresh
//     never fires and every expiry costs the user an extra round trip, which
//     is the thing it exists to remove.
//
//   node scripts/check-access-token.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

// A JWT the backend would issue: header.payload.signature, base64url, no pad.
const b64url = (value) =>
  Buffer.from(JSON.stringify(value), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const token = (payload) =>
  `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.c2ln`;

const main = async () => {
  const { build } = await import("vite");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-access-token-"));

  await build({
    root: projectRoot,
    logLevel: "error",
    configFile: false,
    build: {
      outDir,
      emptyOutDir: true,
      ssr: true,
      lib: {
        entry: path.join(projectRoot, "src/main/access-token.ts"),
        formats: ["es"],
        fileName: () => "access-token.mjs",
      },
    },
  });

  const {
    accessTokenExpiryMs,
    isAccessTokenExpiring,
    isAccessTokenExpired,
    ACCESS_TOKEN_REFRESH_SKEW_MS,
  } = await import(pathToFileURL(path.join(outDir, "access-token.mjs")).href);

  const now = 1_800_000_000_000;
  const at = (offsetMs) => token({ sub: "u1", exp: (now + offsetMs) / 1000 });

  // --- accessTokenExpiryMs -------------------------------------------------
  assert.equal(
    accessTokenExpiryMs(at(15 * 60_000)),
    now + 15 * 60_000,
    "exp is seconds in the token and milliseconds out",
  );

  // base64url: a payload whose base64 contains - and _ must still decode. This
  // is the case that silently returns null with a plain "base64" decode, which
  // would disable the proactive refresh for a subset of users and nobody else.
  const trickyPayload = { sub: "þÿþÿ", exp: now / 1000 };
  const encoded = b64url(trickyPayload);
  assert.ok(
    /[-_]/.test(encoded),
    "fixture must actually exercise the base64url alphabet",
  );
  assert.equal(
    accessTokenExpiryMs(`${b64url({ alg: "HS256" })}.${encoded}.sig`),
    now,
  );

  // No opinion rather than a wrong one: anything unparseable keeps the caller
  // on the old reactive-401 path instead of refreshing forever.
  for (const bad of [
    "",
    "not-a-jwt",
    "only.two",
    "a.b.c.d",
    `${b64url({ alg: "none" })}.${b64url({ sub: "u1" })}.sig`, // no exp
    `${b64url({ alg: "none" })}.${b64url({ sub: "u1", exp: "soon" })}.sig`,
    `${b64url({ alg: "none" })}.bm90LWpzb24.sig`, // decodes, isn't JSON
    `${b64url({ alg: "none" })}.${b64url({ exp: Number.POSITIVE_INFINITY })}.s`,
  ]) {
    assert.equal(accessTokenExpiryMs(bad), null, `must be null: ${bad}`);
  }

  // --- the two predicates --------------------------------------------------
  assert.equal(ACCESS_TOKEN_REFRESH_SKEW_MS, 60_000);

  assert.equal(
    isAccessTokenExpiring(at(15 * 60_000), now),
    false,
    "a fresh 15-minute token must not trigger a refresh",
  );
  assert.equal(
    isAccessTokenExpiring(at(ACCESS_TOKEN_REFRESH_SKEW_MS + 1_000), now),
    false,
    "just outside the skew window",
  );
  assert.equal(
    isAccessTokenExpiring(at(ACCESS_TOKEN_REFRESH_SKEW_MS), now),
    true,
    "the skew boundary itself refreshes",
  );
  assert.equal(isAccessTokenExpiring(at(-1), now), true, "already expired");
  assert.equal(
    isAccessTokenExpiring("not-a-jwt", now),
    false,
    "an undecodable token must not refresh on every call",
  );

  assert.equal(
    isAccessTokenExpired(at(30_000), now),
    false,
    "inside the skew window but still valid: a failed refresh is survivable",
  );
  assert.equal(isAccessTokenExpired(at(0), now), true);
  assert.equal(isAccessTokenExpired(at(-1_000), now), true);
  assert.equal(isAccessTokenExpired("not-a-jwt", now), false);

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log("access-token self-check passed");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
