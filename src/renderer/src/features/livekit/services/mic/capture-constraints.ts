const KEYS = [
  "echoCancellation",
  "noiseSuppression",
  "autoGainControl",
  "channelCount",
] as const;

// Constraints come back plain or as { ideal } / { exact }.
const unwrap = (value: unknown): unknown =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? ((value as { exact?: unknown }).exact ??
      (value as { ideal?: unknown }).ideal)
    : value;

/**
 * True when `current` dropped or changed a capture setting `desired` asks for.
 * livekit restarts an ended microphone with the device id only, which loses
 * these; the device id itself is deliberately not compared.
 */
export const lostCaptureConstraints = (
  current: MediaTrackConstraints,
  desired: MediaTrackConstraints,
): boolean =>
  KEYS.some((key) => {
    const wanted = unwrap(desired[key]);
    return wanted !== undefined && unwrap(current[key]) !== wanted;
  });
