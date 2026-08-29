import { Button, Tooltip } from "antd";
import {
  AudioOutlined,
  AudioMutedOutlined,
  CloseOutlined,
  CustomerServiceOutlined,
  DesktopOutlined,
  PlayCircleOutlined,
  YoutubeOutlined,
  VideoCameraOutlined,
  LogoutOutlined,
} from "@ant-design/icons";

import { AudioDeviceDropdown } from "../../common/AudioDeviceDropdown";
import { StreamControlMenu } from "./StreamControlMenu";
import { SoundEmoteMenu } from "./SoundEmoteMenu";

interface LobbyActionToolbarProps {
  micEnabled: boolean;
  // A moderator took this user's microphone away. The button is disabled rather
  // than flipped: micEnabled is what the person wants, it survives the
  // restriction, and the session republishes from it the moment the mute lifts.
  micLocked: boolean;
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
  // A built-in id, or "custom:<id>" for an upload.
  onSendEmote: (emote: string) => void;
  currentUserId: string;
  currentUserRole: string;
  emotesDisabled?: boolean;
  cameraDisabled?: boolean;
  screenDisabled?: boolean;
  // The music dialog. Absent when the server runs no bot, so the toolbar does
  // not grow a button that can only ever answer "kapalı".
  onOpenMusic?: () => void;
  musicDisabled?: boolean;
  onOpenWatch?: () => void;
  watchDisabled?: boolean;
}

export function LobbyActionToolbar({
  micEnabled,
  micLocked,
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
  onSendEmote,
  currentUserId,
  currentUserRole,
  emotesDisabled,
  cameraDisabled,
  screenDisabled,
  onOpenMusic,
  musicDisabled,
  onOpenWatch,
  watchDisabled,
}: LobbyActionToolbarProps) {
  return (
    // Three groups, not one run of six. "Lobiden Ayrıl" used to sit flush
    // against the camera button, so the two clicks most easily confused for one
    // another were 12px apart; the dividers put a beat between them.
    <div className="ct-lobby-stage-actions" role="toolbar" aria-label="Lobi işlevleri">
      <AudioDeviceDropdown
        kind="input"
        devices={audioInputDevices}
        selectedDeviceId={selectedAudioInputDeviceId}
        onSelectDevice={onSelectAudioInputDevice}
      >
        <Tooltip
          title={
            micLocked
              ? "Bir yetkili mikrofonunuzu kapattı"
              : micEnabled
                ? "Mikrofonu Kapat (Sağ tık: cihaz seç)"
                : "Mikrofonu Aç (Sağ tık: cihaz seç)"
          }
        >
          <Button
            size="large"
            className={`ct-lobby-action-btn ${micLocked ? "forced-muted" : micEnabled ? "active" : ""}`}
            icon={micLocked || !micEnabled ? <AudioMutedOutlined /> : <AudioOutlined />}
            disabled={micLocked}
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

      <span className="ct-lobby-action-divider" aria-hidden="true" />

      {/* While a share is live the single toggle splits in two: stopping it and
          adjusting it were the same click, so there was no way to change
          quality or screen without dropping the stream first. */}
      {screenEnabled ? (
        <div className="ct-stream-control-group">
          <Tooltip title="Ekran Paylaşımını Durdur">
            <Button
              size="large"
              className="ct-lobby-action-btn active ct-stream-stop-btn"
              icon={<CloseOutlined />}
              onClick={onToggleScreen}
            />
          </Tooltip>
          <StreamControlMenu />
        </div>
      ) : (
        <Tooltip title={screenDisabled ? "Ekran paylaşımı bu odada kapalı" : "Ekranı Paylaş"}>
          <Button
            size="large"
            className="ct-lobby-action-btn"
            icon={<DesktopOutlined />}
            onClick={onToggleScreen}
            disabled={screenDisabled}
          />
        </Tooltip>
      )}

      <Tooltip
        title={
          cameraDisabled
            ? "Kamera bu odada kapalı"
            : cameraEnabled
              ? "Kamerayı Kapat"
              : "Kamerayı Aç"
        }
      >
        <Button
          size="large"
          className={`ct-lobby-action-btn `}
          icon={<VideoCameraOutlined />}
          onClick={onToggleCamera}
          disabled={cameraDisabled && !cameraEnabled}
        />
      </Tooltip>

      <span className="ct-lobby-action-divider" aria-hidden="true" />

      {onOpenMusic ? (
        <Tooltip title={musicDisabled ? "Müzik bu odada kapalı" : "Müzik"}>
          <Button
            size="large"
            className="ct-lobby-action-btn"
            icon={<PlayCircleOutlined />}
            onClick={onOpenMusic}
            disabled={musicDisabled}
          />
        </Tooltip>
      ) : null}

      {onOpenWatch ? (
        <Tooltip
          title={watchDisabled ? "Birlikte izleme bu odada kapalı" : "Birlikte İzle"}
        >
          <Button
            size="large"
            className="ct-lobby-action-btn"
            icon={<YoutubeOutlined />}
            onClick={onOpenWatch}
            disabled={watchDisabled}
          />
        </Tooltip>
      ) : null}

      <SoundEmoteMenu
        onSend={onSendEmote}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        disabled={isLeavingLobby || emotesDisabled}
      />

      <span className="ct-lobby-action-divider" aria-hidden="true" />

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
