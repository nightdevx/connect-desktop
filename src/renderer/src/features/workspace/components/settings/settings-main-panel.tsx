import { useEffect, useRef } from "react";
import type { SettingsSection } from "@/store/ui-store";
import { SettingsApplication } from "./settings-application";
import { SettingsProfile } from "./settings-profile";
import { SettingsSecurity } from "./settings-security";
import { SettingsPrivacy } from "./settings-privacy";
import { SettingsCamera } from "./settings-camera";
import { SettingsAudio } from "./settings-audio";
import { SettingsStream } from "./settings-stream";
import type {
  CameraPreferences,
  AudioPreferences,
  StreamPreferences,
} from "./settings-main-panel-types";

interface SettingsMainPanelProps {
  settingsSection: SettingsSection;
  currentUsername: string;
  onLogout: () => void;
  isLoggingOut: boolean;
  cameraPreferences: CameraPreferences;
  audioPreferences: AudioPreferences;
  audioInputDevices: MediaDeviceInfo[];
  audioOutputDevices: MediaDeviceInfo[];
  streamPreferences: StreamPreferences;
  onSaveCameraPreferences: (next: CameraPreferences) => void;
  onSaveAudioPreferences: (next: AudioPreferences) => void;
  onSaveStreamPreferences: (next: StreamPreferences) => void;
}

export function SettingsMainPanel({
  settingsSection,
  currentUsername,
  onLogout,
  isLoggingOut,
  cameraPreferences,
  audioPreferences,
  audioInputDevices,
  audioOutputDevices,
  streamPreferences,
  onSaveCameraPreferences,
  onSaveAudioPreferences,
  onSaveStreamPreferences,
}: SettingsMainPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  // A new page starts at its own top. The scroller is the shell's panel, not
  // this element, and it is shared by every section -- so arriving at the short
  // Kamera page from the bottom of the long Ses page left the reader below
  // everything the new page has. Read off the DOM rather than threaded down as
  // a ref: the shell has no interest in which settings page is open.
  useEffect(() => {
    panelRef.current?.closest(".ct-main-panel-content")?.scrollTo({ top: 0 });
  }, [settingsSection]);

  return (
    // The panel half of the tab pattern: the sidebar's tabs point here with
    // aria-controls, and this says which of them it is currently showing.
    <div
      className="ct-settings-main-panel"
      ref={panelRef}
      id="settings-panel"
      role="tabpanel"
      aria-labelledby={`settings-tab-${settingsSection}`}
    >
      {settingsSection === "profile" && (
        <SettingsProfile
          currentUsername={currentUsername}
          onLogout={onLogout}
          isLoggingOut={isLoggingOut}
        />
      )}

      {settingsSection === "security" && <SettingsSecurity />}

      {settingsSection === "privacy" && <SettingsPrivacy />}

      {settingsSection === "camera" && (
        <SettingsCamera
          cameraPreferences={cameraPreferences}
          onSaveCameraPreferences={onSaveCameraPreferences}
        />
      )}

      {settingsSection === "audio" && (
        <SettingsAudio
          audioPreferences={audioPreferences}
          audioInputDevices={audioInputDevices}
          audioOutputDevices={audioOutputDevices}
          onSaveAudioPreferences={onSaveAudioPreferences}
        />
      )}

      {settingsSection === "stream" && (
        <SettingsStream
          streamPreferences={streamPreferences}
          onSaveStreamPreferences={onSaveStreamPreferences}
        />
      )}

      {settingsSection === "application" && <SettingsApplication />}
    </div>
  );
}


