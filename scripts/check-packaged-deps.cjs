#!/usr/bin/env node
// Verifies every dependency declared inside the packed asar is actually in it.
// Run after `pnpm dist:win`:
//   node scripts/check-packaged-deps.cjs
//
// Why this exists: 0.1.28 passed CI and then died on first launch with
// "Cannot find module 'ms'". electron-builder had flattened pnpm's isolated
// store and silently dropped ten transitive dependencies -- debug/src/common.js
// was packed, the ms it requires was not. Nothing in the pipeline noticed,
// because the installer built fine and latest.yml looked correct.
//
// ponytail: static require-graph check, not a real launch. It catches a package
// missing from the archive, which is the failure that shipped. If a dynamic
// require or an optional-at-install dep bites later, boot the packaged binary
// in CI instead.

const path = require("node:path");
const fs = require("node:fs");
const asar = require("@electron/asar");

const archivePath =
  process.argv[2] ??
  path.join(__dirname, "..", "release", "win-unpacked", "resources", "app.asar");

if (!fs.existsSync(archivePath)) {
  console.error(
    `No asar at ${archivePath}. Run "pnpm dist:win" first, or pass the path as an argument.`,
  );
  process.exit(1);
}

// listPackage returns paths with the platform separator, and extractFile wants
// them back in that same form, so normalise only for matching.
const entries = asar.listPackage(archivePath);
const toPosix = (entry) => entry.replace(/\\/g, "/");
const present = new Set(entries.map(toPosix));

const PACKAGE_MANIFEST = /^\/node_modules\/(@[^/]+\/)?[^/]+\/package\.json$/;
const manifests = entries.filter((entry) => PACKAGE_MANIFEST.test(toPosix(entry)));

const nameOf = (entry) =>
  toPosix(entry).slice("/node_modules/".length, -"/package.json".length);

const packaged = new Set(manifests.map(nameOf));

const missing = new Map();
for (const manifest of manifests) {
  let parsed;
  try {
    parsed = JSON.parse(
      asar.extractFile(archivePath, manifest.slice(1)).toString("utf8"),
    );
  } catch (error) {
    console.error(`Could not read ${toPosix(manifest)}: ${error.message}`);
    process.exitCode = 1;
    continue;
  }

  const owner = nameOf(manifest);
  for (const dep of Object.keys(parsed.dependencies ?? {})) {
    // A nested copy satisfies the require just as well as a hoisted one.
    if (present.has(`/node_modules/${owner}/node_modules/${dep}/package.json`)) {
      continue;
    }
    if (packaged.has(dep)) {
      continue;
    }
    if (!missing.has(dep)) {
      missing.set(dep, []);
    }
    missing.get(dep).push(owner);
  }
}

if (missing.size > 0) {
  console.error(
    `\n${missing.size} dependency/dependencies declared but absent from ${archivePath}:`,
  );
  for (const [dep, owners] of [...missing].sort()) {
    console.error(`  ${dep}  required by ${owners.join(", ")}`);
  }
  console.error(
    "\nThe installer would crash on launch. Check that nodeLinker: hoisted is\n" +
      "still set in pnpm-workspace.yaml and that node_modules was installed with it.",
  );
  process.exit(1);
}

console.log(
  `check-packaged-deps: ${packaged.size} packages in the asar, no missing dependencies.`,
);
