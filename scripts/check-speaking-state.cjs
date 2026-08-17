#!/usr/bin/env node
// Self-check for the speaking state machine in
// src/renderer/src/features/livekit/services/stream/speaking.ts.
//
// This is what decides whether a participant's tile gets the green ring, and the
// failures it guards are the ones users actually reported: other people's rings
// coming and going while they talked, and rings that stayed lit after they had
// stopped.
//
// The module is pure — it touches an AnalyserNode only as a type — so it bundles
// with no DOM, no WebAudio and no room. Output goes under node_modules/.cache for
// the same reason check-publish-plan.cjs does: bare specifiers cannot resolve
// from a system temp directory.
//
//   node scripts/check-speaking-state.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

const main = async () => {
  const { build } = await import("vite");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-speaking-"));

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
        entry: path.join(
          projectRoot,
          "src/renderer/src/features/livekit/services/stream/speaking.ts",
        ),
        formats: ["es"],
        fileName: () => "speaking.mjs",
      },
      rollupOptions: { external: ["electron"] },
    },
  });

  const bundle = path.join(outDir, "speaking.mjs");
  const {
    advanceSpeaking,
    NOT_SPEAKING,
    SPEAKING_ON_RMS,
    SPEAKING_OFF_RMS,
    SPEAKING_HOLD_TICKS,
    readRmsLevel,
  } = await import(pathToFileURL(bundle).href);

  const LOUD = SPEAKING_ON_RMS * 3;
  const SILENT = 0;
  // Between the two thresholds: the band hysteresis exists for.
  const BETWEEN = (SPEAKING_ON_RMS + SPEAKING_OFF_RMS) / 2;

  assert.ok(
    SPEAKING_OFF_RMS < SPEAKING_ON_RMS,
    "the off threshold must be below the on threshold or there is no hysteresis",
  );

  const step = (previous, sample) =>
    advanceSpeaking(previous, {
      level: null,
      serverSpeaking: false,
      micLive: true,
      ...sample,
    });

  // --- a muted microphone is never speaking ---------------------------------
  // Both a self-mute and a moderator's force-mute land here, and both have to
  // take the ring off on the spot rather than after the hangover.
  for (const level of [LOUD, SILENT, null]) {
    for (const serverSpeaking of [true, false]) {
      const result = step(
        { speaking: true, hold: SPEAKING_HOLD_TICKS },
        { level, serverSpeaking, micLive: false },
      );
      assert.equal(
        result.speaking,
        false,
        `muted mic must never be speaking (level=${level} server=${serverSpeaking})`,
      );
      assert.equal(result.hold, 0, "a muted mic must not keep a hangover");
    }
  }

  // --- speech turns the ring on immediately ---------------------------------
  assert.equal(step(NOT_SPEAKING, { level: LOUD }).speaking, true);

  // --- hysteresis -----------------------------------------------------------
  // The band between the two thresholds holds whatever state it is already in.
  // Without it a quiet talker sits on a single threshold and crosses it several
  // times a second, which is a strobing ring.
  assert.equal(
    step(NOT_SPEAKING, { level: BETWEEN }).speaking,
    false,
    "the in-between band must not START a ring",
  );
  assert.equal(
    step({ speaking: true, hold: SPEAKING_HOLD_TICKS }, { level: BETWEEN })
      .speaking,
    true,
    "the in-between band must not BREAK a ring that is already on",
  );

  // --- the hangover lasts exactly as long as it says ------------------------
  let state = step(NOT_SPEAKING, { level: LOUD });
  const litFor = [];
  for (let tick = 0; tick < SPEAKING_HOLD_TICKS + 3; tick += 1) {
    state = step(state, { level: SILENT });
    litFor.push(state.speaking);
  }
  assert.equal(
    litFor.filter(Boolean).length,
    SPEAKING_HOLD_TICKS,
    `silence must hold the ring for exactly ${SPEAKING_HOLD_TICKS} ticks, got ${litFor.filter(Boolean).length}`,
  );
  assert.equal(
    litFor[litFor.length - 1],
    false,
    "the ring must eventually go out on silence",
  );

  // --- our own ears beat the server ----------------------------------------
  // THE bug. LiveKit's active-speaker list is recomputed at the SFU on a ~400ms
  // interval with its own smoothing, and livekit-client buffers the event
  // entirely while the room reconnects — so it goes stale in both directions. If
  // we are receiving the audio, the measurement decides and the flag does not get
  // a vote.
  let stale = { speaking: true, hold: SPEAKING_HOLD_TICKS };
  for (let tick = 0; tick < SPEAKING_HOLD_TICKS + 2; tick += 1) {
    stale = step(stale, { level: SILENT, serverSpeaking: true });
  }
  assert.equal(
    stale.speaking,
    false,
    "a stale server flag must not keep a measured-silent ring lit",
  );
  assert.equal(
    step(NOT_SPEAKING, { level: LOUD, serverSpeaking: false }).speaking,
    true,
    "measured speech must light the ring even before the server reports it",
  );

  // --- no measurement: the server is all there is --------------------------
  // Deafened, or not subscribed yet. null is "no opinion" and must NOT be read
  // as silence, or deafening yourself would put out everybody's ring.
  assert.equal(
    step(NOT_SPEAKING, { level: null, serverSpeaking: true }).speaking,
    true,
    "with no audio to measure the server's flag must be honoured",
  );
  let unheard = step(NOT_SPEAKING, { level: null, serverSpeaking: true });
  for (let tick = 0; tick < SPEAKING_HOLD_TICKS + 2; tick += 1) {
    unheard = step(unheard, { level: null, serverSpeaking: false });
  }
  assert.equal(
    unheard.speaking,
    false,
    "the server saying quiet must eventually put the ring out too",
  );

  // --- readRmsLevel -------------------------------------------------------
  // getByteTimeDomainData centres on 128. Silence is a flat 128, so it must read
  // as zero — the whole state machine above rests on that being true, and the
  // metric this replaced (a getByteFrequencyData average) does not have the
  // property: it floors just above zero for anything at all, which is why no
  // usable threshold existed for it.
  const flat = new Uint8Array(256).fill(128);
  const square = new Uint8Array(256);
  for (let i = 0; i < square.length; i += 1) {
    square[i] = i % 2 === 0 ? 128 + 64 : 128 - 64;
  }

  const fakeAnalyser = (data) => ({
    getByteTimeDomainData: (target) => target.set(data),
  });

  assert.equal(
    readRmsLevel(fakeAnalyser(flat), new Uint8Array(256)),
    0,
    "a flat 128 waveform is digital silence and must read as exactly 0",
  );
  const squareRms = readRmsLevel(fakeAnalyser(square), new Uint8Array(256));
  assert.ok(
    Math.abs(squareRms - 0.5) < 1e-9,
    `a +/-64 square wave is 0.5 RMS, got ${squareRms}`,
  );
  assert.ok(
    squareRms > SPEAKING_ON_RMS,
    "the on threshold must sit well below a real signal",
  );

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log(
    `speaking-state self-check passed (on=${SPEAKING_ON_RMS} off=${SPEAKING_OFF_RMS} hold=${SPEAKING_HOLD_TICKS} ticks)`,
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
