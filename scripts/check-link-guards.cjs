#!/usr/bin/env node
// Self-check for the congestion reactions in
// src/renderer/src/features/livekit/services/stream/link-guards.ts.
//
// AUDIO GUARD  a screen share filling the uplink delays the voice queued behind
//              it. The guard cuts the share's bitrate ceiling when the
//              microphone's RTT climbs well above its floor, and gives it back
//              slowly once the voice is on time again.
//   - one late sample is not congestion; two in a row is
//   - the floor is the lowest recent RTT, including samples before the share
//   - cuts stop at a floor of the preset; restores stop at the preset
//   - not sharing resets the ceiling
//
// DOWNLINK     everybody arriving damaged at once is this machine's download.
//   - needs two people actually speaking; one cannot tell the two apart
//   - fires once per episode, after the dwell
//
//   node scripts/check-link-guards.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

const main = async () => {
  const { build } = await import("vite");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-link-guards-"));

  await build({
    root: projectRoot,
    logLevel: "error",
    // Not vite.config.ts: it carries the Sentry plugin, which would upload a
    // source map for this throwaway bundle on every check run.
    configFile: false,
    resolve: { alias: { "@shared": path.join(projectRoot, "src/shared") } },
    build: {
      outDir,
      emptyOutDir: true,
      ssr: true,
      lib: {
        entry: path.join(
          projectRoot,
          "src/renderer/src/features/livekit/services/stream/link-guards.ts",
        ),
        formats: ["es"],
        fileName: () => "link-guards.mjs",
      },
      rollupOptions: { external: ["electron"] },
    },
  });

  const guards = await import(pathToFileURL(path.join(outDir, "link-guards.mjs")).href);
  const {
    AUDIO_GUARD,
    AUDIO_GUARD_FLOOR_BPS,
    DOWNLINK,
    guardedBitrate,
    initialAudioGuard,
    stepAudioGuard,
    stepDownlink,
  } = guards;

  // Feeds RTT samples through the guard and returns the actions taken.
  const run = (samples, sharing = () => true, from = initialAudioGuard()) => {
    let state = from;
    const actions = [];
    samples.forEach((rtt, index) => {
      const step = stepAudioGuard(state, rtt, sharing(index));
      state = step.state;
      actions.push(step.action);
    });
    return { state, actions };
  };
  const calm = (n, rtt = 30) => Array.from({ length: n }, () => rtt);

  // --- audio guard ---------------------------------------------------------
  {
    const { state, actions } = run([...calm(5), 400]);
    assert.equal(state.factor, 1, "one late sample must not cut the share");
    assert.ok(actions.every((a) => a === null));
  }
  {
    const { state, actions } = run([...calm(5), 400, 400]);
    assert.equal(actions.at(-1), "throttle", "two late samples in a row must cut");
    assert.equal(state.factor, AUDIO_GUARD.cutFactor);
  }
  {
    // Inside the margin is not congestion.
    const margin = 30 + AUDIO_GUARD.rttMarginMs;
    const { state } = run([...calm(5), margin, margin, margin]);
    assert.equal(state.factor, 1, "an RTT at floor + margin is not queueing");
  }
  {
    // Sustained congestion cuts every triggerSamples and stops at the floor.
    const { state, actions } = run([...calm(5), ...calm(40, 600)]);
    assert.equal(state.factor, AUDIO_GUARD.minFactor, "cuts must stop at the floor");
    const cuts = actions.filter((a) => a === "throttle").length;
    assert.ok(cuts >= 3 && cuts <= 5, `expected a handful of cuts, got ${cuts}`);
  }
  {
    // Recovery: one step per restoreAfterSamples calm samples, up to 1.
    const congested = run([...calm(5), 600, 600, 600, 600]);
    assert.ok(congested.state.factor < 1);
    const recovered = run(calm(200), () => true, congested.state);
    assert.equal(recovered.state.factor, 1, "a calm link must get the whole preset back");
    const firstRestore = recovered.actions.indexOf("restore");
    assert.equal(
      firstRestore,
      AUDIO_GUARD.restoreAfterSamples - 1,
      "the first step back waits restoreAfterSamples calm samples",
    );
    assert.ok(
      recovered.actions.filter((a) => a === "restore").length <= Math.ceil(1 / AUDIO_GUARD.restoreStep),
      "restoring stops at the preset",
    );
  }
  {
    // The floor includes what the link looked like before the share started.
    const beforeShare = run(calm(10, 20), () => false);
    const { state } = run([120, 120], () => true, beforeShare.state);
    assert.equal(state.factor, AUDIO_GUARD.cutFactor, "the floor measured before sharing must count");
  }
  {
    // Stopping the share resets the ceiling.
    const congested = run([...calm(5), 600, 600]);
    const stopped = run([30], () => false, congested.state);
    assert.equal(stopped.state.factor, 1);
    assert.deepEqual(stopped.actions, [null], "not sharing takes no action");
  }
  {
    // No floor yet, or no sample: nothing to judge.
    assert.equal(run([500, 500]).state.factor, 1, "no floor before minBaselineSamples");
    assert.equal(run([...calm(5), null, null]).state.factor, 1, "a missing sample is not a late one");
  }
  {
    assert.equal(guardedBitrate(4_000_000, 0.5), 2_000_000);
    assert.equal(guardedBitrate(4_000_000, 1), 4_000_000, "never above the preset");
    assert.equal(guardedBitrate(400_000, 0.25), AUDIO_GUARD_FLOOR_BPS, "never below the floor");
    assert.equal(guardedBitrate(100_000, 0.25), 100_000, "a layer under the floor keeps its own cap");
  }

  // --- downlink --------------------------------------------------------------
  const speaking = (identity, packetLossPct) => ({ identity, packetLossPct, bitrateBps: 48_000 });
  const silent = (identity, packetLossPct) => ({ identity, packetLossPct, bitrateBps: 2_000 });
  const lossy = DOWNLINK.lossPct + 2;

  const episode = (samples) => {
    let streak = 0;
    return samples.map((remotes) => {
      const step = stepDownlink(streak, remotes);
      streak = step.streak;
      return step;
    });
  };

  {
    const steps = episode([
      [speaking("a", lossy), speaking("b", lossy)],
      [speaking("a", lossy), speaking("b", lossy)],
      [speaking("a", lossy), speaking("b", lossy)],
    ]);
    assert.deepEqual(steps.map((s) => s.started), [false, true, false], "fires once, after the dwell");
    assert.deepEqual(steps.map((s) => s.active), [false, true, true]);
  }
  assert.equal(
    episode([[speaking("a", lossy)], [speaking("a", lossy)]]).some((s) => s.active),
    false,
    "one remote cannot tell its uplink from this downlink",
  );
  assert.equal(
    episode([
      [speaking("a", lossy), speaking("b", 0)],
      [speaking("a", lossy), speaking("b", 0)],
    ]).some((s) => s.active),
    false,
    "one damaged remote among healthy ones is that remote's uplink",
  );
  assert.equal(
    episode([
      [speaking("a", lossy), silent("b", lossy)],
      [speaking("a", lossy), silent("b", lossy)],
    ]).some((s) => s.active),
    false,
    "a silent track's loss is noise and must not count as a second witness",
  );
  {
    const steps = episode([
      [speaking("a", lossy), speaking("b", lossy)],
      [speaking("a", 0), speaking("b", 0)],
      [speaking("a", lossy), speaking("b", lossy)],
      [speaking("a", lossy), speaking("b", lossy)],
    ]);
    assert.deepEqual(steps.map((s) => s.started), [false, false, false, true], "a gap restarts the dwell");
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log("link-guards self-check passed (audio guard and downlink diagnosis)");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
