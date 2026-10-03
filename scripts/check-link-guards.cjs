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
// ENCODER GUARD  which encoder limitations change anything.
//   - CPU: a screen share steps down after the dwell, once per episode
//   - bandwidth: never a step-down (the encoder adapts by itself); one note
//     per share after a minute
//   - recovery counts any tick without a CPU limit while sharing
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
    ENCODER_GUARD,
    guardedBitrate,
    initialAudioGuard,
    initialEncoderGuard,
    stepAudioGuard,
    stepDownlink,
    stepEncoderGuard,
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

  // --- encoder guard ---------------------------------------------------------
  // Feeds limitations through the guard; sharing is true unless said otherwise.
  const guard = (limitations, sharing = () => true, from = initialEncoderGuard()) => {
    let state = from;
    const actions = [];
    limitations.forEach((limitation, index) => {
      const step = stepEncoderGuard(state, limitation, sharing(index));
      state = step.state;
      actions.push(step.action);
    });
    return { state, actions };
  };
  const times = (n, value) => Array.from({ length: n }, () => value);
  const only = (actions) => actions.filter((a) => a !== null);

  {
    // CPU: nothing before the dwell, a step-down on it, then quiet while it lasts.
    const { actions } = guard(times(ENCODER_GUARD.cpuTicks + 10, "cpu"));
    assert.deepEqual(
      actions.slice(0, ENCODER_GUARD.cpuTicks - 1),
      times(ENCODER_GUARD.cpuTicks - 1, null),
      "a CPU blip shorter than the dwell changes nothing",
    );
    assert.equal(actions[ENCODER_GUARD.cpuTicks - 1], "step-down");
    assert.deepEqual(only(actions), ["step-down"], "one step-down per episode, not one per tick");
  }
  {
    // Without a share there is nothing to step down: say so instead.
    const { actions } = guard(times(ENCODER_GUARD.cpuTicks, "cpu"), () => false);
    assert.deepEqual(only(actions), ["cpu-notice"]);
  }
  {
    // A new episode after a clean tick can step down again.
    const { actions } = guard([
      ...times(ENCODER_GUARD.cpuTicks, "cpu"),
      null,
      ...times(ENCODER_GUARD.cpuTicks, "cpu"),
    ]);
    assert.deepEqual(only(actions), ["step-down", "step-down"]);
  }
  {
    // The regression: a bandwidth limit never steps the share down, however
    // long it lasts. It earns one note, after a minute, once per share.
    const { actions } = guard(times(ENCODER_GUARD.bandwidthNoticeTicks * 3, "bandwidth"));
    assert.ok(!actions.includes("step-down"), "bandwidth must never step a share down");
    // step-up is the recovery heartbeat (a bandwidth tick is not a CPU one); at
    // the preset the user chose it changes nothing.
    assert.deepEqual(
      only(actions).filter((a) => a !== "step-up"),
      ["bandwidth-notice"],
      "one note, not one per tick",
    );
    assert.equal(
      actions.indexOf("bandwidth-notice"),
      ENCODER_GUARD.bandwidthNoticeTicks - 1,
      "the note waits a minute of sustained limitation",
    );
  }
  {
    // A short bandwidth limit, the kind a share has every time it goes from a
    // still screen to motion, says nothing at all.
    const { actions } = guard([
      ...times(10, "bandwidth"),
      null,
      ...times(10, "bandwidth"),
    ]);
    assert.deepEqual(only(actions), []);
  }
  {
    // Recovery after a CPU step: bandwidth ticks do not hold it back.
    const mixed = Array.from({ length: ENCODER_GUARD.recoveryTicks }, (_, i) =>
      i % 3 === 0 ? "bandwidth" : null,
    );
    const { actions } = guard(mixed);
    assert.equal(actions.at(-1), "step-up", "recovery counts every tick without a CPU limit");
    assert.equal(only(actions).filter((a) => a === "step-up").length, 1);
  }
  {
    // A CPU tick restarts the recovery count; not sharing earns nothing.
    const interrupted = guard([
      ...times(ENCODER_GUARD.recoveryTicks - 1, null),
      "cpu",
      ...times(ENCODER_GUARD.recoveryTicks - 1, null),
    ]);
    assert.ok(!interrupted.actions.includes("step-up"), "a CPU limit restarts the recovery count");
    const idle = guard(times(ENCODER_GUARD.recoveryTicks * 2, null), () => false);
    assert.ok(!idle.actions.includes("step-up"), "no share, no step-up");
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
  console.log("link-guards self-check passed (audio guard, encoder guard, downlink diagnosis)");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
