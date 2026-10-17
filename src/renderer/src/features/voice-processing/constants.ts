import { type NoiseSuppressionPreset } from "./types";

export interface NoiseSuppressionPresetOption {
  id: NoiseSuppressionPreset;
  label: string;
  description: string;
}

export const NOISE_SUPPRESSION_PRESET_OPTIONS: NoiseSuppressionPresetOption[] = [
  {
    id: "natural",
    label: "Doğal",
    description: "Arka plan sesini tamamen silmez, kısar. Sesin en doğal hâli.",
  },
  {
    id: "balanced",
    label: "Dengeli",
    description: "Arka plan gürültüsünü siler. Konuşmadığında karşıya hiç ses gitmez.",
  },
  {
    id: "aggressive",
    label: "Agresif",
    description: "Dengeli gibi; ayrıca konuşman bitince mikrofon daha çabuk susar.",
  },
];

export const DEFAULT_NOISE_SUPPRESSION_PRESET: NoiseSuppressionPreset = "balanced";

export const normalizeNoiseSuppressionPreset = (
  value: unknown,
): NoiseSuppressionPreset => {
  if (value === "natural" || value === "aggressive") {
    return value;
  }

  return DEFAULT_NOISE_SUPPRESSION_PRESET;
};
