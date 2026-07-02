import { app, type WebContents } from "electron";
import { join } from "node:path";
import { createRequire } from "node:module";
import {
  STREAMING_LOOPBACK_PCM_CHANNEL,
  type LoopbackStartResult,
} from "../../shared/streaming-contracts";

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

const nativeRequire = createRequire(__filename);

let addon: LoopbackAddon | null | undefined;

// Resolve the native module across dev (project root) and packaged
// (asarUnpack'd app dir) layouts. Returns null if it cannot be loaded so the
// caller can degrade to "no system audio" instead of crashing or echoing.
const loadAddon = (): LoopbackAddon | null => {
  if (addon !== undefined) {
    return addon;
  }

  const candidates = [
    // dev: dist/main/streaming -> up to project root -> native/...
    join(__dirname, "..", "..", "..", "native", "audio-loopback"),
    join(process.cwd(), "native", "audio-loopback"),
    join(app.getAppPath(), "native", "audio-loopback"),
    join(app.getAppPath(), "..", "native", "audio-loopback"),
    // packaged: native is asarUnpack'd next to resources
    join(process.resourcesPath ?? "", "native", "audio-loopback"),
    join(process.resourcesPath ?? "", "app.asar.unpacked", "native", "audio-loopback"),
  ];

  const errors: string[] = [];
  for (const candidate of candidates) {
    try {
      addon = nativeRequire(candidate) as LoopbackAddon;
      console.log(`[system-audio-loopback] native addon loaded from: ${candidate}`);
      return addon;
    } catch (error) {
      errors.push(
        `  - ${candidate}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.warn(
    "[system-audio-loopback] native addon NOT loaded; system audio capture disabled.\n" +
      `appPath=${app.getAppPath()} resourcesPath=${process.resourcesPath}\n` +
      "tried:\n" +
      errors.join("\n"),
  );
  addon = null;
  return addon;
};

class SystemAudioLoopback {
  private sender: WebContents | null = null;
  private running = false;
  private frameCount = 0;
  private lastLogAt = 0;

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
      this.lastLogAt = Date.now();
      const format = native.start((samples) => {
        this.frameCount += 1;
        // Throttled heartbeat so we can confirm PCM is actually flowing.
        const now = Date.now();
        if (now - this.lastLogAt >= 3000) {
          console.log(
            `[system-audio-loopback] capturing: ${this.frameCount} frames, last chunk ${samples.length} samples`,
          );
          this.lastLogAt = now;
        }
        if (this.sender && !this.sender.isDestroyed()) {
          this.sender.send(STREAMING_LOOPBACK_PCM_CHANNEL, samples);
        }
      });
      this.running = true;
      console.log(
        `[system-audio-loopback] started (sampleRate=${format.sampleRate}, channels=${format.channels})`,
      );

      sender.once("destroyed", () => this.stop());

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
}

export const systemAudioLoopback = new SystemAudioLoopback();
