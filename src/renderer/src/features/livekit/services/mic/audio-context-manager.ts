import { logLiveKitDebug } from "../debug-log";

export class AudioContextManager {
  private liveKitAudioContext: AudioContext | null = null;

  public getOrCreateAudioContext(): AudioContext | null {
    if (
      this.liveKitAudioContext &&
      this.liveKitAudioContext.state !== "closed"
    ) {
      return this.liveKitAudioContext;
    }

    if (typeof window === "undefined") {
      return null;
    }

    const Ctx =
      window.AudioContext ||
      (
        window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;

    if (!Ctx) {
      return null;
    }

    try {
      this.liveKitAudioContext = new Ctx({
        latencyHint: "interactive",
        sampleRate: 48000,
      });
    } catch {
      this.liveKitAudioContext = new Ctx({ latencyHint: "interactive" });
    }

    logLiveKitDebug("mic-controller", "audio-context-created", {
      state: this.liveKitAudioContext.state,
      sampleRate: this.liveKitAudioContext.sampleRate,
    });

    return this.liveKitAudioContext;
  }

  public async closeContext(): Promise<void> {
    if (!this.liveKitAudioContext) {
      return;
    }

    const context = this.liveKitAudioContext;
    this.liveKitAudioContext = null;

    if (context.state === "closed") {
      return;
    }

    try {
      await context.close();
    } catch {
      // no-op
    }

    logLiveKitDebug("mic-controller", "audio-context-closed");
  }
}
