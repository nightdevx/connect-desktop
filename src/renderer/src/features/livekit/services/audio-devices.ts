export const COMMUNICATIONS_DEVICE_ID = "communications";

export const findCommunicationsDeviceId = async (
  kind: MediaDeviceKind,
): Promise<string | undefined> => {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.enumerateDevices !== "function"
  ) {
    return undefined;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const hasCommunications = devices.some(
      (device) =>
        device.kind === kind && device.deviceId === COMMUNICATIONS_DEVICE_ID,
    );
    return hasCommunications ? COMMUNICATIONS_DEVICE_ID : undefined;
  } catch {
    return undefined;
  }
};
