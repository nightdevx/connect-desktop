#!/usr/bin/env node
// Acceptance check for how fast a dropped call comes back (plan F1.5).
//
// Field data, two drops (2026-11-23, 2026-11-24): the server closes a silent
// participant ~15 s after its ICE goes quiet, and every resume after that is
// refused. livekit-client 2.22.4 then waits its default table between tries
// (0, 0.3, 1.2, 2.7, 4.8, then 7 s, plus up to 1 s of jitter), so the call came
// back 5.5 and 11 s after the network did. Each try against a dead network is
// already bounded by the 6 s websocket timeout; the wait between tries only
// adds to the silence once the network is back. What must hold:
//
//   FIRST    the first retry is immediate, the second within half a second.
//   CAP      no wait between tries is longer than 2 s (+ 0.3 s jitter).
//   SAME     the SDK still gives up after about as long as before (80-110 s
//            with a dead network, measured from the first drop), so the app's
//            own rejoin takes over at the same point as today.
//   NO SPIN  tries that fail instantly do not hammer the server: at most 60
//            tries before giving up.
//   WIRED    the Room is built with this policy.
//
//   node scripts/check-reconnect-policy.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");
const streamDir = path.join(projectRoot, "src/renderer/src/features/livekit/services/stream");
const entry = path.join(streamDir, "reconnect-policy.ts");

// Plays livekit-client's loop: ask for a delay, wait it, try (attemptMs), repeat
// until the policy returns null. elapsedMs runs from the first disconnect.
const simulate = (policy, attemptMs) => {
  let elapsedMs = 0;
  const waits = [];
  for (let retryCount = 0; retryCount < 1000; retryCount += 1) {
    const delay = policy.nextRetryDelayInMs({ retryCount, elapsedMs });
    if (delay === null) {
      return { waits, tries: retryCount, gaveUpAtMs: elapsedMs };
    }
    assert.ok(Number.isFinite(delay) && delay >= 0, `retry ${retryCount}: delay ${delay} is not a number of ms`);
    waits.push(delay);
    elapsedMs += delay + attemptMs;
  }
  assert.fail("the policy never gives up");
};

const main = async () => {
  assert.ok(fs.existsSync(entry), "reconnect-policy.ts is missing");
  const { build } = await import("vite");
  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-reconnect-policy-"));
  await build({
    root: projectRoot,
    logLevel: "error",
    configFile: false,
    build: {
      outDir,
      emptyOutDir: true,
      ssr: true,
      lib: { entry, formats: ["es"], fileName: () => "reconnect-policy.mjs" },
      rollupOptions: { external: ["livekit-client"] },
    },
  });
  const built = fs.readdirSync(outDir).find((f) => f.endsWith(".mjs"));
  const { RECONNECT_POLICY: policy } = await import(pathToFileURL(path.join(outDir, built)).href);
  assert.equal(typeof policy?.nextRetryDelayInMs, "function", "RECONNECT_POLICY.nextRetryDelayInMs is not exported");

  for (let trial = 0; trial < 300; trial += 1) {
    const dead = simulate(policy, 6_000); // every try runs into the 6 s socket timeout
    const refused = simulate(policy, 150); // every try is refused at once (server already closed us)

    for (const run of [dead, refused]) {
      assert.equal(run.waits[0], 0, "FIRST: the first retry must be immediate");
      assert.ok(run.waits[1] <= 500, `FIRST: the second retry waited ${run.waits[1]} ms`);
      const longest = Math.max(...run.waits);
      assert.ok(longest <= 2_300, `CAP: a wait of ${longest} ms between tries`);
    }
    assert.ok(dead.gaveUpAtMs >= 80_000 && dead.gaveUpAtMs <= 110_000,
      `SAME: with a dead network the SDK gave up after ${dead.gaveUpAtMs} ms (today ~100 s)`);
    assert.ok(refused.gaveUpAtMs >= 80_000 && refused.gaveUpAtMs <= 110_000,
      `SAME: with refused tries the SDK gave up after ${refused.gaveUpAtMs} ms`);
    assert.ok(refused.tries <= 60, `NO SPIN: ${refused.tries} tries before giving up`);
  }

  // Jitter is there, so many clients dropped by one server restart do not come back in lockstep.
  const thirds = new Set(Array.from({ length: 50 }, () => policy.nextRetryDelayInMs({ retryCount: 5, elapsedMs: 10_000 })));
  assert.ok(thirds.size > 5, "the waits must carry some jitter");

  // WIRED: the Room gets the policy.
  const manager = fs.readFileSync(path.join(streamDir, "stream-manager.ts"), "utf8");
  assert.match(manager, /import\s*\{[^}]*\bRECONNECT_POLICY\b[^}]*\}\s*from\s*["']\.\/reconnect-policy["']/, "WIRED: stream-manager.ts does not import RECONNECT_POLICY");
  assert.match(manager, /reconnectPolicy:\s*RECONNECT_POLICY/, "WIRED: the Room options must set reconnectPolicy: RECONNECT_POLICY");

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log("reconnect-policy check passed (first retry at once, waits capped at 2 s, gives up after ~100 s as before, no spinning, wired into the Room)");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
