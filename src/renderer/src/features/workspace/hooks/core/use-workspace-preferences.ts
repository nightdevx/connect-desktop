import { useState, useCallback, useEffect } from "react";
import type {
  AudioPreferences,
  CameraPreferences,
  StreamPreferences,
} from "../../components/settings/settings-main-panel-types";
import {
  readAudioPreferences,
  readCameraPreferences,
  readStreamPreferences,
  saveAudioPreferences as persistAudioPreferences,
  saveCameraPreferences as persistCameraPreferences,
  saveStreamPreferences as persistStreamPreferences,
} from "../../workspace-media-utils";

interface UseWorkspacePreferencesProps {
  onAudioPreferencesChanged?: (
    next: AudioPreferences,
    previous: AudioPreferences,
  ) => void;
}

export function useWorkspacePreferences({
  onAudioPreferencesChanged,
}: UseWorkspacePreferencesProps = {}) {
  const [cameraPreferences, setCameraPreferences] = useState<CameraPreferences>(
    readCameraPreferences,
  );
  const [audioPreferences, setAudioPreferences] = useState<AudioPreferences>(
    readAudioPreferences,
  );
  const [streamPreferences, setStreamPreferences] = useState<StreamPreferences>(
    readStreamPreferences,
  );

  // Lives in the main process (it is applied as a startup command-line switch),
  // but the publish path needs it to pick a codec the GPU can actually encode.
  const [hardwareAcceleration, setHardwareAcceleration] = useState(true);

  useEffect(() => {
    let active = true;

    void window.desktopApi
      .getAppPreferences()
      .then((result) => {
        if (!active || !result.ok || !result.data?.preferences) {
          return;
        }
        setHardwareAcceleration(result.data.preferences.hardwareAcceleration);
      })
      .catch(() => {
        // Defaults to enabled; the codec fallback is only a quality trade-off.
      });

    return () => {
      active = false;
    };
  }, []);

  const saveCameraPreferences = useCallback((next: CameraPreferences): void => {
    setCameraPreferences(next);
    persistCameraPreferences(next);
  }, []);

  const saveAudioPreferences = useCallback(
    (next: AudioPreferences): void => {
      const previous = audioPreferences;
      setAudioPreferences(next);
      persistAudioPreferences(next);
      if (onAudioPreferencesChanged) {
        onAudioPreferencesChanged(next, previous);
      }
    },
    [audioPreferences, onAudioPreferencesChanged],
  );

  const saveStreamPreferences = useCallback((next: StreamPreferences): void => {
    setStreamPreferences(next);
    persistStreamPreferences(next);
  }, []);

  return {
    cameraPreferences,
    audioPreferences,
    streamPreferences,
    hardwareAcceleration,
    saveCameraPreferences,
    saveAudioPreferences,
    saveStreamPreferences,
  };
}



