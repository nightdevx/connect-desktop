import { useCallback, useEffect, useState } from "react";

export function useMediaDevices() {
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);

  const refreshAudioDevices = useCallback(async (): Promise<void> => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.enumerateDevices !== "function"
    ) {
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioInputDevices(
        devices.filter((device) => device.kind === "audioinput"),
      );
      setAudioOutputDevices(
        devices.filter((device) => device.kind === "audiooutput"),
      );
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    void refreshAudioDevices();

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.addEventListener !== "function"
    ) {
      return;
    }

    const handleDeviceChange = (): void => {
      void refreshAudioDevices();
    };

    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener(
        "devicechange",
        handleDeviceChange,
      );
    };
  }, [refreshAudioDevices]);

  return {
    audioInputDevices,
    audioOutputDevices,
    refreshAudioDevices,
  };
}
