#!/usr/bin/env node
// Acceptance check for skipping the noise model on digital silence.
//
// A muted microphone (and a push-to-talk user between presses) feeds the
// worklet exact zeros for hours. The model must not run on them: it costs CPU
// on the audio thread for nothing. What must hold:
//   1. after a short tail the model is no longer called on silent frames;
//   2. the output during the skipped stretch is exact silence (Opus DTX);
//   3. the first sample after the silence comes out untouched and on time;
//   4. the gate still opens before the first syllable and still holds;
//   5. the stats keep arriving every 100 frames and say how many frames skipped;
//   6. the real RNNoise build recovers after a skipped stretch.
//   node scripts/check-voice-silence-skip.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const featureDir = path.join(__dirname, "..", "src", "renderer", "src", "features", "voice-processing");
const workletPath = path.join(featureDir, "voice-worklet.js");
const wasmPath = path.join(featureDir, "assets", "rnnoise.wasm");
const source = fs.readFileSync(workletPath, "utf-8");

const QUANTUM = 128;
const FRAME = 480;
const HEAD = 448; // the worklet's head start
// 4 frames = 15 quanta: segments in multiples of BLOCK start on a frame edge.
const BLOCK = 1920;
const frames = (n) => {
  assert.equal(n % 4, 0, "segment lengths are multiples of 4 frames");
  return (n / 4) * BLOCK;
};

const load = (webAssembly) => {
  let Processor = null;
  class FakeAudioWorkletProcessor {
    constructor() {
      this.port = { onmessage: null, posted: [], postMessage(m) { this.posted.push(m); } };
    }
  }
  vm.runInNewContext(source, {
    AudioWorkletProcessor: FakeAudioWorkletProcessor,
    registerProcessor: (_name, ctor) => { Processor = ctor; },
    WebAssembly: webAssembly,
    Float32Array,
    Uint32Array,
    Uint8Array,
    Math,
    Date,
  }, { filename: workletPath });
  assert.ok(Processor, "worklet did not register a processor");
  return Processor;
};

// A model that returns its input untouched and counts its calls.
const countingModel = (vadOf = () => 0.5) => {
  const model = {
    calls: 0,
    Module: { imports: () => [] },
    Instance: class {
      constructor() {
        const memory = { buffer: new ArrayBuffer(4096) };
        this.exports = {
          memory,
          malloc: () => 0,
          free: () => {},
          rnnoise_create: () => 1,
          rnnoise_destroy: () => {},
          rnnoise_process_frame: () => vadOf(model.calls++),
        };
      }
    },
  };
  return model;
};

const run = (processor, signal) => {
  const out = new Float32Array(signal.length);
  for (let at = 0; at + QUANTUM <= signal.length; at += QUANTUM) {
    const output = new Float32Array(QUANTUM);
    processor.process([[signal.subarray(at, at + QUANTUM)]], [[output]]);
    out.set(output, at);
  }
  return out;
};

const tone = (n, amp = 0.3) => Float32Array.from({ length: n }, (_, i) => Math.sin(i / 7) * amp);
const concat = (...parts) => {
  const out = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};
const statsOf = (processor) => processor.port.posted.filter((m) => m.type === "stats");
const GATE_OFF = { mode: "off" };

// The model keeps running for a short tail after the signal stops (its own
// output is two frames late), then stops. Between 5 and 50 frames of tail.
const TAIL_MIN = 5;
const TAIL_MAX = 50;

// --- 1, 2, 3: zeros are skipped, silence is exact, the restart is untouched ---
{
  const model = countingModel();
  const Processor = load(model);
  const processor = new Processor({ processorOptions: { wasmModule: {}, gate: GATE_OFF } });
  const speech = frames(100);
  const silence = frames(300);
  const input = concat(tone(speech), new Float32Array(silence), tone(speech));
  const output = run(processor, input);

  const onSilence = model.calls - 200;
  assert.ok(onSilence >= TAIL_MIN, `the model must still run on the first silent frames (ran on ${onSilence})`);
  assert.ok(onSilence <= TAIL_MAX, `the model ran on ${onSilence} of 300 silent frames: digital silence is not skipped`);

  assert.equal(processor.underruns, 0, "skipping must not starve the output queue");
  for (let i = HEAD; i < input.length; i++) {
    assert.ok(Math.abs(output[i] - input[i - HEAD]) < 1e-6,
      `sample ${i}: output is not the input ${HEAD} samples late (got ${output[i]}, want ${input[i - HEAD]})`);
  }
  for (let i = speech + HEAD + TAIL_MAX * FRAME; i < speech + silence + HEAD; i++) {
    assert.equal(output[i], 0, `sample ${i} of the skipped stretch is not exact silence`);
  }
}

// --- the threshold: far below 24-bit noise counts as silence, a real signal does not ---
{
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
  const hiss = (n, amp) => Float32Array.from({ length: n }, () => rand() * amp);

  const below = countingModel();
  const quiet = new (load(below))({ processorOptions: { wasmModule: {}, gate: GATE_OFF } });
  const out = run(quiet, hiss(frames(300), 1e-9)); // about -180 dBFS: a filter's dying tail
  assert.ok(below.calls <= TAIL_MAX, `a 1e-9 residue kept the model running (${below.calls} of 300 frames)`);
  assert.ok(out.subarray(HEAD + TAIL_MAX * FRAME).every((v) => v === 0), "a skipped residue must come out as exact silence");

  const above = countingModel();
  const audible = new (load(above))({ processorOptions: { wasmModule: {}, gate: GATE_OFF } });
  run(audible, hiss(frames(300), 1e-5)); // about -100 dBFS: a very quiet room, still a signal
  assert.equal(above.calls, 300, `a -100 dBFS signal must always reach the model (${above.calls} of 300 frames)`);
}

// --- a pause shorter than the tail is never skipped ---------------------------
{
  const model = countingModel();
  const processor = new (load(model))({ processorOptions: { wasmModule: {}, gate: GATE_OFF } });
  // 4 silent frames between phrases, ten times over.
  const parts = [];
  for (let i = 0; i < 10; i++) parts.push(tone(frames(8)), new Float32Array(frames(4)));
  run(processor, concat(...parts));
  assert.equal(model.calls, 120, `short pauses must not be skipped (${model.calls} of 120 frames reached the model)`);
}

// --- 4: the gate still opens before the first syllable and still holds ---------
{
  // Speech is frames 400-449, after 400 frames (4 s) of muted microphone.
  // The model says 0.9 on what it is given during speech; it is only asked
  // about frames that reach it, so the answer cannot depend on a frame index.
  const model = countingModel(() => 0.9);
  const Processor = load(model);
  const processor = new Processor({ processorOptions: { wasmModule: {}, gate: { lookaheadFrames: 1 } } });
  const input = concat(new Float32Array(frames(400)), tone(frames(52)), new Float32Array(frames(200)));
  const output = run(processor, input);
  const delay = HEAD + FRAME; // head start plus one frame of look-ahead
  const onset = 400 * FRAME + delay;
  const end = 452 * FRAME + delay;
  const peak = (a, b) => output.subarray(a, b).reduce((m, v) => Math.max(m, Math.abs(v)), 0);

  assert.equal(peak(0, onset - 2 * FRAME), 0, "a muted microphone must come out as true silence");
  assert.ok(peak(onset, onset + 48) > 0.28, "after a skipped stretch the first millisecond of speech must come out at full level");
  assert.ok(peak(onset + 10 * FRAME, onset + 11 * FRAME) > 0.28, "speech after a skipped stretch plays at full level");
  assert.equal(peak(end + 1400 * 48, output.length), 0, "after hold and release, silence again");
  assert.ok(model.calls <= 52 + 2 * TAIL_MAX, `the model ran on ${model.calls} frames; only 52 carried a signal`);

  const stats = statsOf(processor);
  assert.equal(stats.length, 6, "a stats report every 100 frames, skipped or not");
  assert.equal(stats[1].gateOpenRatio, 0, "the gate stays shut on a muted microphone");
  assert.equal(stats[1].vadMean, 0, "a skipped frame reports no voice");
}

// --- 5: the stats say how many frames were skipped ----------------------------
{
  const model = countingModel();
  const processor = new (load(model))({ processorOptions: { wasmModule: {}, gate: GATE_OFF } });
  run(processor, concat(tone(frames(100)), new Float32Array(frames(300))));
  const stats = statsOf(processor);
  assert.equal(stats.length, 4);
  assert.equal(stats[0].skippedFrames, 0, "nothing is skipped while there is a signal");
  assert.equal(stats[2].skippedFrames, 100, "a fully silent second is fully skipped");
  assert.equal(stats[3].skippedFrames, 100);
  assert.equal(stats[0].skippedFrames + stats[1].skippedFrames + stats[2].skippedFrames + stats[3].skippedFrames, 400 - model.calls,
    "skipped frames plus model calls must add up to all frames");
  for (const s of stats) {
    assert.equal(s.frames, 100);
    assert.ok(Number.isFinite(s.meanMs) && s.meanMs >= 0, "meanMs stays a number when every frame is skipped");
    assert.ok(Number.isFinite(s.p99Ms) && Number.isFinite(s.maxMs));
  }
}

// --- the suppression limit (dry mix) stays silent on a skipped stretch ---------
{
  const model = countingModel();
  const processor = new (load(model))({ processorOptions: { wasmModule: {}, gate: GATE_OFF, attenLimitDb: 12 } });
  const output = run(processor, concat(tone(frames(40)), new Float32Array(frames(200))));
  const from = 40 * FRAME + HEAD + 960 + TAIL_MAX * FRAME;
  assert.ok(output.subarray(from).every((v) => v === 0), "with a suppression limit set, a skipped stretch is still exact silence");
}

// --- without a model nothing changes -----------------------------------------
{
  const model = countingModel();
  const processor = new (load(model))({ processorOptions: { model: "none", volume: 1 } });
  const input = concat(tone(frames(8)), new Float32Array(frames(40)), tone(frames(8)));
  const output = run(processor, input);
  assert.ok(output.every((v, i) => Math.abs(v - input[i]) < 1e-6), "model none: sample for sample, no delay");
  assert.equal(model.calls, 0);
}

// --- 6: the shipped RNNoise build recovers after a skipped stretch ------------
{
  const module = new WebAssembly.Module(fs.readFileSync(wasmPath));
  const Processor = load(WebAssembly);
  let seed = 1;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
  let phase = 0;
  const vowel = (n) => Float32Array.from({ length: n }, (_, i) => {
    const t = i / 48000;
    phase += (2 * Math.PI * (130 + 25 * Math.sin(2 * Math.PI * 1.3 * t))) / 48000;
    let v = 0;
    for (let h = 1; h <= 30; h++) v += (Math.sin(h * phase) / h) * (h < 6 ? 1 : 0.5);
    return 0.08 * Math.max(0, Math.sin(2 * Math.PI * 2 * t)) ** 0.5 * v + 0.001 * rand();
  });
  const energy = (x) => x.reduce((s, v) => s + v * v, 0) / x.length;

  const processor = new Processor({ processorOptions: { model: "rnnoise", wasmModule: module, gate: GATE_OFF } });
  const first = vowel(frames(300));
  const mute = new Float32Array(frames(600)); // 6 s of muted microphone
  const second = vowel(frames(300));
  const output = run(processor, concat(first, mute, second));
  assert.ok(output.every((v) => Number.isFinite(v)), "the output must stay finite across a skipped stretch");

  const stats = statsOf(processor);
  assert.equal(stats.length, 12);
  assert.ok(stats.every((s) => s.underruns === 0));
  assert.ok(stats.slice(4, 9).every((s) => s.skippedFrames === 100), "seconds 5-9 are muted: every frame skipped");
  const muteStart = first.length + HEAD + 960 + TAIL_MAX * FRAME;
  assert.ok(output.subarray(muteStart, first.length + mute.length).every((v) => v === 0), "muted and skipped: exact silence out of the real model too");

  // The model must hear speech again right away: same voice probability and
  // same level as before the mute, within a small margin.
  const vadBefore = (stats[1].vadMean + stats[2].vadMean) / 2;
  const vadAfter = (stats[10].vadMean + stats[11].vadMean) / 2;
  assert.ok(vadBefore > 0.3, `the test signal should read as voice (${vadBefore.toFixed(2)})`);
  assert.ok(Math.abs(vadAfter - vadBefore) < 0.15, `voice probability after the mute ${vadAfter.toFixed(2)}, before ${vadBefore.toFixed(2)}`);
  const levelBefore = 10 * Math.log10(energy(output.subarray(frames(100), frames(300))));
  const afterAt = first.length + mute.length;
  const levelAfter = 10 * Math.log10(energy(output.subarray(afterAt + frames(100), afterAt + frames(300))));
  assert.ok(Math.abs(levelAfter - levelBefore) < 1.5, `speech level after the mute ${levelAfter.toFixed(1)} dB, before ${levelBefore.toFixed(1)} dB`);
  // The first 100 ms after the mute must already carry the voice, not a fade-in.
  const firstTenth = 10 * Math.log10(energy(output.subarray(afterAt + HEAD + 960, afterAt + HEAD + 960 + 4800)) + 1e-20);
  const sameTenthBefore = 10 * Math.log10(energy(output.subarray(HEAD + 960 + frames(200), HEAD + 960 + frames(200) + 4800)) + 1e-20);
  assert.ok(firstTenth > sameTenthBefore - 12, `the first 100 ms after the mute is ${(sameTenthBefore - firstTenth).toFixed(1)} dB below a normal 100 ms`);
}

console.log("voice silence-skip check passed (model not called on digital silence after a short tail; skipped stretch is exact silence; restart untouched and on time; gate and hold unchanged; stats report skipped frames; RNNoise recovers after a mute)");
