#!/usr/bin/env node
// Runs the real microphone worklet under stubbed worklet globals: once with a
// pass-through model to check the buffering exactly, once with the shipped
// RNNoise build to check that it really denoises.
//   node scripts/check-voice-worklet.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const featureDir = path.join(__dirname, "..", "src", "renderer", "src", "features", "voice-processing");
const workletPath = path.join(featureDir, "voice-worklet.js");
const wasmPath = path.join(featureDir, "assets", "rnnoise.wasm");
const source = fs.readFileSync(workletPath, "utf-8");

const QUANTUM = 128;

// Loads the worklet source, optionally edited, against a given WebAssembly.
const load = (src, webAssembly) => {
  let Processor = null;
  class FakeAudioWorkletProcessor {
    constructor() {
      this.port = { onmessage: null, posted: [], postMessage(m) { this.posted.push(m); } };
    }
  }
  vm.runInNewContext(src, {
    AudioWorkletProcessor: FakeAudioWorkletProcessor,
    registerProcessor: (name, ctor) => {
      assert.equal(name, "connect-voice", "processor name changed");
      Processor = ctor;
    },
    WebAssembly: webAssembly,
    Float32Array,
    Uint32Array,
    Math,
    Date,
  }, { filename: workletPath });
  assert.ok(Processor, "worklet did not register a processor");
  return Processor;
};

// A model that returns its input untouched, so output must equal input exactly,
// shifted by the head start; or, with `silent`, removes everything. Its voice
// probability follows `vadOf(frameIndex)`.
const fakeModel = (vadOf = () => 0.5, silent = false) => ({
  Module: { imports: () => [] },
  Instance: class {
    constructor() {
      const memory = { buffer: new ArrayBuffer(4096) };
      let frame = 0;
      this.exports = {
        memory,
        malloc: () => 0,
        free: () => {},
        rnnoise_create: () => 1,
        rnnoise_destroy: () => {},
        rnnoise_process_frame: (state, out) => {
          if (silent) new Float32Array(memory.buffer, out, 480).fill(0);
          return vadOf(frame++);
        },
      };
    }
  },
});
const passThrough = fakeModel();
const GATE_OFF = { mode: "off" };

const run = (processor, signal) => {
  const out = new Float32Array(signal.length);
  for (let at = 0; at + QUANTUM <= signal.length; at += QUANTUM) {
    const output = new Float32Array(QUANTUM);
    processor.process([[signal.subarray(at, at + QUANTUM)]], [[output]]);
    out.set(output, at);
  }
  return out;
};

const ramp = (n) => Float32Array.from({ length: n }, (_, i) => ((i % 1000) - 500) / 1000);

// --- buffering: 448 samples of head start never run dry, output is exact -----
{
  const Processor = load(source, passThrough);
  const processor = new Processor({ processorOptions: { wasmModule: {}, gate: GATE_OFF } });
  const input = ramp(QUANTUM * 6000);
  const output = run(processor, input);
  assert.equal(processor.underruns, 0, "a 448-sample head start must never run dry");
  for (let i = 0; i < 448; i++) assert.equal(output[i], 0, "head start must be silence");
  for (let i = 448; i < input.length; i++) {
    assert.ok(Math.abs(output[i] - input[i - 448]) < 1e-6, `sample ${i} is not the input delayed by 448`);
  }
  const stats = processor.port.posted.filter((m) => m.type === "stats");
  assert.ok(stats.length >= 15, "a stats report every 100 frames");
  assert.equal(stats[0].frames, 100);
  assert.equal(stats[0].underruns, 0);
  assert.ok(Math.abs(stats[0].vadMean - 0.5) < 1e-9, "the reported voice probability is the model's");
}

// --- 448 is the minimum: one sample less runs dry -----------------------------
{
  const shorter = source.replace("const PRIME = 448;", "const PRIME = 447;");
  assert.notEqual(shorter, source, "PRIME constant not found");
  const Processor = load(shorter, passThrough);
  const processor = new Processor({ processorOptions: { wasmModule: {}, gate: GATE_OFF } });
  run(processor, ramp(QUANTUM * 200));
  assert.ok(processor.underruns > 0, "447 should run dry: then 448 is no longer the minimum");
}

// --- gate: silence between phrases, nothing clipped at the start, held after ---
{
  // Frames 50-99 are speech (vad 0.9), the rest loud noise the model does not
  // take for speech (vad 0.01, like a click). The fake model passes the signal
  // through, so the output shows the gate alone.
  const Processor = load(source, fakeModel((f) => (f >= 50 && f < 100 ? 0.9 : 0.01)));
  const processor = new Processor({ processorOptions: { wasmModule: {}, gate: { lookaheadFrames: 1 } } });
  const input = Float32Array.from({ length: QUANTUM * 600 }, (_, i) => Math.sin(i / 7) * 0.3);
  const output = run(processor, input);
  const delay = 448 + 480; // head start plus one frame of look-ahead
  const onset = 50 * 480 + delay; // where frame 50's first sample comes out
  const end = 100 * 480 + delay;
  const peak = (a, b) => output.subarray(a, b).reduce((m, v) => Math.max(m, Math.abs(v)), 0);

  assert.equal(peak(delay, onset - 960), 0, "noise before the speech must come out as true silence");
  // One frame of look-ahead: frame 50 is decided 10 ms before it plays, so the
  // gate has finished its 2 ms attack by the phrase's first sample.
  assert.ok(peak(onset, onset + 48) > 0.28, "the first millisecond of the phrase must come out at full level");
  assert.ok(peak(end + 200 * 48, end + 240 * 48) > 0.25, "the gate must hold 250 ms after the phrase");
  assert.equal(peak(end + 1400 * 48, output.length), 0, "after hold and release, silence again");
  const stats = processor.port.posted.filter((m) => m.type === "stats");
  assert.equal(stats[0].gateOpenRatio, 0.5, "frames 50-99 of the first second were voiced");
}

// --- gate: a loud word the model is unsure of opens it, a quiet one does not ---
{
  // vad 0.2 throughout: above levelVad, below openVad. Only the level decides.
  const Processor = load(source, fakeModel(() => 0.2));
  const word = (amp) => Float32Array.from({ length: QUANTUM * 600 }, (_, i) =>
    i >= 50 * 480 && i < 100 * 480 ? Math.sin(i / 7) * amp : 0);
  const onset = 50 * 480 + 448; // default gate: no look-ahead
  const loud = run(new Processor({ processorOptions: { wasmModule: {} } }), word(0.03)); // about -33 dBFS
  assert.ok(loud.subarray(onset + 480, onset + 960).some((v) => Math.abs(v) > 0.028), "a loud word must open the gate within 10 ms");
  const quiet = run(new Processor({ processorOptions: { wasmModule: {} } }), word(0.002)); // about -57 dBFS
  assert.ok(quiet.every((v) => v === 0), "a word below openDb, with the model unsure, stays shut");
}

// --- gate: manual threshold follows the level, and settings change live --------
{
  const Processor = load(source, fakeModel(() => 0));
  const processor = new Processor({ processorOptions: { wasmModule: {}, gate: { mode: "manual", thresholdDb: -30 } } });
  const quiet = Float32Array.from({ length: QUANTUM * 300 }, (_, i) => Math.sin(i / 7) * 0.01); // about -43 dBFS
  assert.ok(run(processor, quiet).subarray(48000).every((v) => v === 0), "below the manual threshold nothing is sent");
  processor.port.onmessage({ data: { type: "gate", gate: { mode: "manual", thresholdDb: -50 } } });
  assert.ok(run(processor, quiet).subarray(9600).some((v) => v !== 0), "a lowered threshold opens the gate without a rebuild");
}

// --- suppression limit: what the model removes comes back at -attenLimitDb ---
{
  // A model that removes everything: the output is then the limit alone, the
  // input at -12 dB, aligned to where the model's output would be.
  const Processor = load(source, fakeModel(() => 0, true));
  const processor = new Processor({ processorOptions: { wasmModule: {}, gate: GATE_OFF, attenLimitDb: 12 } });
  const input = ramp(QUANTUM * 600);
  const output = run(processor, input);
  const delay = 448 + 960;
  for (let i = delay; i < input.length; i++) {
    assert.ok(Math.abs(output[i] - input[i - delay] * 10 ** (-12 / 20)) < 1e-6, `sample ${i}: not the input at -12 dB, ${delay} samples later`);
  }
}

// --- the shipped model: white noise loses most of its energy -------------------
{
  const module = new WebAssembly.Module(fs.readFileSync(wasmPath));
  const Processor = load(source, WebAssembly);
  const processor = new Processor({ processorOptions: { model: "rnnoise", wasmModule: module, gate: GATE_OFF } });
  let seed = 1;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
  const noise = Float32Array.from({ length: 48000 * 3 }, () => rand() * 0.03);
  const output = run(processor, noise);
  const energy = (x) => x.reduce((s, v) => s + v * v, 0) / x.length;
  // Compare the last second, after the model has settled.
  const inDb = 10 * Math.log10(energy(noise.subarray(96000)));
  const outDb = 10 * Math.log10(energy(output.subarray(96000)) + 1e-20);
  assert.ok(inDb - outDb > 15, `RNNoise should remove white noise: ${inDb.toFixed(1)} dB in, ${outDb.toFixed(1)} dB out`);
  const stats = processor.port.posted.filter((m) => m.type === "stats");
  assert.ok(stats.length >= 2 && stats.every((s) => s.underruns === 0 && s.model === "rnnoise"));
  assert.ok(stats.every((s) => s.vadMean < 0.5), "white noise is not speech");

  // Loud keyboard-like clicks on a quiet room: what RNNoise leaves of them must
  // not open the gate.
  const clicker = new Processor({ processorOptions: { model: "rnnoise", wasmModule: module } });
  const clicks = Float32Array.from({ length: 48000 * 6 }, (_, i) => {
    const t = i % 7200; // one 3 ms burst every 150 ms
    return rand() * 0.0003 + (t < 144 ? rand() * 0.5 * Math.exp(-t / 30) : 0);
  });
  run(clicker, clicks);
  const clickStats = clicker.port.posted.filter((m) => m.type === "stats").slice(1);
  assert.ok(clickStats.every((s) => s.gateOpenRatio < 0.05), `clicks opened the gate: ${clickStats.map((s) => s.gateOpenRatio).join(", ")}`);

  // A voiced, vowel-like signal: the model hands it back 960 samples late, as
  // MODEL_DELAY says, and mixing the raw input back in at that delay leaves it
  // intact. At the wrong delay the mix would comb-filter it and lose ~3 dB.
  let phase = 0;
  const vowel = Float32Array.from({ length: 48000 * 4 }, (_, i) => {
    const t = i / 48000;
    phase += (2 * Math.PI * (130 + 25 * Math.sin(2 * Math.PI * 1.3 * t))) / 48000;
    let v = 0;
    for (let h = 1; h <= 30; h++) v += (Math.sin(h * phase) / h) * (h < 6 ? 1 : 0.5);
    return 0.08 * Math.max(0, Math.sin(2 * Math.PI * 2 * t)) ** 0.5 * v + 0.001 * rand();
  });
  const denoise = (attenLimitDb) =>
    run(new Processor({ processorOptions: { model: "rnnoise", wasmModule: module, gate: GATE_OFF, attenLimitDb } }), vowel);
  const plain = denoise(0);
  const corr = (lag) => {
    let xy = 0, xx = 0, yy = 0;
    for (let i = 48000; i < vowel.length - 2000; i += 2) {
      xy += vowel[i] * plain[i + lag];
      xx += vowel[i] * vowel[i];
      yy += plain[i + lag] * plain[i + lag];
    }
    return xy / Math.sqrt(xx * yy);
  };
  let bestLag = 0;
  for (let lag = 0; lag < 2000; lag++) if (corr(lag) > corr(bestLag)) bestLag = lag;
  assert.ok(Math.abs(bestLag - (448 + 960)) <= 4 && corr(bestLag) > 0.95, `RNNoise delay moved: output best matches input ${bestLag - 448} samples late (rho ${corr(bestLag).toFixed(3)}), MODEL_DELAY is 960`);
  const limited = denoise(6);
  const ratioDb = 10 * Math.log10(energy(limited.subarray(48000)) / energy(plain.subarray(48000)));
  assert.ok(Math.abs(ratioDb) < 1, `a 6 dB limit changed a voiced signal's level by ${ratioDb.toFixed(2)} dB`);

  processor.port.onmessage({ data: { type: "destroy" } });
  const after = new Float32Array(QUANTUM);
  assert.equal(processor.process([[noise.subarray(0, QUANTUM)]], [[after]]), true, "a destroyed processor stays alive, silent");
  assert.ok(after.every((v) => v === 0));
}

console.log("voice-worklet self-check passed (448-sample head start exact and minimal; gate silent between phrases, opens before the first syllable, holds 250 ms, opens on loud words only, manual and live settings; suppression limit aligned; RNNoise removes white noise, clicks keep the gate shut, delay 960)");
