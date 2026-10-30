import type { ReactElement } from "react";
import type { RemoteParticipantAudioPreference } from "@/features/livekit";
import { OdakMenu } from "@/ui/odak-menu";
import { isRemoteParticipantMuted } from "../../../hooks/media/use-remote-participant-audio";
import type { MoveTarget } from "./member-move";
import { PersonMenuHeader, buildPersonMenu } from "../../common/person-menu";

/**
 * Right-click menu for a member row in the lobby sidebar.
 *
 * The sidebar used to offer two items, and only to a moderator: mute and kick.
 * Everything else you might want from a name — who is this, add them, say
 * something to them, turn them down — was only reachable from the stage, i.e.
 * only for the room you were already in. This is the same set of actions, built
 * from what a sidebar row can actually know.
 *
 * The same person menu as the stage's (common/person-menu), built from what a
 * sidebar row can know: no screen watching, screen audio or camera rows, since
 * a sidebar row is usually somebody in a room you are not in, where none of
 * that exists.
 */
export interface LobbyMemberMenuAudio {
  preference: RemoteParticipantAudioPreference;
  onMute: (muted: boolean) => void;
  onVolume: (volumePercent: number) => void;
  /** Their soundboard only. Their voice is the two above. */
  onEmoteMute: (muted: boolean) => void;
}

interface LobbyMemberContextMenuProps {
  children: ReactElement;
  userId: string;
  username: string;
  avatarUrl?: string | null;
  /** The room the row sits under, for the menu's header. */
  roomName: string;
  isSelf: boolean;
  onShowProfile: () => void;
  onSendMessage: () => void;
  friendState: "friend" | "requested" | "none";
  isFriendActionPending: boolean;
  onAddFriend: () => void;
  onRemoveFriend: () => void;
  /** Present only for someone in the room this user is currently connected to:
   *  a playback preference for anyone else would control nothing. */
  audio?: LobbyMemberMenuAudio;
  canModerate: boolean;
  /** The music bot: an audio source with a name, not a person. Nothing to open
   *  a profile on, befriend, message, moderate or silence a soundboard for. */
  isBot?: boolean;
  isServerMuted: boolean;
  onServerMute: (muted: boolean, durationSeconds?: number) => void;
  onKick: () => void;
  onTimeout: (durationSeconds?: number) => void;
  /** Rooms this member may be carried into — see buildMoveTargets. */
  moveTargets?: MoveTarget[];
  onMove?: (targetLobbyId: string) => void;
}

export function LobbyMemberContextMenu({
  children,
  userId,
  username,
  avatarUrl,
  roomName,
  isSelf,
  onShowProfile,
  onSendMessage,
  friendState,
  isFriendActionPending,
  onAddFriend,
  onRemoveFriend,
  audio,
  canModerate,
  isBot = false,
  isServerMuted,
  onServerMute,
  onKick,
  onTimeout,
  moveTargets,
  onMove,
}: LobbyMemberContextMenuProps): ReactElement {
  const locallyMuted = isRemoteParticipantMuted(audio?.preference);

  const items = buildPersonMenu({
    name: username,
    keyPrefix: "member",
    // The music bot is an audio source with a name: nothing to open a profile
    // on, message or befriend.
    onShowProfile: isBot ? undefined : onShowProfile,
    onSendMessage: isSelf || isBot ? undefined : onSendMessage,
    friendship:
      isSelf || isBot
        ? undefined
        : {
            state: friendState,
            pending: isFriendActionPending,
            onAdd: onAddFriend,
            onRemove: onRemoveFriend,
            // The sidebar removes at once, as it always has.
            confirms: false,
          },
    // Only for someone in the room this user is connected to: a playback
    // preference for anyone else would control nothing.
    sound: audio
      ? {
          voice: {
            label: isBot ? "Müzik sesi" : "Ses seviyesi",
            value: audio.preference.volumePercent,
            muted: locallyMuted,
            onChange: audio.onVolume,
          },
          mute: { on: locallyMuted, onChange: audio.onMute },
          emoteMute: isBot
            ? undefined
            : { on: audio.preference.emoteMuted ?? false, onChange: audio.onEmoteMute },
        }
      : undefined,
    moderation:
      canModerate && !isSelf
        ? { isServerMuted, onServerMute, moveTargets, onMove, onKick, onTimeout }
        : undefined,
  });

  // The popup is portalled into document.body, but React events still bubble
  // along the React tree, into the lobby row whose click joins the room. The
  // menu's panel stops them (OdakMenu), so muting someone in a room you are not
  // in no longer drags you into it.
  return (
    <OdakMenu
      trigger="contextMenu"
      items={items}
      header={
        <PersonMenuHeader
          userId={userId}
          name={username}
          avatarUrl={avatarUrl}
          detail={isBot ? "Müzik botu" : isSelf ? "Sen" : `${roomName} odasında`}
        />
      }
      width={268}
    >
      {children}
    </OdakMenu>
  );
}
