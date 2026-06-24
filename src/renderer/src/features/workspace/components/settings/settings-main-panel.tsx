import type { UserRole } from "@shared/auth-contracts";
import type { SettingsSection } from "@/store/ui-store";
import { SettingsApplication } from "./settings-application";
import { SettingsProfile } from "./settings-profile";
import { SettingsSecurity } from "./settings-security";
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
  currentUserRole: UserRole;
  currentUserCreatedAt: string;
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
  currentUserRole,
  currentUserCreatedAt,
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
  return (
    <div className="ct-settings-main-panel">
      {settingsSection === "profile" && (
        <SettingsProfile
          currentUsername={currentUsername}
          onLogout={onLogout}
          isLoggingOut={isLoggingOut}
        />
      )}

      {settingsSection === "security" && <SettingsSecurity />}

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


