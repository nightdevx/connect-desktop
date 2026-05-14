import { useState, useCallback } from "react";
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
    saveCameraPreferences,
    saveAudioPreferences,
    saveStreamPreferences,
  };
}



