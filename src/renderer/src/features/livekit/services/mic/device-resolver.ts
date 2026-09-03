import { logLiveKitDebug } from "@/services/debug-log";
import { findCommunicationsDeviceId } from "../audio-devices";

export class DeviceResolver {
  public constructor(private readonly onWarning?: (message: string) => void) {}

  public async resolvePreferredInputDeviceId(
    selectedInputDeviceId: string | null,
  ): Promise<string | undefined> {
    if (!selectedInputDeviceId) {
      return findCommunicationsDeviceId("audioinput");
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
      return findCommunicationsDeviceId("audioinput");
    } catch {
      logLiveKitDebug("mic-controller", "resolve-device-enumeration-failed", {
        selectedInputDeviceId,
      });
      return selectedInputDeviceId;
    }
  }
}
