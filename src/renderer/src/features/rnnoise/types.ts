export type NoiseSuppressionPreset = "natural" | "balanced" | "aggressive";
export type ActiveNoiseSuppressionMode = "none" | "browser" | "processor";

export interface NoiseSuppressionPreferences {
  enabled: boolean;
  preset: NoiseSuppressionPreset;
}
