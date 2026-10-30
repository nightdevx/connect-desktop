import type { RemoteParticipantAudioPreference } from "@/features/livekit";
import { OdakMenu } from "@/ui/odak-menu";
import { isRemoteParticipantMuted } from "../../../hooks/media/use-remote-participant-audio";
import type { MoveTarget } from "./member-move";
import { PersonMenuHeader, buildPersonMenu } from "../../common/person-menu";

interface ParticipantContextMenuProps {
  x: number;
  y: number;
  /** Whose menu this is, for the header. */
  userId: string;
  name: string;
  avatarUrl?: string | null;
  preference: RemoteParticipantAudioPreference;
  isScreenSharing: boolean;
  onClose: () => void;
  onMute: (muted: boolean) => void;
  /**
   * Their soundboard only, silenced locally. Optional because this menu is also
   * the one a 1:1 call uses, and emotes are a lobby feature -- there is no
   * soundboard in a direct call to mute.
   */
  onEmoteMute?: (muted: boolean) => void;
  onVolume: (volume: number) => void;
  onToggleCameraHidden: (hidden: boolean) => void;
  onScreenAudioMute: (muted: boolean) => void;
  onScreenAudioVolume: (volume: number) => void;
  // Server-enforced moderation (owner/admin only) — distinct from the local
  // playback preferences above, which only affect what the current user hears.
  canModerate?: boolean;
  isServerMuted?: boolean;
  onServerMute?: (muted: boolean, durationSeconds?: number) => void;
  onKick?: () => void;
  onTimeout?: (durationSeconds?: number) => void;
  /** Rooms this member may be carried into — see buildMoveTargets. */
  moveTargets?: MoveTarget[];
  onMove?: (targetLobbyId: string) => void;
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
  isBot?: boolean;
}

export function ParticipantContextMenu({
  x,
  y,
  userId,
  name,
  avatarUrl,
  preference,
  isScreenSharing,
  onClose,
  onMute,
  onEmoteMute,
  onVolume,
  onToggleCameraHidden,
  onScreenAudioMute,
  onScreenAudioVolume,
  canModerate,
  isServerMuted,
  onServerMute,
  onKick,
  onTimeout,
  moveTargets,
  onMove,
  isWatchingScreen = false,
  onSetScreenWatching,
  friendState,
  isFriendActionPending = false,
  onAddFriend,
  onRemoveFriend,
  onShowProfile,
  isBot = false,
}: ParticipantContextMenuProps) {
  const locallyMuted = isRemoteParticipantMuted(preference);

  // The person menu every place shares (common/person-menu): who they are,
  // what you hear of them (their voice, and their screen's sound while they
  // share one), moderation for whoever may, unfriending last.
  const items = buildPersonMenu({
    name,
    keyPrefix: "tile",
    onShowProfile,
    friendship: friendState
      ? {
          state: friendState,
          pending: isFriendActionPending,
          onAdd: () => onAddFriend?.(),
          onRemove: () => onRemoveFriend?.(),
          confirms: true,
        }
      : undefined,
    sound: {
      voice: {
        label: isBot ? "Müzik sesi" : "Ses seviyesi",
        value: preference.volumePercent,
        muted: locallyMuted,
        onChange: onVolume,
      },
      mute: { on: locallyMuted, onChange: onMute },
      emoteMute: onEmoteMute
        ? { on: preference.emoteMuted ?? false, onChange: onEmoteMute }
        : undefined,
      cameraHidden: isBot
        ? undefined
        : { on: preference.cameraHidden ?? false, onChange: onToggleCameraHidden },
      screen: isScreenSharing
        ? {
            volume: {
              label: "Yayın sesi",
              value: preference.screenAudioVolumePercent ?? 100,
              muted: preference.screenAudioMuted ?? false,
              onChange: onScreenAudioVolume,
            },
            watch: { on: isWatchingScreen, onChange: (watch) => onSetScreenWatching?.(watch) },
            audioMute: { on: preference.screenAudioMuted ?? false, onChange: onScreenAudioMute },
          }
        : undefined,
    },
    // Server-enforced, owner/admin only: a red block of its own, so it is not
    // mistaken for a personal preference.
    moderation: canModerate
      ? {
          isServerMuted: isServerMuted ?? false,
          onServerMute,
          moveTargets,
          onMove,
          onKick,
          onTimeout,
        }
      : undefined,
  });

  return (
    // Opened from outside at the pointer (LobbyStageView catches the
    // right-click). Every choice but a switch or a slider closes it.
    <OdakMenu
      items={items}
      header={
        <PersonMenuHeader
          userId={userId}
          name={name}
          avatarUrl={avatarUrl}
          detail={isBot ? "Müzik botu ayarları" : "Katılımcı ayarları"}
        />
      }
      trigger="click"
      anchorPoint={{ x, y }}
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      placement="bottomLeft"
      width={268}
    />
  );
}
