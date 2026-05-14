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
  focusedParticipantId: string | null;
  audioPanelParticipantId: string | null;
  selectedPreference: RemoteParticipantAudioPreference;
  stageLayoutStyle: React.CSSProperties;
  handleMute: (muted: boolean) => void;
  handleVolume: (volume: number) => void;
  handleParticipantFocus: (event: MouseEvent<HTMLElement>, p: LobbyParticipantView) => void;
  handleParticipantContextMenu: (event: MouseEvent<HTMLElement>, p: LobbyParticipantView) => void;
}

export function LobbyStageView({
  stageParticipantSlots,
  focusedParticipantSlot,
  nonFocusedParticipantSlots,
  avatarByUserId,
  localCameraStream,
  localScreenStream,
  remoteParticipantStreams,
  focusedParticipantId,
  audioPanelParticipantId,
  selectedPreference,
  stageLayoutStyle,
  handleMute,
  handleVolume,
  handleParticipantFocus,
  handleParticipantContextMenu,
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
              )}
              isSelected={
                focusedParticipantId === focusedParticipantSlot.participant.userId ||
                audioPanelParticipantId === focusedParticipantSlot.participant.userId
              }
              isFocusedLayout
              showAudioControls={
                !focusedParticipantSlot.participant.isLocalUser &&
                audioPanelParticipantId === focusedParticipantSlot.participant.userId
              }
              audioPreference={selectedPreference}
              onToggleMute={() => handleMute(!selectedPreference.muted)}
              onVolumeChange={handleVolume}
              onActivate={(event) =>
                handleParticipantFocus(event, focusedParticipantSlot.participant)
              }
              onContextMenu={(event) =>
                handleParticipantContextMenu(event, focusedParticipantSlot.participant)
              }
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
                  )}
                  isCompact
                  isSelected={
                    focusedParticipantId === slot.participant.userId ||
                    audioPanelParticipantId === slot.participant.userId
                  }
                  showAudioControls={audioPanelParticipantId === slot.participant.userId}
                  audioPreference={
                    audioPanelParticipantId === slot.participant.userId
                      ? selectedPreference
                      : undefined
                  }
                  onToggleMute={() => handleMute(!selectedPreference.muted)}
                  onVolumeChange={handleVolume}
                  onActivate={(event) => handleParticipantFocus(event, slot.participant)}
                  onContextMenu={(event) => handleParticipantContextMenu(event, slot.participant)}
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
            )}
            isSelected={
              focusedParticipantId === slot.participant.userId ||
              audioPanelParticipantId === slot.participant.userId
            }
            showAudioControls={audioPanelParticipantId === slot.participant.userId}
            audioPreference={
              audioPanelParticipantId === slot.participant.userId
                ? selectedPreference
                : undefined
            }
            onToggleMute={() => handleMute(!selectedPreference.muted)}
            onVolumeChange={handleVolume}
            onActivate={(event) => handleParticipantFocus(event, slot.participant)}
            onContextMenu={(event) => handleParticipantContextMenu(event, slot.participant)}
          />
        ))
      )}
    </div>
  );
}
