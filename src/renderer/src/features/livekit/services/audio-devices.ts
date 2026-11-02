export const COMMUNICATIONS_DEVICE_ID = "communications";

const listDevices = async (): Promise<MediaDeviceInfo[]> => {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.enumerateDevices !== "function"
  ) {
    return [];
  }

  try {
    return await navigator.mediaDevices.enumerateDevices();
  } catch {
    return [];
  }
};

export const findCommunicationsDeviceId = async (
  kind: MediaDeviceKind,
): Promise<string | undefined> => {
  const devices = await listDevices();
  const hasCommunications = devices.some(
    (device) =>
      device.kind === kind && device.deviceId === COMMUNICATIONS_DEVICE_ID,
  );
  return hasCommunications ? COMMUNICATIONS_DEVICE_ID : undefined;
};

// A Bluetooth headset's call profile. Windows names the endpoint after it
// ("Headset (WH-1000XM4 Hands-Free AG Audio)"), and the virtual "default" and
// "communications" entries carry the name of the device they stand for.
const HANDS_FREE_LABEL = /hands[\s-]?free/i;

export interface DeviceEntry {
  kind: string;
  deviceId: string;
  label: string;
}

export interface PlaybackDeviceChoice {
  /** For setSinkId: a device id, or "" for the system default. */
  deviceId: string;
  /** The endpoint that will play, when the device list names it. */
  label: string | null;
  /** That endpoint is a Bluetooth headset's Hands-Free profile. */
  handsFree: boolean;
}

/**
 * Where remote audio plays.
 *
 * A device the user picked is used as it is. With none picked, Windows'
 * "communications" endpoint is preferred, the device set aside for calls,
 * unless it is a Bluetooth headset's Hands-Free profile and the microphone is
 * not on that headset. Playing to that endpoint switches the headset into its
 * call mode for nothing: narrowband mono, for this app and for everything else
 * the headset is playing. With the headset's own microphone open it is in that
 * mode anyway, and its stereo endpoint can go silent, so the call endpoint is
 * kept.
 *
 * The microphone is the one the capture path opens (mic/device-resolver.ts):
 * the picked one while it exists, else "communications", else "default".
 */
export const pickPlaybackDevice = (
  devices: readonly DeviceEntry[],
  selectedOutputId: string | null,
  selectedInputId: string | null,
): PlaybackDeviceChoice => {
  const find = (kind: string, deviceId: string): DeviceEntry | undefined =>
    devices.find((device) => device.kind === kind && device.deviceId === deviceId);
  const isHandsFree = (device: DeviceEntry | undefined): boolean =>
    device !== undefined && HANDS_FREE_LABEL.test(device.label);

  let deviceId = selectedOutputId ?? "";
  if (!selectedOutputId) {
    const communications = find("audiooutput", COMMUNICATIONS_DEVICE_ID);
    const microphone =
      (selectedInputId ? find("audioinput", selectedInputId) : undefined) ??
      find("audioinput", COMMUNICATIONS_DEVICE_ID) ??
      find("audioinput", "default");
    const needlessCallMode =
      isHandsFree(communications) && !isHandsFree(microphone);
    if (communications && !needlessCallMode) {
      deviceId = COMMUNICATIONS_DEVICE_ID;
    }
  }

  const playing = find("audiooutput", deviceId || "default");
  return {
    deviceId,
    label: playing?.label ?? null,
    handsFree: isHandsFree(playing),
  };
};

/**
 * The real endpoint behind Windows' virtual "communications" output, for a
 * stream that has to play on the same device without being a call.
 *
 * Chromium opens "communications" through the communications role, and
 * Windows can turn every other app down while a stream in that role is open
 * (Sound settings, Communications: 80% by default). The room's voices are a
 * call and take that role on purpose. A context that stays open for the whole
 * session, like the notification cues, must not: it would hold other apps down
 * from the moment Connect starts. The virtual entry is labelled after the
 * device it stands for ("Communications - <label>"), which is how the real one
 * is found. Any other id is returned as it is; with no match, the system
 * default ("") rather than the call role.
 */
export const physicalOutputId = (
  devices: readonly DeviceEntry[],
  deviceId: string,
): string => {
  if (deviceId !== COMMUNICATIONS_DEVICE_ID) {
    return deviceId;
  }

  const virtual = devices.find(
    (device) =>
      device.kind === "audiooutput" && device.deviceId === COMMUNICATIONS_DEVICE_ID,
  );
  const real = devices.find(
    (device) =>
      device.kind === "audiooutput" &&
      device.deviceId !== COMMUNICATIONS_DEVICE_ID &&
      device.deviceId !== "default" &&
      device.label !== "" &&
      virtual !== undefined &&
      virtual.label.endsWith(` - ${device.label}`),
  );
  return real?.deviceId ?? "";
};

export const resolvePlaybackDevice = async (
  selectedOutputId: string | null,
  selectedInputId: string | null,
): Promise<PlaybackDeviceChoice> => {
  return pickPlaybackDevice(
    await listDevices(),
    selectedOutputId,
    selectedInputId,
  );
};
