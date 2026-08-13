// AudioWorklet that turns interleaved Float32 stereo PCM (pushed from the main
// process via port messages) into a continuous 2-channel output, which a
// MediaStreamDestination then exposes as a MediaStreamTrack for LiveKit.
//
// Plain JS (loaded via addModule) — runs on the audio render thread. Kept
// self-contained on purpose: worklet modules are loaded as standalone assets,
// so it cannot import shared helpers. scripts/check-loopback-worklet.cjs runs
// this exact file under stubbed worklet globals.
//
// The WASAPI capture clock and the AudioContext clock are independent and drift
// apart by a fraction of a percent. The previous version had no compensation:
// it queued chunks, dropped the oldest on overflow and emitted silence on
// underrun, so a long screen share accumulated periodic clicks and dropouts as
// the two clocks separated. This version resamples continuously by a tiny
// amount to hold the buffer at a target depth, which is inaudible where a
// dropped chunk is not.
//
// ponytail: PCM still crosses the IPC boundary as one structured-clone message
// per WASAPI packet (~100/s). Move to a SharedArrayBuffer ring if that shows up
// in profiles; it needs cross-origin isolation or the SharedArrayBuffer flag.

const CHANNELS = 2;
// One second of stereo audio. Large enough to absorb a scheduling hiccup,
// small enough that a hard overflow reset stays inaudible.
const CAPACITY_FRAMES = 48000;
// Buffer depth to hold. 60ms trades a little latency for immunity to the
// jitter of main-process IPC delivery.
const TARGET_FRAMES = 2880;
// Maximum resampling ratio deviation. 0.5% is far below the ~1% threshold
// where pitch change becomes audible, and an order of magnitude more than
// real soundcard drift.
const MAX_RATE_ADJUST = 0.005;
// How hard the controller pulls toward the target depth.
const RATE_GAIN = 0.00002;

class LoopbackSourceProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.buffer = new Float32Array(CAPACITY_FRAMES * CHANNELS);
    this.writeFrame = 0;
    this.readFrame = 0;
    // Fractional part of the read position, used for linear interpolation.
    this.readOffset = 0;
    this.availableFrames = 0;

    this.underruns = 0;
    this.overruns = 0;

    this.port.onmessage = (event) => {
      const samples = event.data;
      if (!(samples instanceof Float32Array) || samples.length === 0) {
        return;
      }
      this.write(samples);
    };
  }

  write(samples) {
    const frames = Math.floor(samples.length / CHANNELS);
    if (frames <= 0) {
      return;
    }

    // Hard overflow: the reader has stalled badly (tab throttled, device
    // change). Keep the newest audio and resync rather than fall further
    // behind — a one-off discontinuity beats permanent latency.
    if (this.availableFrames + frames > CAPACITY_FRAMES) {
      this.overruns += 1;
      this.readFrame = this.writeFrame;
      this.readOffset = 0;
      this.availableFrames = 0;
    }

    for (let i = 0; i < frames; i += 1) {
      const target = this.writeFrame * CHANNELS;
      this.buffer[target] = samples[i * CHANNELS];
      this.buffer[target + 1] = samples[i * CHANNELS + 1];
      this.writeFrame = (this.writeFrame + 1) % CAPACITY_FRAMES;
    }

    this.availableFrames += frames;
  }

  /**
   * Playback rate that nudges the buffer back to TARGET_FRAMES. Above 1 the
   * reader consumes faster (buffer too full); below 1 it stretches.
   */
  playbackStep() {
    const error = this.availableFrames - TARGET_FRAMES;
    const adjust = Math.max(
      -MAX_RATE_ADJUST,
      Math.min(MAX_RATE_ADJUST, error * RATE_GAIN),
    );
    return 1 + adjust;
  }

  sampleAt(frame, channel) {
    return this.buffer[((frame % CAPACITY_FRAMES) * CHANNELS) + channel];
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    const left = output[0];
    const right = output[1] ?? output[0];
    const frames = left.length;
    const step = this.playbackStep();

    for (let i = 0; i < frames; i += 1) {
      // Need two frames for interpolation.
      if (this.availableFrames < 2) {
        this.underruns += 1;
        left[i] = 0;
        if (right !== left) {
          right[i] = 0;
        }
        continue;
      }

      const nextFrame = this.readFrame + 1;
      const t = this.readOffset;

      const l0 = this.sampleAt(this.readFrame, 0);
      const l1 = this.sampleAt(nextFrame, 0);
      left[i] = l0 + (l1 - l0) * t;

      if (right !== left) {
        const r0 = this.sampleAt(this.readFrame, 1);
        const r1 = this.sampleAt(nextFrame, 1);
        right[i] = r0 + (r1 - r0) * t;
      }

      this.readOffset += step;
      while (this.readOffset >= 1 && this.availableFrames >= 2) {
        this.readOffset -= 1;
        this.readFrame = (this.readFrame + 1) % CAPACITY_FRAMES;
        this.availableFrames -= 1;
      }
    }

    return true;
  }
}

registerProcessor("loopback-source", LoopbackSourceProcessor);
