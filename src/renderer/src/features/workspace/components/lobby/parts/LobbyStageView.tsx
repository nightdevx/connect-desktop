import { useState, useEffect, type MouseEvent } from "react";
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
            />
          </div>

          {nonFocusedParticipantSlots.length > 0 && (
            <div
              style={{
                gridColumn: "1 / -1",
                gridRow: "2",
                display: "flex",
                justifyContent: "center",
                margin: "4px 0",
                zIndex: 10,
              }}
            >
              <button
                onClick={() => setIsRailVisible(!isRailVisible)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 18px",
                  borderRadius: "20px",
                  background: "rgba(18, 18, 18, 0.72)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  color: "rgba(255, 255, 255, 0.85)",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                  transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                  boxShadow: "0 6px 20px rgba(0, 0, 0, 0.4)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(24, 24, 24, 0.85)";
                  e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.16)";
                  e.currentTarget.style.color = "#ffffff";
                  e.currentTarget.style.transform = "scale(1.03)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(18, 18, 18, 0.72)";
                  e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)";
                  e.currentTarget.style.color = "rgba(255, 255, 255, 0.85)";
                  e.currentTarget.style.transform = "none";
                }}
                onMouseDown={(e) => {
                  e.currentTarget.style.transform = "scale(0.97)";
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.transform = "scale(1.03)";
                }}
              >
                {isRailVisible ? (
                  <>
                    <DownOutlined style={{ fontSize: "10px" }} /> Diğer Katılımcıları Gizle ({nonFocusedParticipantSlots.length})
                  </>
                ) : (
                  <>
                    <UpOutlined style={{ fontSize: "10px" }} /> Diğer Katılımcıları Göster ({nonFocusedParticipantSlots.length})
                  </>
                )}
              </button>
            </div>
          )}

          {nonFocusedParticipantSlots.length > 0 && isRailVisible && (
            <div className="ct-lobby-participant-rail" role="list" style={{ gridRow: 3 }}>
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
          />
        ))
      )}
    </div>
  );
}
