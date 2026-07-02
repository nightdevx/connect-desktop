import loopbackWorkletUrl from "./loopback-worklet.js?url";

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
    console.log("[loopback-audio] startSystemAudioLoopback result:", result);
    if (!result.ok || !result.sampleRate) {
      console.warn(
        "[loopback-audio] loopback unavailable:",
        result.error ?? "no sampleRate",
      );
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

      let framesReceived = 0;
      const unsubscribe = window.streaming.onSystemAudioPcm((samples) => {
        framesReceived += 1;
        if (framesReceived === 1 || framesReceived % 200 === 0) {
          console.log(
            `[loopback-audio] PCM frames received: ${framesReceived} (chunk ${samples.length})`,
          );
        }
        // Copy into a transferable buffer for the worklet port.
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

      active = { ctx, node, destination, unsubscribe, track };
      console.log(
        `[loopback-audio] loopback audio track ready (sampleRate=${result.sampleRate})`,
      );
      return track;
    } catch (error) {
      console.warn("[loopback-audio] failed to build loopback track:", error);
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
