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
import { WatchStageTile, type WatchRoom } from "@/features/watch";
import { isRemoteParticipantMuted } from "../../../hooks/media/use-remote-participant-audio";

/**
 * The room's shared video, and the slot it has taken on the stage.
 *
 * The video reaches this component as an ordinary StageParticipantSlot — the
 * lobby panel injects a synthetic roster entry for it, the same way the music
 * bot gets a tile — so the fit, the focus and the rail need no cases of their
 * own. This is what tells the renderer that ONE of those slots is not a person,
 * and hands it what to draw instead.
 */
export interface WatchTileBinding {
  /** The reserved identity the session's slot is keyed by. */
  slotUserId: string;
  room: WatchRoom;
  /** Whether this viewer has opened it. Screen shares work the same way. */
  optedIn: boolean;
  onOptIn: () => void;
  onOptOut: () => void;
}

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
  /** Set while the room is watching something. See WatchTileBinding. */
  watchTile?: WatchTileBinding | null;
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
  watchTile = null,
}: LobbyStageViewProps) {
  /**
   * One slot, drawn in whichever of the three places the stage puts it.
   *
   * The focused tile, the rail thumbnail and the plain grid tile used to be
   * three copies of the same twenty-prop call, which is why the shared video
   * could not be added to the stage without writing it a fourth time. They
   * differ in exactly two flags.
   */
  const renderSlot = (
    slot: StageParticipantSlot,
    variant: { focused?: boolean; compact?: boolean } = {},
  ) => {
    const isSelected = focusedParticipantId === slot.participant.userId;

    if (watchTile && slot.participant.userId === watchTile.slotUserId) {
      return (
        <WatchStageTile
          key={slot.slotId}
          room={watchTile.room}
          optedIn={watchTile.optedIn}
          onOptIn={watchTile.onOptIn}
          onOptOut={watchTile.onOptOut}
          isFocusedLayout={variant.focused}
          isCompact={variant.compact}
          isSelected={isSelected}
          onActivate={(event) => handleParticipantFocus(event, slot.participant)}
        />
      );
    }

    return (
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
        isFocusedLayout={variant.focused}
        isCompact={variant.compact}
        isSelected={isSelected}
        onActivate={(event) => handleParticipantFocus(event, slot.participant)}
        onContextMenu={(event) => handleParticipantContextMenu(event, slot.participant)}
        audioInputDevices={audioInputDevices}
        audioOutputDevices={audioOutputDevices}
        selectedAudioInputDeviceId={selectedAudioInputDeviceId}
        selectedAudioOutputDeviceId={selectedAudioOutputDeviceId}
        onSelectAudioInputDevice={onSelectAudioInputDevice}
        onSelectAudioOutputDevice={onSelectAudioOutputDevice}
        localAudioMuted={isRemoteParticipantMuted(
          remoteParticipantAudioPreferences[slot.participant.userId],
        )}
        localScreenAudioMuted={
          remoteParticipantAudioPreferences[slot.participant.userId]?.screenAudioMuted
        }
        isWatchingScreen={isWatchingScreen(slot.participant.userId)}
        onWatchScreen={onWatchScreen}
        nameByUserId={nameByUserId}
      />
    );
  };

  return (
    <div
      className={`ct-lobby-stage-grid ${focusedParticipantSlot ? "focused-layout" : ""} ${!isRailVisible ? "full-stage-mode" : ""}`}
      style={stageLayoutStyle}
    >
      {focusedParticipantSlot ? (
        <>
          <div className={`ct-lobby-focused-slot ${!isRailVisible ? "full-stage" : ""}`}>
            {renderSlot(focusedParticipantSlot, { focused: true })}
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
              {nonFocusedParticipantSlots.map((slot) => renderSlot(slot, { compact: true }))}
            </div>
          )}
        </>
      ) : (
        stageParticipantSlots.map((slot) => renderSlot(slot))
      )}
    </div>
  );
}
