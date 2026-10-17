// The microphone's noise suppressor, as an AudioWorklet.
//
// Plain JS loaded via addModule, self-contained on purpose: worklet modules are
// standalone assets and cannot import shared helpers, and a bundled worklet
// would need Vite's worker build. scripts/check-voice-worklet.cjs runs this
// exact file under stubbed worklet globals, with the real model.
//
// The model arrives as an already-compiled WebAssembly.Module in
// processorOptions. Compiling it here would block the audio thread for the
// length of a 1.5 MB compile; instantiating a compiled module is cheap.
//
// Buffering: the render quantum is 128 samples and RNNoise works on 480-sample
// frames. Samples are gathered into a frame, the frame is denoised in place and
// queued for output. The output queue starts with PRIME samples of silence: 448
// is the smallest head start for which a 128-sample quantum is always
// available, given that frames complete at quantum boundaries (the check script
// proves both that 448 never runs dry and that 447 does). That is 9.3 ms, where
// the previous worklet held 640 (13.3 ms).

const FRAME = 480;
const PRIME = 448;
const QUEUE = 4096;
const PCM_SCALE = 32768;
// RNNoise 0.2 hands each sample back 960 samples (20 ms) after it went in; the
// check script measures it on the real model. The suppression limit below
// needs the raw input aligned to that, or mixing the two comb-filters speech.
const MODEL_DELAY = 960;
const DRY = 2048; // raw input history, more than MODEL_DELAY + FRAME

// Voice gate: between phrases nothing at all is sent, as in Discord's voice
// activity mode. Decided once per frame from the model's voice probability and
// the denoised frame's level; applied per sample as samples leave the queue.
//
//   auto:   open on vad >= openVad, or on a denoised level >= openDb with
//           vad >= levelVad; stay open while vad >= keepVad; all only above
//           minDb; hold for holdMs after the last voiced frame.
//   manual: open while the denoised level is >= thresholdDb, same hold
//   off:    always open
//
// The level rule is there for words the voice probability alone never opens
// for: on the noise test bench, 27 of 445 word onsets stayed shut for 200 ms
// with the voice probability rule alone, 6 with the level rule. Denoised noise
// sits near -90 dBFS, so what is left at -52 is nearly always speech; the
// small levelVad floor keeps loud clicks (voice probability ~0.01) out.
//
// Look-ahead: lookaheadFrames delays the output by that many frames (10 ms
// each) and opens the gate when any frame up to that far ahead is voiced. On
// the bench it bought nothing with RNNoise (word onsets open within 1 ms at
// the 95th percentile without it), so it is 0. It is fixed when the processor
// is built, since changing it means changing the delay.
const DEFAULT_GATE = {
  mode: "auto",
  openVad: 0.6,
  keepVad: 0.3,
  holdMs: 250,
  minDb: -60,
  openDb: -52,
  levelVad: 0.05,
  thresholdDb: -50,
  lookaheadFrames: 0,
};
const SAMPLE_RATE = 48000;
const ATTACK = 1 - Math.exp(-1 / (0.002 * SAMPLE_RATE));
const RELEASE = 1 - Math.exp(-1 / (0.08 * SAMPLE_RATE));
const DECISIONS = 64; // frames of decision history, far more than the queue holds

// Frame-time histogram for the report: 0.05 ms buckets up to 20 ms.
const BUCKET_MS = 0.05;
const BUCKETS = 400;
const REPORT_EVERY_FRAMES = 100; // one second

// Chromium's worklet scope may have no performance.now(); Date.now() then
// counts whole milliseconds. Its mean over many frames is still unbiased (a
// 0.7 ms frame crosses a millisecond boundary 70% of the time), but p99 and max
// come in 1 ms steps. The report says which clock it used.
const HAS_PERFORMANCE =
  typeof performance !== "undefined" && typeof performance.now === "function";
const now = HAS_PERFORMANCE ? () => performance.now() : () => Date.now();

// Any import the module declares gets an inert stub. RNNoise is pure
// computation; whatever WASI calls libc links in (an abort path writing to
// stderr) are never reached in normal operation.
function stubImports(module) {
  const imports = {};
  for (const imp of WebAssembly.Module.imports(module)) {
    if (imp.kind === "function") {
      (imports[imp.module] ??= {})[imp.name] = () => 0;
    }
  }
  return imports;
}

// RNNoise 0.2 built as a WASI reactor: rnnoise_create, rnnoise_process_frame
// (returns the frame's voice probability), rnnoise_destroy, malloc, free.
function createRnnoise(module) {
  const instance = new WebAssembly.Instance(module, stubImports(module));
  const ex = instance.exports;
  ex._initialize?.();
  const state = ex.rnnoise_create(0);
  const ptr = ex.malloc(FRAME * 4);
  let heap = new Float32Array(ex.memory.buffer, ptr, FRAME);
  return {
    // In place, samples in [-1, 1]. RNNoise expects 16-bit scale.
    process(frame) {
      if (heap.buffer !== ex.memory.buffer) {
        heap = new Float32Array(ex.memory.buffer, ptr, FRAME);
      }
      for (let i = 0; i < FRAME; i++) heap[i] = frame[i] * PCM_SCALE;
      const vad = ex.rnnoise_process_frame(state, ptr, ptr);
      for (let i = 0; i < FRAME; i++) frame[i] = heap[i] / PCM_SCALE;
      return vad;
    },
    destroy() {
      ex.rnnoise_destroy(state);
      ex.free(ptr);
    },
  };
}

class VoiceProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = options?.processorOptions ?? {};
    this.model = opts.model ?? "rnnoise";
    this.denoiser = createRnnoise(opts.wasmModule);

    this.frame = new Float32Array(FRAME);
    this.frameFill = 0;
    this.queue = new Float32Array(QUEUE);

    // Suppression limit, as DeepFilterNet's atten_lim: the raw input, aligned
    // with the model's output, is mixed back in at -attenLimitDb, so noise is
    // lowered by at most that much while speech, which the model lets
    // through, comes out as it went in. 0 or unset: no limit.
    this.dryMix = opts.attenLimitDb > 0 ? 10 ** (-opts.attenLimitDb / 20) : 0;
    this.dry = new Float32Array(DRY);
    this.dryAt = 0;

    this.gateOpen = false;
    this.holdLeft = 0;
    this.gain = 0;
    this.setGate(opts.gate);
    this.lookahead = this.gate.mode === "off" ? 0 : this.gate.lookaheadFrames;
    this.prime = PRIME + this.lookahead * FRAME;
    this.readAt = 0;
    this.writeAt = this.prime;
    this.decisions = new Uint8Array(DECISIONS);
    this.framesWritten = 0;
    this.openFrames = 0;

    this.histogram = new Uint32Array(BUCKETS + 1);
    this.frames = 0;
    this.totalMs = 0;
    this.maxMs = 0;
    this.underruns = 0;
    this.vadSum = 0;

    this.port.onmessage = (event) => {
      if (event.data?.type === "destroy") {
        this.destroyed = true;
        this.denoiser.destroy();
      } else if (event.data?.type === "gate") {
        this.setGate(event.data.gate);
      }
    };
  }

  setGate(gate) {
    this.gate = { ...DEFAULT_GATE, ...gate };
    this.holdFrames = Math.round(this.gate.holdMs / 10);
    // Off means untouched audio from the first sample, not a 2 ms fade-in.
    if (this.gate.mode === "off") this.gain = 1;
  }

  // One decision per denoised frame, kept with the frame's index.
  decide(vad) {
    let energy = 0;
    for (let i = 0; i < FRAME; i++) energy += this.frame[i] * this.frame[i];
    const levelDb = 10 * Math.log10(energy / FRAME + 1e-12);
    const g = this.gate;
    let voice;
    if (g.mode === "off") {
      voice = true;
    } else if (g.mode === "manual") {
      voice = levelDb >= g.thresholdDb;
    } else {
      voice =
        levelDb >= g.minDb &&
        (vad >= g.openVad ||
          (levelDb >= g.openDb && vad >= g.levelVad) ||
          (this.gateOpen && vad >= g.keepVad));
    }
    if (voice) {
      this.gateOpen = true;
      this.holdLeft = this.holdFrames;
    } else if (this.holdLeft > 0) {
      this.holdLeft -= 1;
    } else {
      this.gateOpen = false;
    }
    this.decisions[this.framesWritten % DECISIONS] = this.gateOpen ? 1 : 0;
    this.framesWritten += 1;
    if (this.gateOpen) this.openFrames += 1;
  }

  // Open for a sample if its own frame or any of the next `lookahead` frames
  // is open. A frame not decided yet counts as the latest decision.
  gateTarget(sampleAt) {
    if (this.gate.mode === "off") return 1;
    if (sampleAt < this.prime) return 0;
    const first = Math.floor((sampleAt - this.prime) / FRAME);
    for (let f = first; f <= first + this.lookahead; f++) {
      if (f >= this.framesWritten) return this.gateOpen ? 1 : 0;
      if (this.decisions[f % DECISIONS]) return 1;
    }
    return 0;
  }

  denoiseFrame() {
    const started = now();
    const vad = this.denoiser.process(this.frame);
    const ms = now() - started;
    this.decide(vad); // on the model's output alone, before the limit

    if (this.dryMix > 0) {
      const from = this.dryAt - FRAME - MODEL_DELAY;
      for (let i = 0; i < FRAME; i++) {
        const dry = from + i < 0 ? 0 : this.dry[(from + i) % DRY];
        this.frame[i] += this.dryMix * (dry - this.frame[i]);
      }
    }

    for (let i = 0; i < FRAME; i++) {
      this.queue[(this.writeAt + i) % QUEUE] = this.frame[i];
    }
    this.writeAt += FRAME;

    this.frames += 1;
    this.totalMs += ms;
    if (ms > this.maxMs) this.maxMs = ms;
    this.histogram[Math.min(BUCKETS, Math.floor(ms / BUCKET_MS))] += 1;
    this.vadSum += vad;
    if (this.frames === REPORT_EVERY_FRAMES) this.report();
  }

  report() {
    let seen = 0;
    let p99 = BUCKETS;
    const target = Math.ceil(this.frames * 0.99);
    for (let b = 0; b <= BUCKETS; b++) {
      seen += this.histogram[b];
      if (seen >= target) {
        p99 = b;
        break;
      }
    }
    this.port.postMessage({
      type: "stats",
      model: this.model,
      frames: this.frames,
      meanMs: this.totalMs / this.frames,
      p99Ms: (p99 + 1) * BUCKET_MS,
      maxMs: this.maxMs,
      underruns: this.underruns,
      vadMean: this.vadSum / this.frames,
      gateOpenRatio: this.openFrames / this.frames,
      clock: HAS_PERFORMANCE ? "performance" : "date",
    });
    this.histogram.fill(0);
    this.frames = 0;
    this.totalMs = 0;
    this.maxMs = 0;
    this.underruns = 0;
    this.vadSum = 0;
    this.openFrames = 0;
  }

  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!input || !output || this.destroyed) {
      return true;
    }

    for (let i = 0; i < input.length; i++) {
      this.frame[this.frameFill++] = input[i];
      this.dry[this.dryAt++ % DRY] = input[i];
      if (this.frameFill === FRAME) {
        this.denoiseFrame();
        this.frameFill = 0;
      }
    }

    if (this.writeAt - this.readAt < output.length) {
      // Never expected after the head start; counted so the stats would show it.
      this.underruns += 1;
      return true;
    }
    for (let i = 0; i < output.length; i++) {
      const at = this.readAt + i;
      const target = this.gateTarget(at);
      this.gain += (target - this.gain) * (target > this.gain ? ATTACK : RELEASE);
      if (target === 0 && this.gain < 1e-4) this.gain = 0; // true silence, so Opus DTX engages
      output[i] = this.queue[at % QUEUE] * this.gain;
    }
    this.readAt += output.length;
    return true;
  }
}

registerProcessor("connect-voice", VoiceProcessor);
