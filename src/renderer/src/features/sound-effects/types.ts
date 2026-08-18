export interface OscillatorTone {
  frequency: number;
  /**
   * The body of the note: attack plus sustain, up to where the tail starts.
   *
   * NOT the whole sound — releaseMs rings on after this, and the next tone in
   * the pattern starts counting from here rather than from the end of the tail.
   * That overlap is what makes a two- or three-note cue read as one chime
   * instead of a row of separate beeps.
   */
  durationMs: number;
  gain: number;
  type?: OscillatorType;
  glideToFrequency?: number;
  glideMs?: number;
  pauseAfterMs?: number;
  overtoneFrequency?: number;
  overtoneGainRatio?: number;
  filterFrequency?: number;
  /**
   * How long the note takes to reach full volume. A few milliseconds is a
   * click; 40ms+ is a swell. Left short by default, because a percussive emote
   * wants the click.
   */
  attackMs?: number;
  /**
   * The tail. This is where "soft" comes from: a cue that stops dead sounds
   * like a beep however quiet it is, and one that decays over a few hundred
   * milliseconds sounds like an instrument however loud it is.
   *
   * Default is deliberately tiny, so the percussive emote patterns keep the
   * abrupt endings they were tuned with.
   */
  releaseMs?: number;
}

export interface SoundEffectOptions {
  enabled: boolean;
}
