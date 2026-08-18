#!/usr/bin/env node
// Self-check for the UI cue palette in
// src/renderer/src/features/sound-effects/cues.ts.
//
// The cues are synthesised from these numbers, and nobody can hear a diff. The
// complaint that produced this palette -- "I can barely hear them and I cannot
// tell them apart" -- is the thing to keep from coming back, so the two halves
// of it are asserted mechanically:
//
//   AUDIBLE  every cue peaks above the level the old ones sat at, and below
//            the level where the shared compressor is doing the work.
//   SOFT     every note has a real tail. A cue with no release is a beep, and
//            no amount of level tuning fixes that.
//   DISTINCT no two cues are alike in fewer than two of the five dimensions
//            the design uses -- count, contour, register, attack, body length,
//            timbre. The only exception is a toggle's own on/off pair, which
//            is meant to sound like itself in two states.
//
// The module is pure data -- no React, no AudioContext -- so it bundles
// standalone. Output goes under node_modules/.cache for the same reason
// check-speaking-state.cjs does: bare specifiers cannot resolve from a system
// temp directory.
//
//   node scripts/check-sound-cues.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

// What the old palette sat at, and what it has to clear now.
const OLD_CUE_GAIN = 0.022;
// The shared compressor's threshold is -24 dBFS (~0.063 linear) and the master
// gain after it is 0.48. Past this the compressor is not adding polish, it is
// rescuing the mix.
const PEAK_CEILING = 0.25;
// Below this a note ends abruptly enough to read as a beep however quiet it is.
const MIN_RELEASE_MS = 150;

// C-major pentatonic, the set every cue is built from so that two overlapping
// cues are consonant rather than accidental.
const PENTATONIC = [
  261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99, 880,
  1046.5, 1174.7, 1318.5, 1568, 1760,
];

const isPentatonic = (frequency) =>
  PENTATONIC.some((allowed) => Math.abs(allowed - frequency) < 0.75);

// --- the five dimensions --------------------------------------------------

const contourOf = (tones) => {
  const first = tones[0].frequency;
  const last =
    tones[tones.length - 1].glideToFrequency ?? tones[tones.length - 1].frequency;
  if (last > first * 1.05) return "rising";
  if (last < first * 0.95) return "falling";
  return "flat";
};

// Octave bands from A1. Two cues in the same band are in the same part of the
// keyboard; that is the resolution at which a listener places a sound.
const registerOf = (tones) => {
  const mean =
    tones.reduce((sum, tone) => sum + tone.frequency, 0) / tones.length;
  return Math.floor(Math.log2(mean / 55));
};

const attackOf = (tones) =>
  Math.max(...tones.map((tone) => tone.attackMs ?? 12)) >= 40 ? "swell" : "sharp";

const bodyOf = (tones) => {
  const mean =
    tones.reduce((sum, tone) => sum + tone.durationMs, 0) / tones.length;
  return mean >= 70 ? "long" : "short";
};

const timbreOf = (tones) => tones[0].type ?? "sine";

const signatureOf = (tones) => ({
  notes: tones.length,
  contour: contourOf(tones),
  register: registerOf(tones),
  attack: attackOf(tones),
  body: bodyOf(tones),
  timbre: timbreOf(tones),
});

const differences = (left, right) =>
  Object.keys(left).filter((key) => left[key] !== right[key]);

/**
 * The loudest instant of a cue.
 *
 * Tails overlap on purpose -- that is what makes three notes one chime -- so
 * the peak is a sum, not a maximum. Walked at 1ms, which is finer than any
 * envelope here.
 */
const peakGainOf = (tones) => {
  const spans = [];
  let cursor = 0;
  for (const tone of tones) {
    const bodyEnd = cursor + tone.durationMs;
    spans.push({
      start: cursor,
      end: bodyEnd + (tone.releaseMs ?? 30),
      gain: tone.gain,
    });
    cursor = bodyEnd + (tone.pauseAfterMs ?? 22);
  }

  const last = Math.max(...spans.map((span) => span.end));
  let peak = 0;
  for (let ms = 0; ms <= last; ms += 1) {
    let sum = 0;
    for (const span of spans) {
      if (ms >= span.start && ms <= span.end) {
        sum += span.gain;
      }
    }
    peak = Math.max(peak, sum);
  }
  return peak;
};

const main = async () => {
  const { build } = await import("vite");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-sound-cues-"));

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
          "src/renderer/src/features/sound-effects/cues.ts",
        ),
        formats: ["es"],
        fileName: () => "cues.mjs",
      },
      rollupOptions: { external: ["electron"] },
    },
  });

  const bundle = path.join(outDir, "cues.mjs");
  const { CUE_PATTERNS, CUE_SIBLING_PAIRS } = await import(
    pathToFileURL(bundle).href
  );

  const names = Object.keys(CUE_PATTERNS);
  assert.ok(names.length >= 8, "every UI cue must live in this palette");

  // --- audible, soft, and in key -------------------------------------------
  for (const name of names) {
    const tones = CUE_PATTERNS[name];
    assert.ok(tones.length > 0, `${name} plays nothing`);

    const peak = peakGainOf(tones);
    assert.ok(
      peak > OLD_CUE_GAIN * 1.8,
      `${name} peaks at ${peak.toFixed(3)}, no louder than the palette people could not hear`,
    );
    assert.ok(
      peak <= PEAK_CEILING,
      `${name} peaks at ${peak.toFixed(3)}, past what the compressor should be asked to hold`,
    );

    for (const tone of tones) {
      assert.ok(
        (tone.releaseMs ?? 30) >= MIN_RELEASE_MS,
        `${name} has a note with no tail (${tone.releaseMs ?? 30}ms) — that is a beep`,
      );
      assert.ok(
        tone.durationMs > 0 && tone.gain > 0,
        `${name} has a silent or zero-length note`,
      );
      assert.ok(
        isPentatonic(tone.frequency),
        `${name} plays ${tone.frequency} Hz, which is not in the shared scale`,
      );
      if (typeof tone.glideToFrequency === "number") {
        assert.ok(
          isPentatonic(tone.glideToFrequency),
          `${name} glides to ${tone.glideToFrequency} Hz, which is not in the shared scale`,
        );
      }
    }
  }

  // --- distinct -------------------------------------------------------------
  const siblings = new Set(
    CUE_SIBLING_PAIRS.map(([left, right]) => [left, right].sort().join("|")),
  );

  for (const [left, right] of CUE_SIBLING_PAIRS) {
    assert.ok(CUE_PATTERNS[left], `sibling pair names ${left}, which is not a cue`);
    assert.ok(CUE_PATTERNS[right], `sibling pair names ${right}, which is not a cue`);
  }

  const signatures = Object.fromEntries(
    names.map((name) => [name, signatureOf(CUE_PATTERNS[name])]),
  );

  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      const left = names[i];
      const right = names[j];
      const apart = differences(signatures[left], signatures[right]);
      const isSiblingPair = siblings.has([left, right].sort().join("|"));
      const required = isSiblingPair ? 1 : 2;

      assert.ok(
        apart.length >= required,
        `${left} and ${right} differ only in [${apart.join(", ")}] — ` +
          `that is not enough to tell them apart by ear`,
      );
    }
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log(
    `sound-cues self-check passed (${names.length} cues, all audible, all with tails, none confusable)`,
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
