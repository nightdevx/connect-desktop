export const UPDATE_EVENT_CHANNEL = "desktop:update-event";

export type AppUpdatePhase =
  | "idle"
  | "disabled"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "not-available"
  | "installing"
  | "error";

export interface AppUpdateSnapshot {
  phase: AppUpdatePhase;
  currentVersion: string;
  nextVersion: string | null;
  releaseName: string | null;
  releaseDate: string | null;
  progressPercent: number | null;
  message: string;
  timestamp: string;
}

export type AppUpdateEvent =
  | {
      type: "update-state";
      state: AppUpdateSnapshot;
    }
  | {
      type: "update-error";
      state: AppUpdateSnapshot;
      errorCode: string;
      errorMessage: string;
    };
