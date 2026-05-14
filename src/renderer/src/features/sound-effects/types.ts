export interface OscillatorTone {
  frequency: number;
  durationMs: number;
  gain: number;
  type?: OscillatorType;
  glideToFrequency?: number;
  glideMs?: number;
  pauseAfterMs?: number;
  overtoneFrequency?: number;
  overtoneGainRatio?: number;
  filterFrequency?: number;
}

export interface SoundEffectOptions {
  enabled: boolean;
}
