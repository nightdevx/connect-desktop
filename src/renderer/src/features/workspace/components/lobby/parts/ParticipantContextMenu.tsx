import { Dropdown, Slider, type MenuProps } from "antd";
import { 
  AudioOutlined, 
  AudioMutedOutlined, 
  EyeInvisibleOutlined, 
  EyeOutlined,
  SoundOutlined,
  DesktopOutlined
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
}: ParticipantContextMenuProps) {
  const menuItems: MenuProps['items'] = [
    {
      key: 'title',
      label: (
        <div className="ct-participant-context-menu-title" style={{ padding: '4px 0 8px 0' }}>
          Katılımcı Ayarları
        </div>
      ),
      disabled: true,
    },
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
        <div className="ct-participant-context-menu-hint" style={{ padding: '4px 0' }}>
          <SoundOutlined style={{ marginRight: '8px' }} />
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
        key: 'screen-audio-header',
        label: (
          <div className="ct-participant-context-menu-hint" style={{ padding: '4px 0' }}>
            <DesktopOutlined style={{ marginRight: '8px' }} />
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
