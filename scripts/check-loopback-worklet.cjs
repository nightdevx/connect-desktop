#!/usr/bin/env node
// Runs the real AudioWorklet source under stubbed worklet globals, so the
// drift-compensation math is checked without duplicating it.
//   node scripts/check-loopback-worklet.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const workletPath = path.join(
  __dirname,
  "..",
  "src",
  "renderer",
  "src",
  "features",
  "screen-share",
  "loopback-worklet.js",
);

const source = fs.readFileSync(workletPath, "utf-8");

let ProcessorClass = null;

class FakeAudioWorkletProcessor {
  constructor() {
    this.port = { onmessage: null, postMessage: () => {} };
  }
}

const sandbox = {
  AudioWorkletProcessor: FakeAudioWorkletProcessor,
  registerProcessor: (name, ctor) => {
    assert.equal(name, "loopback-source", "processor name changed");
    ProcessorClass = ctor;
  },
  Float32Array,
  Math,
};

vm.runInNewContext(source, sandbox, { filename: workletPath });
assert.ok(ProcessorClass, "worklet did not register a processor");

const RENDER_QUANTUM = 128;

const makeOutput = () => [
  new Float32Array(RENDER_QUANTUM),
  new Float32Array(RENDER_QUANTUM),
];

// Interleaved stereo ramp so interpolation errors are visible.
const makePcm = (frames, start = 0) => {
  const out = new Float32Array(frames * 2);
  for (let i = 0; i < frames; i += 1) {
    out[i * 2] = (start + i) * 0.001;
    out[i * 2 + 1] = -(start + i) * 0.001;
  }
  return out;
};

const feed = (processor, frames, start) => {
  processor.port.onmessage({ data: makePcm(frames, start) });
};

const render = (processor, quanta) => {
  const output = makeOutput();
  for (let i = 0; i < quanta; i += 1) {
    processor.process([], [output]);
  }
  return output;
};

// --- underrun: no data means silence, not a crash ---------------------------
{
  const processor = new ProcessorClass();
  const output = makeOutput();
  processor.process([], [output]);
  assert.ok(
    output[0].every((sample) => sample === 0),
    "an empty buffer must render silence",
  );
  assert.ok(processor.underruns > 0, "underruns should be counted");
}

// --- steady state: audio comes out, buffer stays near target ----------------
{
  const processor = new ProcessorClass();
  // Prime to roughly the target depth.
  feed(processor, 2880, 0);
  const before = processor.availableFrames;
  assert.equal(before, 2880);

  const output = render(processor, 1);
  assert.ok(
    output[0].some((sample) => sample !== 0),
    "primed buffer must produce audio",
  );
  // Left channel is a rising ramp, right is its negative — proves channels are
  // not swapped or collapsed.
  assert.ok(output[0][10] > 0, "left channel should be positive");
  assert.ok(output[1][10] < 0, "right channel should be negative");
  assert.ok(
    Math.abs(processor.availableFrames - (2880 - RENDER_QUANTUM)) <= 2,
    `consumed roughly one quantum, got ${processor.availableFrames}`,
  );
}

// --- drift: an over-full buffer is drained back toward target ---------------
{
  const processor = new ProcessorClass();
  feed(processor, 20000, 0);
  const stepFast = processor.playbackStep();
  assert.ok(stepFast > 1, `over-full buffer must speed up, got ${stepFast}`);
  assert.ok(
    stepFast <= 1.005 + 1e-9,
    `rate adjustment must stay within 0.5%, got ${stepFast}`,
  );

  // Drain without writing; depth must fall.
  const startDepth = processor.availableFrames;
  render(processor, 20);
  assert.ok(
    processor.availableFrames < startDepth,
    "rendering must consume frames",
  );
}

// --- drift: a shallow buffer is stretched ------------------------------------
{
  const processor = new ProcessorClass();
  feed(processor, 300, 0);
  const stepSlow = processor.playbackStep();
  assert.ok(stepSlow < 1, `shallow buffer must slow down, got ${stepSlow}`);
  assert.ok(
    stepSlow >= 1 - 0.005 - 1e-9,
    `rate adjustment must stay within 0.5%, got ${stepSlow}`,
  );
}

// --- overflow: never writes past capacity -----------------------------------
{
  const processor = new ProcessorClass();
  for (let i = 0; i < 10; i += 1) {
    feed(processor, 20000, i * 20000);
  }
  assert.ok(
    processor.availableFrames <= 48000,
    `buffer must never exceed capacity, got ${processor.availableFrames}`,
  );
  assert.ok(processor.overruns > 0, "overruns should be counted");

  // Still usable after the resync.
  feed(processor, 5000, 0);
  const output = render(processor, 1);
  assert.ok(
    output[0].some((sample) => sample !== 0),
    "processor must keep working after an overflow resync",
  );
}

// --- long run: mismatched producer/consumer clocks converge -----------------
// This is the whole point of the rewrite. A producer running 0.3% fast is
// ordinary soundcard drift. Uncompensated, the buffer grows by 0.3% of every
// frame forever: over the run below that is ~+1540 frames of pure added
// latency, and in the old chunk-queue version it eventually forced a drop.
const TARGET_FRAMES = 2880;
{
  const processor = new ProcessorClass();
  feed(processor, TARGET_FRAMES, 0);

  const QUANTA = 6000;
  let pending = 0;
  for (let quantum = 0; quantum < QUANTA; quantum += 1) {
    pending += RENDER_QUANTUM * 1.003;
    const whole = Math.floor(pending);
    pending -= whole;
    feed(processor, whole, quantum * whole);
    render(processor, 1);
  }

  const uncompensatedGrowth = QUANTA * RENDER_QUANTUM * 0.003;
  const drift = processor.availableFrames - TARGET_FRAMES;

  assert.ok(
    drift < uncompensatedGrowth / 4,
    `controller must absorb the drift: ended ${drift} frames off target, ` +
      `uncompensated would be ~${Math.round(uncompensatedGrowth)}`,
  );
  assert.ok(
    Math.abs(drift) < 400,
    `buffer should settle near the target, ended ${drift} frames off`,
  );
  assert.equal(processor.overruns, 0, "bounded drift must not force a resync");
  assert.equal(processor.underruns, 0, "a fed buffer must never underrun");
}

console.log("loopback-worklet self-check passed");
