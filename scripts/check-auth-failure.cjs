#!/usr/bin/env node
// Self-check for src/main/auth-failure.ts.
//
// These two predicates decide whether a user keeps their session. Both fail
// silently, in opposite directions:
//
//   * isSessionFatal too broad => a timeout in a tunnel signs the user out.
//     Too narrow => the app stays mounted behind a session the server has
//     already destroyed, every request failing, which is the bug this whole
//     change set exists to fix.
//   * statusFromSocketError missing the 401 => the websocket layer never
//     refreshes, and retries with an expired token until the app restarts.
//
//   node scripts/check-auth-failure.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

const main = async () => {
  const { build } = await import("vite");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-auth-failure-"));

  await build({
    root: projectRoot,
    logLevel: "error",
    // Not vite.config.ts: it carries the Sentry plugin, which would upload a
    // source map for this throwaway bundle on every check run.
    configFile: false,
    build: {
      outDir,
      emptyOutDir: true,
      ssr: true,
      lib: {
        entry: path.join(projectRoot, "src/main/auth-failure.ts"),
        formats: ["es"],
        fileName: () => "auth-failure.mjs",
      },
    },
  });

  // DesktopApiError comes from the bundle too: instanceof between two copies of
  // the same class is silently always false, which would make every error look
  // non-fatal and every assertion below pass for the wrong reason.
  const { isSessionFatal, statusFromSocketError, DesktopApiError } =
    await import(pathToFileURL(path.join(outDir, "auth-failure.mjs")).href);

  assert.equal(typeof DesktopApiError, "function", "DesktopApiError re-export");

  // --- isSessionFatal ------------------------------------------------------
  const fatal = [
    new DesktopApiError("INVALID_REFRESH_TOKEN", 401, "invalid or already used"),
    new DesktopApiError("SESSION_REVOKED", 401, "session has been revoked"),
    new DesktopApiError("UNAUTHORIZED", 401, "no active session"),
    new DesktopApiError("USER_BANNED", 403, "banned"),
    new DesktopApiError("ACCOUNT_DEACTIVATED", 403, "deactivated"),
  ];
  for (const error of fatal) {
    assert.equal(
      isSessionFatal(error),
      true,
      `${error.code}/${error.statusCode} must end the session`,
    );
  }

  const transient = [
    new DesktopApiError("REQUEST_TIMEOUT", 504, "timed out"),
    new DesktopApiError("BACKEND_UNREACHABLE", 503, "unreachable"),
    new DesktopApiError("REFRESH_TOKEN_LOOKUP_FAILED", 500, "server fault"),
    new DesktopApiError("RATE_LIMITED", 429, "slow down"),
    new DesktopApiError("FORBIDDEN", 403, "not yours"),
    new Error("boom"),
    null,
    undefined,
  ];
  for (const error of transient) {
    assert.equal(
      isSessionFatal(error),
      false,
      `${error?.code ?? error} must NOT end the session`,
    );
  }

  // 403 alone is not fatal — only the two account-state codes are. Getting this
  // wrong signs a user out for touching one endpoint they lack rights to.
  assert.equal(
    isSessionFatal(new DesktopApiError("LOBBY_FORBIDDEN", 403, "nope")),
    false,
  );

  // --- statusFromSocketError ----------------------------------------------
  assert.equal(
    statusFromSocketError("Unexpected server response: 401"),
    401,
    "a rejected upgrade must surface as 401 so withAccessToken refreshes",
  );
  assert.equal(statusFromSocketError("Unexpected server response: 403"), 403);
  assert.equal(statusFromSocketError("Unexpected server response: 502"), 502);
  assert.equal(
    statusFromSocketError("connect ECONNREFUSED 127.0.0.1:4001"),
    503,
    "a real transport failure keeps the old 503",
  );
  assert.equal(statusFromSocketError(undefined), 503);
  assert.equal(statusFromSocketError(""), 503);

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log("auth-failure self-check passed");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
