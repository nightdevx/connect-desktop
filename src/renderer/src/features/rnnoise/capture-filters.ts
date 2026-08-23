import { type NoiseSuppressionPreset } from "./types";

/**
 * Which filters the microphone capture is opened with.
 *
 * This is one decision made in one place because the two halves of it have to
 * agree, and they used to be made separately: the capture constraints were
 * chosen from "does a processor object exist", and the graph was built from
 * "is noise suppression enabled and can WASM compile". Those are not the same
 * question, and every way they can disagree is audible:
 *
 *   - browser suppressor off, RNNoise not running  -> a completely unfiltered
 *     microphone, which is what the room heard on a first join while the worklets
 *     and the WASM were still loading
 *   - browser suppressor on, RNNoise running       -> two denoisers in series,
 *     which pumps and adds artefacts
 *
 * So exactly one of them denoises, always.
 */
export interface CaptureFilterDecision {
  /** getUserMedia's own noiseSuppression constraint. */
  browserNoiseSuppression: boolean;
  /** getUserMedia's own autoGainControl constraint. */
  browserAutoGainControl: boolean;
  /** Whether the RNNoise node belongs in the processing graph. */
  rnnoise: boolean;
}

/**
 * @param wantsEnhancedSuppression the user's "gelişmiş gürültü engelleme" setting
 * @param rnnoiseReady whether the worklets and the WASM are loaded and the audio
 *   context runs at the 48 kHz the model needs — established before the
 *   microphone is published, never assumed
 */
export const resolveCaptureFilters = (
  wantsEnhancedSuppression: boolean,
  rnnoiseReady: boolean,
  // Kept in the signature although the capture constraints no longer vary by
  // preset: the preset still decides the PROCESSING profile (high-pass,
  // low-pass, gate) in processor.ts, and callers pass it here as the one place
  // that answers "how should this microphone be opened".
  _preset: NoiseSuppressionPreset,
): CaptureFilterDecision => {
  // Not asked for, or asked for and unavailable: the browser is the only
  // denoiser there is, so it stays on. The processing graph is still built —
  // it carries the microphone volume and the limiter — it just has no RNNoise
  // node in it.
  if (!wantsEnhancedSuppression || !rnnoiseReady) {
    return {
      browserNoiseSuppression: true,
      browserAutoGainControl: true,
      rnnoise: false,
    };
  }

  return {
    browserNoiseSuppression: false,
    // Gain control stays on for every preset. It used to be limited to
    // "natural" on the grounds that the stronger presets "leave gain to
    // RNNoise's own gate" — but RNNoise has no gain control at all, and the gate
    // only mutes. So Dengeli (the default) and Agresif ran with no automatic
    // level at all, and a soft talker who switched off Doğal simply became
    // quieter for everyone. AGC and the denoiser do not fight: they act on
    // different things, one on level and one on stationary noise.
    browserAutoGainControl: true,
    rnnoise: true,
  };
};
