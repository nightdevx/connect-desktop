#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

async function main() {
  const { build } = await import("vite");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-backend-recovery-"));

  await build({
    root: projectRoot,
    logLevel: "error",
    configFile: false,
    build: {
      outDir,
      emptyOutDir: true,
      ssr: true,
      lib: {
        entry: path.join(
          projectRoot,
          "src/renderer/src/features/workspace/hooks/core/backend-recovery.ts",
        ),
        formats: ["es"],
        fileName: () => "backend-recovery.mjs",
      },
    },
  });

  const { createRecoveryTracker, RECOVERY_COOLDOWN_MS } = await import(
    pathToFileURL(path.join(outDir, "backend-recovery.mjs")).href
  );

  {
    const tracker = createRecoveryTracker();
    assert.equal(
      tracker.observe("connected", 1_000),
      false,
      "a first connect refetched everything -- the data had just been fetched",
    );
  }

  {
    const tracker = createRecoveryTracker();
    assert.equal(tracker.observe("connected", 0), false);
    assert.equal(tracker.observe("closed", 1_000), false, "a drop refetches nothing on its own");
    assert.equal(
      tracker.observe("connected", 2_000),
      true,
      "a socket that came back after dropping did not refresh anything",
    );
  }

  {
    const tracker = createRecoveryTracker();
    tracker.observe("closed", 0);
    assert.equal(tracker.observe("connected", 100), true);

    tracker.observe("closed", 200);
    assert.equal(
      tracker.observe("connected", 300),
      false,
      "three sockets coming back together refetched everything three times",
    );

    tracker.observe("closed", 10_000);
    assert.equal(
      tracker.observe("connected", 10_100),
      true,
      "a later outage was swallowed by the cooldown of the one before it",
    );
  }

  {
    const tracker = createRecoveryTracker();
    tracker.observe("closed", 0);
    assert.equal(tracker.observe("connected", 100), true);
    assert.equal(
      tracker.observe("connected", 20_000),
      false,
      "a reconnect with no drop before it refetched everything",
    );
  }

  {
    const tracker = createRecoveryTracker();
    tracker.observe("closed", 0);
    tracker.observe("closed", 10);
    tracker.observe("closed", 20);
    assert.equal(
      tracker.observe("connected", 30),
      true,
      "several sockets dropping is still one outage",
    );
  }

  assert.ok(
    RECOVERY_COOLDOWN_MS >= 1_000,
    "the cooldown has to outlast a reconnect storm, not a single frame",
  );

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log("backend-recovery self-check passed (first connect, drop, storm, later outage)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
