const DAY_MS = 24 * 60 * 60 * 1_000;

/**
 * The app looks for a new version on start, at most once a day. True when no
 * check is remembered, when a day or more has passed, or when the remembered
 * time lies in the future (the clock was moved back).
 */
export const shouldCheckOnStart = (lastCheckAtMs: number | null, nowMs: number): boolean =>
  lastCheckAtMs === null || lastCheckAtMs > nowMs || nowMs - lastCheckAtMs >= DAY_MS;
