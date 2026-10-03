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
  /**
   * This version is older than the newest release's minimum (latest.yml
   * vendor.minimumVersion): the app may not be used until it updates. False for
   * an ordinary update, which the user can take whenever they like.
   */
  mandatory: boolean;
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

/* -------------------------------------------------------------------------
   Version comparison

   Plain numeric compare over the dot-separated parts, with any `-beta.1` style
   suffix dropped first. No semver dependency: these strings come from
   package.json via app.getVersion(), so they are already well-formed, and the
   one thing that must not happen is a string compare — "0.1.9" > "0.1.75" is
   true alphabetically and false in every other sense, which would have hidden
   every note after the tenth patch release, and would let an old client think
   it is newer than a mandatory release.
   ------------------------------------------------------------------------- */

const parseVersion = (version: string): number[] =>
  version
    .trim()
    .split("-")[0]
    .split(".")
    .map((part) => {
      const parsed = Number.parseInt(part, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    });

/** Negative if a < b, positive if a > b, 0 if they are the same release. */
export const compareVersions = (a: string, b: string): number => {
  const left = parseVersion(a);
  const right = parseVersion(b);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
};
