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
// shifted by the head start.
const passThrough = {
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
        rnnoise_process_frame: () => 0.5,
      };
    }
  },
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

const ramp = (n) => Float32Array.from({ length: n }, (_, i) => ((i % 1000) - 500) / 1000);

// --- buffering: 448 samples of head start never run dry, output is exact -----
{
  const Processor = load(source, passThrough);
  const processor = new Processor({ processorOptions: { wasmModule: {} } });
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
  const processor = new Processor({ processorOptions: { wasmModule: {} } });
  run(processor, ramp(QUANTUM * 200));
  assert.ok(processor.underruns > 0, "447 should run dry: then 448 is no longer the minimum");
}

// --- the shipped model: white noise loses most of its energy -------------------
{
  const module = new WebAssembly.Module(fs.readFileSync(wasmPath));
  const Processor = load(source, WebAssembly);
  const processor = new Processor({ processorOptions: { model: "rnnoise", wasmModule: module } });
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

  processor.port.onmessage({ data: { type: "destroy" } });
  const after = new Float32Array(QUANTUM);
  assert.equal(processor.process([[noise.subarray(0, QUANTUM)]], [[after]]), true, "a destroyed processor stays alive, silent");
  assert.ok(after.every((v) => v === 0));
}

console.log("voice-worklet self-check passed (448-sample head start exact and minimal, RNNoise removes white noise)");
