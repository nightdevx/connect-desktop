// Who is talking, and how we know.
//
// There are two ways to answer that, and they are not equally good:
//
//   * The LiveKit server's active-speaker list — Participant.isSpeaking, and the
//     ActiveSpeakersChanged event. The SFU recomputes it on an interval (~400ms
//     by default) with its own smoothing on top, it reports only the loudest
//     few, and livekit-client buffers the event entirely while the room is
//     reconnecting. A short word can start and finish without ever being
//     mentioned.
//
//   * An AnalyserNode on the audio this client is already decoding and playing.
//     Sampled ten times a second off the real waveform, so it sees the same word
//     the user hears, at the moment they hear it.
//
// The app used to measure ITSELF with the second and EVERYONE ELSE with the
// first. That asymmetry is the whole bug: the local ring tracked speech
// faithfully while other people's rings came and went, because they were driven
// by a coarse remote estimate that drops short utterances. Everyone whose audio
// we have is measured the same way now; the server's word is the fallback for
// people we are not receiving at all (deafened, or not yet subscribed), where
// there is nothing to measure.

/**
 * Instantaneous RMS of the waveform, 0..1.
 *
 * Time domain, deliberately, not getByteFrequencyData. The frequency path is
 * smoothed by smoothingTimeConstant and mapped through minDecibels/maxDecibels
 * (-100..-30 by default), so its byte average sits just above zero for
 * *anything at all* — the only threshold that works with it is one so low that
 * room noise, a fan and a keyboard all trip it. RMS is linear amplitude, which
 * is what a speech gate actually wants.
 */
export function readRmsLevel(
  analyser: AnalyserNode,
  buffer: Uint8Array<ArrayBuffer>,
): number {
  analyser.getByteTimeDomainData(buffer);

  let sumSquares = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    const sample = (buffer[index] - 128) / 128;
    sumSquares += sample * sample;
  }

  return Math.sqrt(sumSquares / buffer.length);
}

// Hysteresis. Somebody talking quietly sits right on top of a single threshold
// and crosses it several times a second, which is a strobing ring — the other
// half of "sometimes it shows, sometimes it doesn't". Turning on takes more
// signal than staying on does.
//
// ~-38 dBFS to start, ~-44 dBFS to stop. Both are above a normal microphone's
// noise floor and below quiet speech; the gap is what stops the flicker.
export const SPEAKING_ON_RMS = 0.012;
export const SPEAKING_OFF_RMS = 0.006;

// Five ticks of the 100ms sampler. A pause between two words is longer than a
// frame and shorter than this, so the ring rides over it instead of blinking.
// Turning ON is never delayed — that is the one thing a speaking indicator
// cannot afford.
export const SPEAKING_HOLD_TICKS = 5;

export interface SpeakingSample {
  /**
   * RMS of this person's audio, or null when this client is not receiving it —
   * deafened, not yet subscribed, or the local capture is not running. null is
   * "no opinion", NOT "silent".
   */
  level: number | null;
  /** LiveKit's server-side active-speaker flag for this participant. */
  serverSpeaking: boolean;
  /**
   * Whether a live, unmuted microphone publication exists. False covers both a
   * self-mute and a moderator's force-mute, and both must put the ring out
   * immediately rather than after the hold below.
   */
  micLive: boolean;
}

export interface SpeakingTrack {
  speaking: boolean;
  /** Ticks of hangover left. Only meaningful while speaking is true. */
  hold: number;
}

export const NOT_SPEAKING: SpeakingTrack = { speaking: false, hold: 0 };

/**
 * One tick of the speaking state machine for one participant.
 *
 * Pure, so the decision can be tested without WebAudio, a room or a browser —
 * see scripts/check-speaking-state.cjs.
 */
export function advanceSpeaking(
  previous: SpeakingTrack,
  sample: SpeakingSample,
): SpeakingTrack {
  // Nothing is on the wire, so nothing can be arriving and no hangover survives
  // it. This is what makes a force-mute take the ring off on the spot.
  if (!sample.micLive) {
    return NOT_SPEAKING;
  }

  // Our own measurement wins whenever we have one. The server's flag is an
  // estimate of the same audio made half a second ago and two hops away; when
  // the waveform is in hand there is no reason to prefer it, and preferring it
  // is what left rings lit after someone stopped and dark while they talked.
  const raw =
    sample.level === null
      ? sample.serverSpeaking
      : sample.level >= (previous.speaking ? SPEAKING_OFF_RMS : SPEAKING_ON_RMS);

  if (raw) {
    return { speaking: true, hold: SPEAKING_HOLD_TICKS };
  }

  if (previous.hold > 0) {
    return { speaking: true, hold: previous.hold - 1 };
  }

  return NOT_SPEAKING;
}
