import { logLiveKitDebug } from "../debug-log";

export class DeviceResolver {
  public constructor(private readonly onWarning?: (message: string) => void) {}

  public async resolvePreferredInputDeviceId(
    selectedInputDeviceId: string | null,
  ): Promise<string | undefined> {
    if (!selectedInputDeviceId) {
      return undefined;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.enumerateDevices !== "function"
    ) {
      return selectedInputDeviceId;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasSelectedInput = devices.some(
        (device) =>
          device.kind === "audioinput" &&
          device.deviceId === selectedInputDeviceId,
      );

      if (hasSelectedInput) {
        return selectedInputDeviceId;
      }

      this.onWarning?.(
        "Seçili mikrofon bulunamadı, varsayılan mikrofon kullanılacak.",
      );
      logLiveKitDebug("mic-controller", "selected-device-not-found", {
        selectedInputDeviceId,
      });
      return undefined;
    } catch {
      logLiveKitDebug("mic-controller", "resolve-device-enumeration-failed", {
        selectedInputDeviceId,
      });
      return selectedInputDeviceId;
    }
  }
}
