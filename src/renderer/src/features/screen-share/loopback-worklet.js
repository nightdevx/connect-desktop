// AudioWorklet that turns interleaved Float32 stereo PCM (pushed from the main
// process via port messages) into a continuous 2-channel audio output, which a
// MediaStreamDestination then exposes as a MediaStreamTrack for LiveKit.
//
// Plain JS (loaded via addModule) — runs on the audio render thread.

const MAX_QUEUED_SAMPLES = 96000 * 2; // ~1s stereo; drop oldest on overflow

class LoopbackSourceProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = []; // array of Float32Array chunks (interleaved stereo)
    this.readChunk = 0;
    this.readOffset = 0;
    this.queuedSamples = 0;

    this.port.onmessage = (event) => {
      const samples = event.data;
      if (!(samples instanceof Float32Array) || samples.length === 0) {
        return;
      }
      this.queue.push(samples);
      this.queuedSamples += samples.length;

      // Bound latency/memory: drop oldest chunks if we fall too far behind.
      while (this.queuedSamples > MAX_QUEUED_SAMPLES && this.queue.length > 1) {
        const dropped = this.queue.shift();
        if (this.readChunk > 0) {
          // Dropped chunk was fully ahead of the read pointer: full deduction.
          this.queuedSamples -= dropped.length;
          this.readChunk -= 1;
        } else {
          // Dropping the chunk currently being read: process() already
          // subtracted readOffset samples, so only the unread tail remains.
          this.queuedSamples -= dropped.length - this.readOffset;
          this.readOffset = 0;
        }
      }
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    const left = output[0];
    const right = output[1] ?? output[0];
    const frames = left.length;

    for (let i = 0; i < frames; i += 1) {
      const chunk = this.queue[this.readChunk];
      if (!chunk) {
        // Underrun: output silence until more PCM arrives.
        left[i] = 0;
        if (right !== left) right[i] = 0;
        continue;
      }

      left[i] = chunk[this.readOffset] ?? 0;
      if (right !== left) {
        right[i] = chunk[this.readOffset + 1] ?? chunk[this.readOffset] ?? 0;
      }

      this.readOffset += 2;
      this.queuedSamples -= 2;
      if (this.readOffset >= chunk.length) {
        this.readOffset = 0;
        this.readChunk += 1;
        // Compact the queue once we've drained leading chunks.
        if (this.readChunk > 32) {
          this.queue.splice(0, this.readChunk);
          this.readChunk = 0;
        }
      }
    }

    return true;
  }
}

registerProcessor("loopback-source", LoopbackSourceProcessor);
