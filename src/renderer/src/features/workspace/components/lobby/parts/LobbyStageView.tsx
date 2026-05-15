import type { MouseEvent } from "react";
import { Dropdown, Slider, type MenuProps } from "antd";
import { 
  AudioOutlined, 
  AudioMutedOutlined, 
  EyeInvisibleOutlined, 
  EyeOutlined,
  SoundOutlined
} from "@ant-design/icons";
import {
  LobbyParticipantTile,
  type LobbyParticipantView,
} from "../lobby-participant-tile";
import {
  type StageParticipantSlot,
  resolvePreviewStream,
} from "../lobby-view-utils";
import type { ParticipantMediaMap, RemoteParticipantAudioPreference } from "@/features/livekit";

interface LobbyStageViewProps {
  stageParticipantSlots: StageParticipantSlot[];
  focusedParticipantSlot: StageParticipantSlot | null;
  nonFocusedParticipantSlots: StageParticipantSlot[];
  avatarByUserId: Record<string, string | null | undefined>;
  localCameraStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  remoteParticipantStreams: ParticipantMediaMap;
  remoteParticipantAudioPreferences: Record<string, RemoteParticipantAudioPreference>;
  focusedParticipantId: string | null;
  contextMenuParticipantId: string | null;
  contextMenuPosition: { x: number; y: number } | null;
  onCloseContextMenu: () => void;
  selectedPreference: RemoteParticipantAudioPreference;
  stageLayoutStyle: React.CSSProperties;
  handleMute: (muted: boolean) => void;
  handleVolume: (volume: number) => void;
  handleToggleCameraHidden: (hidden: boolean) => void;
  handleParticipantFocus: (event: MouseEvent<HTMLElement>, p: LobbyParticipantView) => void;
  handleParticipantContextMenu: (event: MouseEvent<HTMLElement>, p: LobbyParticipantView) => void;
  audioInputDevices: MediaDeviceInfo[];
  audioOutputDevices: MediaDeviceInfo[];
  selectedAudioInputDeviceId: string | null;
  selectedAudioOutputDeviceId: string | null;
  onSelectAudioInputDevice: (deviceId: string | null) => void;
  onSelectAudioOutputDevice: (deviceId: string | null) => void;
}

export function LobbyStageView({
  stageParticipantSlots,
  focusedParticipantSlot,
  nonFocusedParticipantSlots,
  avatarByUserId,
  localCameraStream,
  localScreenStream,
  remoteParticipantStreams,
  remoteParticipantAudioPreferences,
  focusedParticipantId,
  contextMenuParticipantId,
  contextMenuPosition,
  onCloseContextMenu,
  selectedPreference,
  stageLayoutStyle,
  handleMute,
  handleVolume,
  handleToggleCameraHidden,
  handleParticipantFocus,
  handleParticipantContextMenu,
  audioInputDevices,
  audioOutputDevices,
  selectedAudioInputDeviceId,
  selectedAudioOutputDeviceId,
  onSelectAudioInputDevice,
  onSelectAudioOutputDevice,
}: LobbyStageViewProps) {
  return (
    <div
      className={`ct-lobby-stage-grid ${focusedParticipantSlot ? "focused-layout" : ""}`}
      style={stageLayoutStyle}
    >
      {focusedParticipantSlot ? (
        <>
          <div className="ct-lobby-focused-slot">
            <LobbyParticipantTile
              key={focusedParticipantSlot.slotId}
              participant={focusedParticipantSlot.participant}
              avatarUrl={avatarByUserId[focusedParticipantSlot.participant.userId]}
              previewStream={resolvePreviewStream(
                focusedParticipantSlot.participant,
                localCameraStream,
                localScreenStream,
                remoteParticipantStreams,
                focusedParticipantSlot.sourcePreference,
                remoteParticipantAudioPreferences[focusedParticipantSlot.participant.userId]?.cameraHidden,
              )}
              isSelected={
                focusedParticipantId === focusedParticipantSlot.participant.userId
              }
              isFocusedLayout
              onActivate={(event) =>
                handleParticipantFocus(event, focusedParticipantSlot.participant)
              }
              onContextMenu={(event) =>
                handleParticipantContextMenu(event, focusedParticipantSlot.participant)
              }
              audioInputDevices={audioInputDevices}
              audioOutputDevices={audioOutputDevices}
              selectedAudioInputDeviceId={selectedAudioInputDeviceId}
              selectedAudioOutputDeviceId={selectedAudioOutputDeviceId}
              onSelectAudioInputDevice={onSelectAudioInputDevice}
              onSelectAudioOutputDevice={onSelectAudioOutputDevice}
            />
          </div>

          {nonFocusedParticipantSlots.length > 0 && (
            <div className="ct-lobby-participant-rail" role="list">
              {nonFocusedParticipantSlots.map((slot) => (
                <LobbyParticipantTile
                  key={slot.slotId}
                  participant={slot.participant}
                  avatarUrl={avatarByUserId[slot.participant.userId]}
                  previewStream={resolvePreviewStream(
                    slot.participant,
                    localCameraStream,
                    localScreenStream,
                    remoteParticipantStreams,
                    slot.sourcePreference,
                    remoteParticipantAudioPreferences[slot.participant.userId]?.cameraHidden,
                  )}
                  isCompact
                  isSelected={
                    focusedParticipantId === slot.participant.userId
                  }
                  onActivate={(event) => handleParticipantFocus(event, slot.participant)}
                  onContextMenu={(event) => handleParticipantContextMenu(event, slot.participant)}
                  audioInputDevices={audioInputDevices}
                  audioOutputDevices={audioOutputDevices}
                  selectedAudioInputDeviceId={selectedAudioInputDeviceId}
                  selectedAudioOutputDeviceId={selectedAudioOutputDeviceId}
                  onSelectAudioInputDevice={onSelectAudioInputDevice}
                  onSelectAudioOutputDevice={onSelectAudioOutputDevice}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        stageParticipantSlots.map((slot) => (
          <LobbyParticipantTile
            key={slot.slotId}
            participant={slot.participant}
            avatarUrl={avatarByUserId[slot.participant.userId]}
            previewStream={resolvePreviewStream(
              slot.participant,
              localCameraStream,
              localScreenStream,
              remoteParticipantStreams,
              slot.sourcePreference,
              remoteParticipantAudioPreferences[slot.participant.userId]?.cameraHidden,
            )}
            isSelected={
              focusedParticipantId === slot.participant.userId
            }
            onActivate={(event) => handleParticipantFocus(event, slot.participant)}
            onContextMenu={(event) => handleParticipantContextMenu(event, slot.participant)}
            audioInputDevices={audioInputDevices}
            audioOutputDevices={audioOutputDevices}
            selectedAudioInputDeviceId={selectedAudioInputDeviceId}
            selectedAudioOutputDeviceId={selectedAudioOutputDeviceId}
            onSelectAudioInputDevice={onSelectAudioInputDevice}
            onSelectAudioOutputDevice={onSelectAudioOutputDevice}
          />
        ))
      )}

      {/* Floating Context Menu */}
      {contextMenuParticipantId && contextMenuPosition && (
        <ParticipantContextMenu
          x={contextMenuPosition.x}
          y={contextMenuPosition.y}
          preference={selectedPreference}
          onClose={onCloseContextMenu}
          onMute={handleMute}
          onVolume={handleVolume}
          onToggleCameraHidden={handleToggleCameraHidden}
        />
      )}
    </div>
  );
}

interface ParticipantContextMenuProps {
  x: number;
  y: number;
  preference: RemoteParticipantAudioPreference;
  onClose: () => void;
  onMute: (muted: boolean) => void;
  onVolume: (volume: number) => void;
  onToggleCameraHidden: (hidden: boolean) => void;
}

function ParticipantContextMenu({
  x,
  y,
  preference,
  onClose,
  onMute,
  onVolume,
  onToggleCameraHidden,
}: ParticipantContextMenuProps) {
  const menuItems: MenuProps['items'] = [
    {
      key: 'mute',
      label: preference.muted ? 'Sesi Aç' : 'Sustur',
      icon: preference.muted ? <AudioOutlined /> : <AudioMutedOutlined />,
      onClick: () => {
        onMute(!preference.muted);
        onClose();
      },
    },
    {
      key: 'camera',
      label: preference.cameraHidden ? 'Kamerayı Göster' : 'Kamerayı Gizle',
      icon: preference.cameraHidden ? <EyeOutlined /> : <EyeInvisibleOutlined />,
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
          <SoundOutlined />
          <span>Ses Seviyesi: %{preference.volumePercent}</span>
        </div>
      ),
      disabled: true,
    },
    {
      key: 'volume-slider',
      label: (
        <div style={{ padding: '0 8px 8px 8px', minWidth: '160px' }} onClick={(e) => e.stopPropagation()}>
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
  ];

  return (
    <div 
      style={{ 
        position: 'fixed', 
        left: x, 
        top: y, 
        zIndex: 1000 
      }}
    >
      <Dropdown
        menu={{ items: menuItems }}
        open={true}
        onOpenChange={(open) => !open && onClose()}
        trigger={['contextMenu']}
      >
        <div style={{ width: 1, height: 1 }} />
      </Dropdown>
    </div>
  );
}
