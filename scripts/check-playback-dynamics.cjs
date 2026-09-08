#!/usr/bin/env node
// The two DynamicsCompressorNodes every remote voice is played through.
//
// Both are pure numbers with no test surface of their own, and both fail
// silently: nothing throws, nothing logs, the room simply sounds worse. The two
// failure modes are opposite, so a change that fixes one can cause the other.
//
//   SQUASHED   The per-voice compressor is what makes several people talking at
//              once turn to mush. Compression removes the level differences the
//              ear uses to pull one voice out of another, and a fast attack
//              removes the consonant transients that carry intelligibility --
//              which is heard as "muffled". A 20 dB spread of speech must come
//              out still clearly a spread.
//
//   CLIPPED    The master limiter is the ONLY thing between a 200% master
//              volume and hard clipping at the destination, and screen-share
//              and music-bot audio reach it without any per-voice stage. Its
//              transfer curve has to stay under 0 dBFS for anything the bus can
//              realistically sum to, and it has to recover inside a syllable:
//              a long release means one loud peak ducks every other voice in
//              the mix for a quarter of a second, over and over.
//
// The curve below is the one in the Web Audio spec, which is what Chromium
// implements: linear below the knee, quadratic across it, ratio above it.
//
//   node scripts/check-playback-dynamics.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "src/renderer/src/features/livekit/services/stream/remote-media-handler.ts",
  ),
  "utf8",
);

const readConstant = (name) => {
  const match = new RegExp(`const ${name} = \\{([\\s\\S]*?)\\};`).exec(source);
  assert.ok(match, `${name} not found in remote-media-handler.ts`);

  const values = {};
  for (const entry of match[1].matchAll(/(\w+):\s*(-?[\d.]+)/g)) {
    values[entry[1]] = Number(entry[2]);
  }
  for (const key of ["threshold", "knee", "ratio", "attack", "release"]) {
    assert.ok(
      Number.isFinite(values[key]),
      `${name}.${key} is missing or not a number`,
    );
  }
  return values;
};

// Output level in dBFS for an input level in dBFS.
const compress = ({ threshold, knee, ratio }, inputDb) => {
  if (inputDb <= threshold) {
    return inputDb;
  }
  if (knee > 0 && inputDb < threshold + knee) {
    const over = inputDb - threshold;
    return inputDb + ((1 / ratio - 1) * over * over) / (2 * knee);
  }
  return threshold + (inputDb - threshold) / ratio;
};

const voice = readConstant("VOICE_COMPRESSOR");
const limiter = readConstant("MASTER_LIMITER");

// --- The per-voice stage must level, not flatten -------------------------

const speechLow = compress(voice, -30);
const speechHigh = compress(voice, -10);
const preservedRange = speechHigh - speechLow;
assert.ok(
  preservedRange >= 12,
  `the voice compressor flattens a 20 dB speech range to ${preservedRange.toFixed(1)} dB — two people talking at once will mask each other`,
);

assert.ok(
  voice.attack >= 0.015,
  `a ${(voice.attack * 1000).toFixed(0)}ms attack clamps down on consonants, which is exactly what "muffled" sounds like`,
);

// It still has to do its job: a shout must not stay a shout.
const shoutReduction = -3 - compress(voice, -3);
assert.ok(
  shoutReduction >= 2,
  `the voice compressor barely acts (${shoutReduction.toFixed(1)} dB on a -3 dBFS peak) — one loud person will dominate the room`,
);

// --- The per-person slider must be absolute ------------------------------
//
// Structural, because it is an edge in a WebAudio graph and there is nothing
// else to read. With the gain in FRONT of the compressor, turning somebody
// down also stops the compressor compressing them, so the slider only delivers
// part of what it promises -- which is what "I set them to 5% and they are
// still too loud" was.

assert.ok(
  /compressorNode\.connect\(gainNode\)/.test(source),
  "the per-voice compressor must feed the per-person gain, not the other way round",
);
assert.ok(
  !/gainNode\.connect\(compressorNode\)/.test(source),
  "the per-person gain must not sit in front of the compressor: the compressor gives part of the attenuation back",
);
assert.ok(
  /gainNode\.connect\(bus\.masterGain\)/.test(source),
  "the per-person gain must be the last stage before the master bus",
);

// How much the wrong order would cost, at the settings above: what a listener
// gets for dragging a loud talker to 5%, gain-first versus levelled-first.
const SLIDER_TEST_PERCENT = 5;
const sliderDb = 20 * Math.log10(SLIDER_TEST_PERCENT / 100);
const talkerPeakDb = -3;
const gainFirstDelivered =
  compress(voice, talkerPeakDb) - compress(voice, talkerPeakDb + sliderDb);
const sliderLossDb = Math.abs(sliderDb) - gainFirstDelivered;

// --- The master stage must protect, and must not pump --------------------

// 200% master volume on a full-scale screen share is +6 dBFS, and the sum of
// several of those is the worst case the bus can produce.
for (const inputDb of [0, 3, 6, 12, 20]) {
  const outputDb = compress(limiter, inputDb);
  assert.ok(
    outputDb < 0,
    `the master limiter passes ${inputDb} dBFS through at ${outputDb.toFixed(2)} dBFS — that clips at the destination`,
  );
}

// One person talking at a normal level must not be touched at all, or the
// limiter is a bus compressor riding on whoever is loudest.
const quietVoice = compress(limiter, -14);
assert.ok(
  quietVoice > -14.5,
  `the master limiter is already reducing a single -14 dBFS voice by ${(-14 - quietVoice).toFixed(1)} dB`,
);

assert.ok(
  limiter.release <= 0.1,
  `a ${(limiter.release * 1000).toFixed(0)}ms release ducks the whole mix across several words after every peak`,
);

assert.ok(
  limiter.knee >= 3,
  "a hard knee makes the limiter audible the moment it engages; the onset has to be gradual",
);

console.log(
  `playback-dynamics self-check passed (voice keeps ${preservedRange.toFixed(1)} dB of 20 dB, ` +
    `limiter caps +20 dBFS at ${compress(limiter, 20).toFixed(2)} dBFS, ` +
    `gain after compressor saves ${sliderLossDb.toFixed(1)} dB of slider authority at ${SLIDER_TEST_PERCENT}%)`,
);
