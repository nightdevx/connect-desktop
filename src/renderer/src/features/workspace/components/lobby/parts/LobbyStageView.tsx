import type { MouseEvent } from "react";
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
              localAudioMuted={remoteParticipantAudioPreferences[focusedParticipantSlot.participant.userId]?.muted}
              localScreenAudioMuted={remoteParticipantAudioPreferences[focusedParticipantSlot.participant.userId]?.screenAudioMuted}
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
                  localAudioMuted={remoteParticipantAudioPreferences[slot.participant.userId]?.muted}
                  localScreenAudioMuted={remoteParticipantAudioPreferences[slot.participant.userId]?.screenAudioMuted}
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
            localAudioMuted={remoteParticipantAudioPreferences[slot.participant.userId]?.muted}
            localScreenAudioMuted={remoteParticipantAudioPreferences[slot.participant.userId]?.screenAudioMuted}
          />
        ))
      )}
    </div>
  );
}
