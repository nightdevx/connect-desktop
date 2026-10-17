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
    this.readAt = 0;
    this.writeAt = PRIME;

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
      }
    };
  }

  denoiseFrame() {
    const started = now();
    const vad = this.denoiser.process(this.frame);
    const ms = now() - started;

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
      clock: HAS_PERFORMANCE ? "performance" : "date",
    });
    this.histogram.fill(0);
    this.frames = 0;
    this.totalMs = 0;
    this.maxMs = 0;
    this.underruns = 0;
    this.vadSum = 0;
  }

  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!input || !output || this.destroyed) {
      return true;
    }

    for (let i = 0; i < input.length; i++) {
      this.frame[this.frameFill++] = input[i];
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
      output[i] = this.queue[(this.readAt + i) % QUEUE];
    }
    this.readAt += output.length;
    return true;
  }
}

registerProcessor("connect-voice", VoiceProcessor);
