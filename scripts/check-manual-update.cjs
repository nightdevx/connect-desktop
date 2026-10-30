#!/usr/bin/env node
// Self-check for the macOS update path in src/shared/update-contracts.ts. Run
// after `pnpm build:main` (reads the compiled CommonJS output):
//   node scripts/check-manual-update.cjs
//
// The macOS build is not signed with a Developer ID, so Squirrel.Mac would
// refuse to install anything: there the updater only finds the release and
// "İndir" opens its page in the browser (modular-updater.ts). Two things must
// hold. Windows never takes that path. And the page opened is always one of
// this repository's releases: the version comes from the update feed, and
// shell.openExternal hands whatever it gets to the OS.

const assert = require("node:assert/strict");
const path = require("node:path");

const modulePath = path.join(__dirname, "..", "dist", "shared", "update-contracts.js");
let contracts;
try {
  contracts = require(modulePath);
} catch (error) {
  console.error(`Could not load ${modulePath}. Run "pnpm build:main" first.\n${error.message}`);
  process.exit(1);
}
const { usesManualUpdates, releasePageUrl, isReleasePageUrl } = contracts;

assert.equal(usesManualUpdates("darwin"), true);
assert.equal(usesManualUpdates("win32"), false, "Windows downloads and installs in place");
assert.equal(usesManualUpdates("linux"), false);

assert.equal(
  releasePageUrl("0.3.1"),
  "https://github.com/nightdevx/connect-desktop/releases/tag/v0.3.1",
);
assert.equal(
  releasePageUrl(null),
  "https://github.com/nightdevx/connect-desktop/releases/latest",
  "no version yet: the newest release",
);
assert.ok(isReleasePageUrl(releasePageUrl("0.3.1")));
assert.ok(isReleasePageUrl(releasePageUrl(null)));

// A hostile version string from a tampered feed stays a release page.
for (const version of ["../../../evil", "1.0.0/../../../../evil", "1.0.0?x=https://evil.example", "1.0.0#frag"]) {
  const url = releasePageUrl(version);
  assert.ok(isReleasePageUrl(url), `${version} escaped the releases path: ${url}`);
  assert.ok(
    new URL(url).pathname.startsWith("/nightdevx/connect-desktop/releases/tag/"),
    `${version} left the tag pages: ${url}`,
  );
}

for (const url of [
  "http://github.com/nightdevx/connect-desktop/releases/latest",
  "https://github.com.evil.example/nightdevx/connect-desktop/releases/latest",
  "https://github.com@evil.example/nightdevx/connect-desktop/releases/latest",
  "https://user@github.com/nightdevx/connect-desktop/releases/latest",
  "https://github.com/nightdevx/connect-desktop/releases/../../other/releases/latest",
  "https://github.com/nightdevx/connect-desktop-fork/releases/latest",
  "https://github.com/nightdevx/connect-desktop/releases",
  "https://github.com:8443/nightdevx/connect-desktop/releases/latest",
  "file:///Applications/Connect.app",
  "x-apple.systempreferences:com.apple.preference.security",
  "not a url",
]) {
  assert.equal(isReleasePageUrl(url), false, `${url} must not be opened`);
}

console.log("check-manual-update: ok");
