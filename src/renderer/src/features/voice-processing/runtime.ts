import { type ActiveNoiseSuppressionMode } from "./types";

// Keeps RNNoise decision logic isolated so microphone flow changes do not break suppression behavior.
export class LiveKitNoiseSuppressionRuntime {
  private activeMode: ActiveNoiseSuppressionMode = "none";
  private readonly onModeChange?: (mode: ActiveNoiseSuppressionMode) => void;

  public constructor(onModeChange?: (mode: ActiveNoiseSuppressionMode) => void) {
    this.onModeChange = onModeChange;
  }

  public getActiveMode(): ActiveNoiseSuppressionMode {
    return this.activeMode;
  }

  public markDisabled(): void {
    if (this.activeMode === "none") {
      return;
    }
    this.activeMode = "none";
    this.onModeChange?.("none");
  }

  public markEnabled(appliedProcessor: boolean): void {
    const next: ActiveNoiseSuppressionMode = appliedProcessor
      ? "processor"
      : "browser";
    if (this.activeMode === next) {
      return;
    }
    this.activeMode = next;
    this.onModeChange?.(next);
  }
}
