import type { WebContents } from "electron";
import {
  STREAMING_LOOPBACK_PCM_CHANNEL,
  type LoopbackStartResult,
} from "../../shared/streaming-contracts";
import { loadNativeAddon } from "../utils/native-addon";

// Native addon contract: start(cb) begins WASAPI process-loopback capture that
// EXCLUDES this process tree and invokes cb(Float32Array) with interleaved
// stereo PCM; stop() ends it. See native/audio-loopback.
interface LoopbackAddon {
  start: (cb: (samples: Float32Array) => void) => {
    sampleRate: number;
    channels: number;
  };
  stop: () => void;
}

let addon: LoopbackAddon | null | undefined;

// Null when the addon cannot be loaded, so the caller can degrade to "no
// system audio" instead of crashing or echoing.
const loadAddon = (): LoopbackAddon | null => {
  if (addon === undefined) {
    addon = loadNativeAddon<LoopbackAddon>("audio-loopback");
    if (!addon) {
      console.warn("[system-audio-loopback] system audio capture disabled");
    }
  }
  return addon;
};

class SystemAudioLoopback {
  private sender: WebContents | null = null;
  private running = false;
  private frameCount = 0;
  // Kept so stop() can detach it. Registering a new `destroyed` listener on
  // every start() without removing the previous one accumulated them on the
  // same WebContents — MaxListenersExceededWarning after eleven screen-share
  // toggles — and a leftover handler from an earlier sender could stop a
  // capture that now belongs to a different window.
  private destroyHandler: (() => void) | null = null;

  public start(sender: WebContents): LoopbackStartResult {
    const native = loadAddon();
    if (!native) {
      return { ok: false, error: "native loopback module unavailable" };
    }

    // Only one capture at a time; restart cleanly if a previous one lingers.
    if (this.running) {
      this.stop();
    }

    try {
      this.sender = sender;
      this.frameCount = 0;
      const format = native.start((samples) => {
        this.frameCount += 1;
        if (this.sender && !this.sender.isDestroyed()) {
          this.sender.send(STREAMING_LOOPBACK_PCM_CHANNEL, samples);
        }
      });
      this.running = true;
      console.log(
        `[system-audio-loopback] started (sampleRate=${format.sampleRate}, channels=${format.channels})`,
      );

      this.destroyHandler = () => {
        // Only tear down if this capture still belongs to that sender.
        if (this.sender === sender) {
          this.stop();
        }
      };
      sender.once("destroyed", this.destroyHandler);

      return {
        ok: true,
        sampleRate: format.sampleRate,
        channels: format.channels,
      };
    } catch (error) {
      this.running = false;
      this.sender = null;
      console.error("[system-audio-loopback] start failed:", error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : "loopback start failed",
      };
    }
  }

  public stop(): void {
    this.detachDestroyHandler();

    if (!this.running) {
      this.sender = null;
      return;
    }
    this.running = false;
    this.sender = null;
    try {
      loadAddon()?.stop();
      console.log(
        `[system-audio-loopback] stopped (${this.frameCount} frames captured)`,
      );
    } catch (error) {
      console.warn("[system-audio-loopback] stop failed:", error);
    }
  }

  private detachDestroyHandler(): void {
    if (this.destroyHandler && this.sender && !this.sender.isDestroyed()) {
      this.sender.removeListener("destroyed", this.destroyHandler);
    }
    this.destroyHandler = null;
  }
}

export const systemAudioLoopback = new SystemAudioLoopback();
