import type { UserRole } from "../../../../../shared/auth-contracts";
import type { SettingsSection } from "../../../store/ui-store";
import {
  SettingsProfile,
  SettingsSecurity,
  SettingsCamera,
  SettingsAudio,
  SettingsStream,
} from "./settings";
import type {
  CameraPreferences,
  AudioPreferences,
  StreamPreferences,
} from "./settings";
export type {
  CameraPreferences,
  AudioPreferences,
  StreamPreferences,
} from "./settings";

interface SettingsMainPanelProps {
  settingsSection: SettingsSection;
  currentUsername: string;
  currentUserRole: UserRole;
  currentUserCreatedAt: string;
  onLogout: () => void;
  isLoggingOut: boolean;
  cameraPreferences: CameraPreferences;
  audioPreferences: AudioPreferences;
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
  streamPreferences,
  onSaveCameraPreferences,
  onSaveAudioPreferences,
  onSaveStreamPreferences,
}: SettingsMainPanelProps) {
  return (
    <div className="ct-settings-main-panel">
      {settingsSection === "profile" && (
        <SettingsProfile currentUsername={currentUsername} />
      )}

      {settingsSection === "security" && (
        <SettingsSecurity />
      )}

      {settingsSection === "camera" && (
        <SettingsCamera
          cameraPreferences={cameraPreferences}
          onSaveCameraPreferences={onSaveCameraPreferences}
        />
      )}

      {settingsSection === "audio" && (
        <SettingsAudio
          audioPreferences={audioPreferences}
          onSaveAudioPreferences={onSaveAudioPreferences}
        />
      )}

      {settingsSection === "stream" && (
        <SettingsStream
          streamPreferences={streamPreferences}
          onSaveStreamPreferences={onSaveStreamPreferences}
          onLogout={onLogout}
          isLoggingOut={isLoggingOut}
        />
      )}
    </div>
  );
}
