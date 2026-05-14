import { Button, Tooltip } from "antd";
import {
  AudioOutlined,
  AudioMutedOutlined,
  CustomerServiceOutlined,
  DesktopOutlined,
  VideoCameraOutlined,
  LogoutOutlined,
} from "@ant-design/icons";

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
}: LobbyActionToolbarProps) {
  return (
    <div className="ct-lobby-stage-actions" aria-label="Lobi işlevleri">
      <Tooltip title={micEnabled ? "Mikrofonu Kapat" : "Mikrofonu Aç"}>
        <Button
          size="large"
          className={`ct-lobby-action-btn ${micEnabled ? "active" : ""}`}
          icon={micEnabled ? <AudioOutlined /> : <AudioMutedOutlined />}
          onClick={onToggleMic}
        />
      </Tooltip>

      <Tooltip title={headphoneEnabled ? "Kulaklığı Kapat" : "Kulaklığı Aç"}>
        <Button
          size="large"
          className={`ct-lobby-action-btn ${headphoneEnabled ? "active" : ""}`}
          icon={<CustomerServiceOutlined />}
          onClick={onToggleHeadphone}
        />
      </Tooltip>

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
