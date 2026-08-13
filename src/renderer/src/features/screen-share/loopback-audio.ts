import loopbackWorkletUrl from "./loopback-worklet.js?url";
import { logLiveKitDebug } from "../livekit";

// Builds a MediaStreamTrack from the main-process process-exclude loopback PCM
// stream. Because the native capture excludes Connect's own process tree, this
// track carries system/app audio WITHOUT the remote participants' voices — so
// publishing it as screen-share audio never echoes anyone back to themselves.

interface ActiveLoopback {
  ctx: AudioContext;
  node: AudioWorkletNode;
  destination: MediaStreamAudioDestinationNode;
  unsubscribe: () => void;
  track: MediaStreamTrack;
}

let active: ActiveLoopback | null = null;

const hasStreamingApi = (): boolean =>
  typeof window !== "undefined" && !!window.streaming?.startSystemAudioLoopback;

export const startSystemLoopbackAudioTrack =
  async (): Promise<MediaStreamTrack | null> => {
    if (!hasStreamingApi()) {
      return null;
    }

    await stopActiveSystemLoopback();

    const result = await window.streaming.startSystemAudioLoopback();
    logLiveKitDebug("loopback-audio", "start-result", { ...result });
    if (!result.ok || !result.sampleRate) {
      // Not an error path the user needs in the console: the caller already
      // surfaces "system audio unavailable" as a warning in the UI.
      logLiveKitDebug("loopback-audio", "unavailable", {
        reason: result.error ?? "no sampleRate",
      });
      return null;
    }

    try {
      // Match the AudioContext rate to the native capture rate so PCM plays back
      // 1:1 without resampling/pitch shift.
      const ctx = new AudioContext({ sampleRate: result.sampleRate });
      await ctx.audioWorklet.addModule(loopbackWorkletUrl);

      const node = new AudioWorkletNode(ctx, "loopback-source", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      const destination = ctx.createMediaStreamDestination();
      node.connect(destination);

      const unsubscribe = window.streaming.onSystemAudioPcm((samples) => {
        // Copy into a transferable buffer for the worklet port. No per-frame
        // logging here: this runs ~100x/second for the whole share.
        const copy = new Float32Array(samples);
        node.port.postMessage(copy, [copy.buffer]);
      });

      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      const track = destination.stream.getAudioTracks()[0] ?? null;
      if (!track) {
        unsubscribe();
        await ctx.close();
        await window.streaming.stopSystemAudioLoopback();
        return null;
      }

      // Tie the native capture's lifetime to the track it produces. Every
      // caller already stops the track; before this, only three paths inside
      // use-screen-share-controls also called stopActiveSystemLoopback, so
      // leaving the lobby or ending the settings stream test left WASAPI
      // capturing and the IPC PCM feed running indefinitely.
      //
      // addEventListener rather than onended: stopMediaStreamTracks nulls the
      // onended property, which does not remove a listener added this way.
      track.addEventListener(
        "ended",
        () => {
          void stopActiveSystemLoopback();
        },
        { once: true },
      );

      active = { ctx, node, destination, unsubscribe, track };
      logLiveKitDebug("loopback-audio", "track-ready", {
        sampleRate: result.sampleRate,
      });
      return track;
    } catch (error) {
      logLiveKitDebug("loopback-audio", "track-build-failed", { error });
      await window.streaming.stopSystemAudioLoopback();
      return null;
    }
  };

export const stopActiveSystemLoopback = async (): Promise<void> => {
  const current = active;
  active = null;
  if (!current) {
    if (hasStreamingApi()) {
      await window.streaming.stopSystemAudioLoopback().catch(() => undefined);
    }
    return;
  }

  current.unsubscribe();
  try {
    current.track.stop();
    current.node.disconnect();
    await current.ctx.close();
  } catch {
    // no-op
  }
  if (hasStreamingApi()) {
    await window.streaming.stopSystemAudioLoopback().catch(() => undefined);
  }
};
