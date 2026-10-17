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
    description: "Sesi daha canlı tutar, hafif arka plan temizliği yapar.",
  },
  {
    id: "balanced",
    label: "Dengeli",
    description: "Konuşma netliği ve gürültü bastırma arasında denge kurar.",
  },
  {
    id: "aggressive",
    label: "Agresif",
    description: "Klavye, tıklama ve fan gibi sesleri daha sert bastırır.",
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
