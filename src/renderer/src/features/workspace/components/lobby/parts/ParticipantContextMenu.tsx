import { Dropdown, Slider, type MenuProps } from "antd";
import {
  AudioOutlined,
  AudioMutedOutlined,
  ClockCircleOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  SoundOutlined,
  DesktopOutlined,
  MutedOutlined,
  LogoutOutlined,
  UserAddOutlined,
  UserDeleteOutlined,
  IdcardOutlined,
} from "@ant-design/icons";
import type { RemoteParticipantAudioPreference } from "@/features/livekit";

interface ParticipantContextMenuProps {
  x: number;
  y: number;
  preference: RemoteParticipantAudioPreference;
  isScreenSharing: boolean;
  onClose: () => void;
  onMute: (muted: boolean) => void;
  onVolume: (volume: number) => void;
  onToggleCameraHidden: (hidden: boolean) => void;
  onScreenAudioMute: (muted: boolean) => void;
  onScreenAudioVolume: (volume: number) => void;
  // Server-enforced moderation (owner/admin only) — distinct from the local
  // playback preferences above, which only affect what the current user hears.
  canModerate?: boolean;
  isServerMuted?: boolean;
  onServerMute?: (muted: boolean) => void;
  onKick?: () => void;
  // Screen watching is opt-in, so it needs an explicit way out. Unsubscribing
  // stops the video at the SFU rather than just hiding it locally.
  isWatchingScreen?: boolean;
  onSetScreenWatching?: (watch: boolean) => void;
  // Friendship, from the caller's own lists — the label has to say what will
  // actually happen, and an already-sent request must not be sendable twice.
  // Left undefined (and the item unrendered) when the caller cannot act on it:
  // the local user, or a participant whose username the roster never carried.
  friendState?: "friend" | "requested" | "none";
  isFriendActionPending?: boolean;
  onAddFriend?: () => void;
  onRemoveFriend?: () => void;
  // Opens the profile card. The roster carries a display name and nothing else,
  // so this is the only way to see who someone actually is from the stage.
  onShowProfile?: () => void;
}

export function ParticipantContextMenu({
  x,
  y,
  preference,
  isScreenSharing,
  onClose,
  onMute,
  onVolume,
  onToggleCameraHidden,
  onScreenAudioMute,
  onScreenAudioVolume,
  canModerate,
  isServerMuted,
  onServerMute,
  onKick,
  isWatchingScreen = false,
  onSetScreenWatching,
  friendState,
  isFriendActionPending = false,
  onAddFriend,
  onRemoveFriend,
  onShowProfile,
}: ParticipantContextMenuProps) {
  const menuItems: MenuProps['items'] = [
    {
      key: 'title',
      label: (
        <div className="ct-participant-context-menu-title">
          Katılımcı Ayarları
        </div>
      ),
      disabled: true,
    },
    ...(onShowProfile ? [
      {
        key: 'profile',
        label: 'Profili Gör',
        icon: <IdcardOutlined />,
        className: 'ct-participant-context-menu-button',
        onClick: () => {
          onShowProfile();
          onClose();
        },
      },
    ] : []),
    ...(friendState ? [
      {
        key: 'friendship',
        label:
          friendState === 'friend'
            ? 'Arkadaşlıktan Çıkar'
            : friendState === 'requested'
              ? 'İstek Gönderildi'
              : 'Arkadaş Ekle',
        icon:
          friendState === 'friend'
            ? <UserDeleteOutlined />
            : friendState === 'requested'
              ? <ClockCircleOutlined />
              : <UserAddOutlined />,
        danger: friendState === 'friend',
        disabled: friendState === 'requested' || isFriendActionPending,
        className: 'ct-participant-context-menu-button',
        onClick: () => {
          if (friendState === 'friend') {
            onRemoveFriend?.();
          } else {
            onAddFriend?.();
          }
          onClose();
        },
      },
      { type: 'divider' as const },
    ] : []),
    {
      key: 'mute',
      label: preference.muted ? 'Sesi Aç' : 'Sustur',
      icon: preference.muted ? <AudioOutlined /> : <AudioMutedOutlined />,
      className: 'ct-participant-context-menu-button',
      onClick: () => {
        onMute(!preference.muted);
        onClose();
      },
    },
    {
      key: 'camera',
      label: preference.cameraHidden ? 'Kamerayı Göster' : 'Kamerayı Gizle',
      icon: preference.cameraHidden ? <EyeOutlined /> : <EyeInvisibleOutlined />,
      className: 'ct-participant-context-menu-button',
      onClick: () => {
        onToggleCameraHidden(!preference.cameraHidden);
        onClose();
      },
    },
    {
      type: 'divider',
    },
    {
      key: 'volume-header',
      label: (
        <div className="ct-participant-context-menu-hint">
          <SoundOutlined />
          <span>Mikrofon Sesi: %{preference.volumePercent}</span>
        </div>
      ),
      disabled: true,
    },
    {
      key: 'volume-slider',
      label: (
        <div className="ct-participant-context-menu-volume" onClick={(e) => e.stopPropagation()}>
          <Slider
            min={0}
            max={200}
            step={5}
            value={preference.volumePercent}
            onChange={onVolume}
            tooltip={{ formatter: (v) => `%${v}` }}
          />
        </div>
      ),
    },
    // Screen share audio controls only if user is sharing screen
    ...(isScreenSharing ? [
      {
        type: 'divider' as const,
      },
      {
        key: 'screen-watch',
        label: isWatchingScreen ? 'İzlemeyi Bırak' : 'Yayını İzle',
        icon: isWatchingScreen ? <EyeInvisibleOutlined /> : <DesktopOutlined />,
        className: 'ct-participant-context-menu-button',
        onClick: () => {
          onSetScreenWatching?.(!isWatchingScreen);
          onClose();
        },
      },
      {
        key: 'screen-audio-header',
        label: (
          <div className="ct-participant-context-menu-hint">
            <DesktopOutlined />
            <span>Yayın Sesi: %{preference.screenAudioVolumePercent ?? 100}</span>
          </div>
        ),
        disabled: true,
      },
      {
        key: 'screen-audio-mute',
        label: (preference.screenAudioMuted) ? 'Yayın Sesini Aç' : 'Yayın Sesini Sustur',
        icon: (preference.screenAudioMuted) ? <AudioOutlined /> : <AudioMutedOutlined />,
        className: 'ct-participant-context-menu-button',
        onClick: () => {
          onScreenAudioMute(!(preference.screenAudioMuted ?? false));
          onClose();
        },
      },
      {
        key: 'screen-audio-slider',
        label: (
          <div className="ct-participant-context-menu-volume" onClick={(e) => e.stopPropagation()}>
            <Slider
              min={0}
              max={200}
              step={5}
              value={preference.screenAudioVolumePercent ?? 100}
              onChange={onScreenAudioVolume}
              tooltip={{ formatter: (v) => `%${v}` }}
            />
          </div>
        ),
      },
    ] : []),
    // Server-enforced moderation, owner/admin only — separated from the local
    // playback controls above so it's not mistaken for a personal preference.
    ...(canModerate ? [
      { type: 'divider' as const },
      {
        key: 'moderation-header',
        label: (
          <div className="ct-participant-context-menu-hint">
            Moderasyon
          </div>
        ),
        disabled: true,
      },
      {
        key: 'server-mute',
        label: isServerMuted ? 'Sunucuda Susturmayı Kaldır' : 'Sunucuda Sustur',
        icon: isServerMuted ? <AudioOutlined /> : <MutedOutlined />,
        className: 'ct-participant-context-menu-button',
        onClick: () => {
          onServerMute?.(!isServerMuted);
          onClose();
        },
      },
      {
        key: 'kick',
        label: 'Odadan At',
        icon: <LogoutOutlined />,
        danger: true,
        className: 'ct-participant-context-menu-button',
        onClick: () => {
          onKick?.();
          onClose();
        },
      },
    ] : []),
  ];

  return (
    <Dropdown
      menu={{ items: menuItems }}
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      trigger={['click']}
      overlayClassName="ct-participant-context-menu"
      placement="bottomLeft"
      destroyPopupOnHide
    >
      <div 
        style={{ 
          position: 'fixed', 
          left: x, 
          top: y, 
          width: '1px', 
          height: '1px',
          zIndex: 9999,
          pointerEvents: 'none'
        }} 
      />
    </Dropdown>
  );
}
