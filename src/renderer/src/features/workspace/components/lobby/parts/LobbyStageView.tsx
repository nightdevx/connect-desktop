import { type MouseEvent } from "react";
import { UpOutlined, DownOutlined } from "@ant-design/icons";
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
  stageLayoutStyle: React.CSSProperties;
  handleParticipantFocus: (event: MouseEvent<HTMLElement>, p: LobbyParticipantView) => void;
  handleParticipantContextMenu: (event: MouseEvent<HTMLElement>, p: LobbyParticipantView) => void;
  audioInputDevices: MediaDeviceInfo[];
  audioOutputDevices: MediaDeviceInfo[];
  selectedAudioInputDeviceId: string | null;
  selectedAudioOutputDeviceId: string | null;
  onSelectAudioInputDevice: (deviceId: string | null) => void;
  onSelectAudioOutputDevice: (deviceId: string | null) => void;
  isRailVisible: boolean;
  setIsRailVisible: (visible: boolean) => void;
  // Screen shares are opt-in; the tile shows a "watch" prompt until then.
  isWatchingScreen: (userId: string) => boolean;
  onWatchScreen: (userId: string) => void;
  /** Roster display names, for the audience badge on a screen tile. */
  nameByUserId: Record<string, string>;
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
  stageLayoutStyle,
  handleParticipantFocus,
  handleParticipantContextMenu,
  audioInputDevices,
  audioOutputDevices,
  selectedAudioInputDeviceId,
  selectedAudioOutputDeviceId,
  onSelectAudioInputDevice,
  onSelectAudioOutputDevice,
  isRailVisible,
  setIsRailVisible,
  isWatchingScreen,
  onWatchScreen,
  nameByUserId,
}: LobbyStageViewProps) {

  return (
    <div
      className={`ct-lobby-stage-grid ${focusedParticipantSlot ? "focused-layout" : ""} ${!isRailVisible ? "full-stage-mode" : ""}`}
      style={stageLayoutStyle}
    >
      {focusedParticipantSlot ? (
        <>
          <div className={`ct-lobby-focused-slot ${!isRailVisible ? "full-stage" : ""}`}>
            <LobbyParticipantTile
              key={focusedParticipantSlot.slotId}
              participant={focusedParticipantSlot.participant}
              kind={focusedParticipantSlot.kind}
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
              localAudioMuted={remoteParticipantAudioPreferences[focusedParticipantSlot.participant.userId]?.muted}
              localScreenAudioMuted={remoteParticipantAudioPreferences[focusedParticipantSlot.participant.userId]?.screenAudioMuted}
              isWatchingScreen={isWatchingScreen(focusedParticipantSlot.participant.userId)}
              onWatchScreen={onWatchScreen}
              nameByUserId={nameByUserId}
            />
          </div>

          {nonFocusedParticipantSlots.length > 0 && (
            <div
              className="ct-lobby-stage-slot-row"
            >
              <button
                type="button"
                className="ct-lobby-stage-hint"
                onClick={() => setIsRailVisible(!isRailVisible)}
                >
                {isRailVisible ? (
                  <>
                    <DownOutlined  /> Diğer Katılımcıları Gizle ({nonFocusedParticipantSlots.length})
                  </>
                ) : (
                  <>
                    <UpOutlined  /> Diğer Katılımcıları Göster ({nonFocusedParticipantSlots.length})
                  </>
                )}
              </button>
            </div>
          )}

          {nonFocusedParticipantSlots.length > 0 && isRailVisible && (
            <div className="ct-lobby-participant-rail" role="list">
              {nonFocusedParticipantSlots.map((slot) => (
                <LobbyParticipantTile
                  key={slot.slotId}
                  participant={slot.participant}
                  kind={slot.kind}
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
                  localAudioMuted={remoteParticipantAudioPreferences[slot.participant.userId]?.muted}
                  localScreenAudioMuted={remoteParticipantAudioPreferences[slot.participant.userId]?.screenAudioMuted}
                  isWatchingScreen={isWatchingScreen(slot.participant.userId)}
                  onWatchScreen={onWatchScreen}
                  nameByUserId={nameByUserId}
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
            kind={slot.kind}
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
            localAudioMuted={remoteParticipantAudioPreferences[slot.participant.userId]?.muted}
            localScreenAudioMuted={remoteParticipantAudioPreferences[slot.participant.userId]?.screenAudioMuted}
            isWatchingScreen={isWatchingScreen(slot.participant.userId)}
            onWatchScreen={onWatchScreen}
            nameByUserId={nameByUserId}
          />
        ))
      )}
    </div>
  );
}
