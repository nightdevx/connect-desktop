import { Button, Tooltip } from "antd";
import {
  AudioOutlined,
  AudioMutedOutlined,
  CustomerServiceOutlined,
  DesktopOutlined,
  VideoCameraOutlined,
  LogoutOutlined,
} from "@ant-design/icons";

import { AudioDeviceDropdown } from "../../common/AudioDeviceDropdown";

interface LobbyActionToolbarProps {
  micEnabled: boolean;
  headphoneEnabled: boolean;
  screenEnabled: boolean;
  cameraEnabled: boolean;
  isLeavingLobby: boolean;
  onToggleMic: () => void;
  onToggleHeadphone: () => void;
  onToggleScreen: () => void;
  onToggleCamera: () => void;
  onLeaveLobby: () => void;
  audioInputDevices: MediaDeviceInfo[];
  audioOutputDevices: MediaDeviceInfo[];
  selectedAudioInputDeviceId: string | null;
  selectedAudioOutputDeviceId: string | null;
  onSelectAudioInputDevice: (deviceId: string | null) => void;
  onSelectAudioOutputDevice: (deviceId: string | null) => void;
}

export function LobbyActionToolbar({
  micEnabled,
  headphoneEnabled,
  screenEnabled,
  cameraEnabled,
  isLeavingLobby,
  onToggleMic,
  onToggleHeadphone,
  onToggleScreen,
  onToggleCamera,
  onLeaveLobby,
  audioInputDevices,
  audioOutputDevices,
  selectedAudioInputDeviceId,
  selectedAudioOutputDeviceId,
  onSelectAudioInputDevice,
  onSelectAudioOutputDevice,
}: LobbyActionToolbarProps) {
  return (
    <div className="ct-lobby-stage-actions" aria-label="Lobi işlevleri">
      <AudioDeviceDropdown
        kind="input"
        devices={audioInputDevices}
        selectedDeviceId={selectedAudioInputDeviceId}
        onSelectDevice={onSelectAudioInputDevice}
      >
        <Tooltip title={micEnabled ? "Mikrofonu Kapat (Sağ tık: cihaz seç)" : "Mikrofonu Aç (Sağ tık: cihaz seç)"}>
          <Button
            size="large"
            className={`ct-lobby-action-btn ${micEnabled ? "active" : ""}`}
            icon={micEnabled ? <AudioOutlined /> : <AudioMutedOutlined />}
            onClick={onToggleMic}
          />
        </Tooltip>
      </AudioDeviceDropdown>

      <AudioDeviceDropdown
        kind="output"
        devices={audioOutputDevices}
        selectedDeviceId={selectedAudioOutputDeviceId}
        onSelectDevice={onSelectAudioOutputDevice}
      >
        <Tooltip title={headphoneEnabled ? "Kulaklığı Kapat (Sağ tık: cihaz seç)" : "Kulaklığı Aç (Sağ tık: cihaz seç)"}>
          <Button
            size="large"
            className={`ct-lobby-action-btn ${headphoneEnabled ? "active" : ""}`}
            icon={<CustomerServiceOutlined />}
            onClick={onToggleHeadphone}
          />
        </Tooltip>
      </AudioDeviceDropdown>

      <Tooltip title={screenEnabled ? "Ekran Paylaşımını Durdur" : "Ekranı Paylaş"}>
        <Button
          size="large"
          className={`ct-lobby-action-btn ${screenEnabled ? "active" : ""}`}
          icon={<DesktopOutlined />}
          onClick={onToggleScreen}
        />
      </Tooltip>

      <Tooltip title={cameraEnabled ? "Kamerayı Kapat" : "Kamerayı Aç"}>
        <Button
          size="large"
          className={`ct-lobby-action-btn ${cameraEnabled ? "active" : ""}`}
          icon={<VideoCameraOutlined />}
          onClick={onToggleCamera}
        />
      </Tooltip>

      <Tooltip title="Lobiden Ayrıl">
        <Button
          size="large"
          className="ct-lobby-action-btn danger"
          icon={<LogoutOutlined />}
          onClick={onLeaveLobby}
          loading={isLeavingLobby}
          disabled={isLeavingLobby}
        />
      </Tooltip>
    </div>
  );
}
