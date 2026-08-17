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
  preset: NoiseSuppressionPreset,
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
    // "natural" keeps the browser's gain control for a gentler level; the
    // stronger presets leave gain to RNNoise's own gate, so that the two do not
    // fight each other over the same signal.
    browserAutoGainControl: preset === "natural",
    rnnoise: true,
  };
};
