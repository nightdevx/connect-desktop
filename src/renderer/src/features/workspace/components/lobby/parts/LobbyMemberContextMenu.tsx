import { Dropdown, type MenuProps } from "antd";
import type { ReactElement } from "react";
import {
  AudioMutedOutlined,
  AudioOutlined,
  ClockCircleOutlined,
  IdcardOutlined,
  LogoutOutlined,
  MessageOutlined,
  MutedOutlined,
  NotificationOutlined,
  SoundOutlined,
  StopOutlined,
  SwapOutlined,
  UserAddOutlined,
  UserDeleteOutlined,
} from "@ant-design/icons";
import type { RemoteParticipantAudioPreference } from "@/features/livekit";
import { isRemoteParticipantMuted } from "../../../hooks/media/use-remote-participant-audio";
import { buildDurationMenuItems, buildMoveMenuItems } from "./moderation-durations";
import type { MoveTarget } from "./member-move";
import { ContextMenuPanel } from "../../common/context-menu-panel";

/**
 * Right-click menu for a member row in the lobby sidebar.
 *
 * The sidebar used to offer two items, and only to a moderator: mute and kick.
 * Everything else you might want from a name — who is this, add them, say
 * something to them, turn them down — was only reachable from the stage, i.e.
 * only for the room you were already in. This is the same set of actions, built
 * from what a sidebar row can actually know.
 *
 * Deliberately not ParticipantContextMenu: that one is a video tile's menu and
 * assumes a LiveKit publication behind every entry (screen watching, screen
 * audio, hide camera). A sidebar row is usually somebody in a room you are not
 * in, where none of that exists.
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

  const items: MenuProps["items"] = [
    ...(isBot
      ? []
      : [
          {
            key: "profile",
            label: "Profili Gör",
            icon: <IdcardOutlined />,
            onClick: onShowProfile,
          },
        ]),
    ...(isSelf || isBot
      ? []
      : [
          {
            key: "message",
            label: "Mesaj Gönder",
            icon: <MessageOutlined />,
            onClick: onSendMessage,
          },
          {
            key: "friendship",
            label:
              friendState === "friend"
                ? "Arkadaşlıktan Çıkar"
                : friendState === "requested"
                  ? "İstek Gönderildi"
                  : "Arkadaş Ekle",
            icon:
              friendState === "friend" ? (
                <UserDeleteOutlined />
              ) : friendState === "requested" ? (
                <ClockCircleOutlined />
              ) : (
                <UserAddOutlined />
              ),
            danger: friendState === "friend",
            disabled: friendState === "requested" || isFriendActionPending,
            onClick: () => {
              if (friendState === "friend") {
                onRemoveFriend();
              } else {
                onAddFriend();
              }
            },
          },
        ]),
    ...(audio
      ? [
          { type: "divider" as const },
          {
            key: "mute",
            label: locallyMuted ? "Sesi Aç" : "Sustur",
            icon: locallyMuted ? <AudioOutlined /> : <AudioMutedOutlined />,
            onClick: () => audio.onMute(!locallyMuted),
          },
          ...(isBot
            ? []
            : [
                {
                  key: "emote-mute",
                  // Separate from "Sustur" because they are separate annoyances:
                  // a person can be worth listening to and still be leaning on
                  // the soundboard, and silencing them entirely is the wrong
                  // answer to it.
                  label: audio.preference.emoteMuted
                    ? "Emote Seslerini Aç"
                    : "Emote Seslerini Sustur",
                  icon: audio.preference.emoteMuted ? (
                    <NotificationOutlined />
                  ) : (
                    <MutedOutlined />
                  ),
                  onClick: () => audio.onEmoteMute(!audio.preference.emoteMuted),
                },
              ]),
        ]
      : []),
    ...(canModerate && !isSelf
      ? [
          { type: "divider" as const },
          {
            type: "group" as const,
            key: "moderation",
            label: "Moderasyon",
            children: [
              // Lifting a restriction is one click; applying one asks how long for.
              // The asymmetry is the point: "undo this" has no parameters, and
              // burying it in a submenu would put a step between a moderator and
              // the correction of their own mistake.
              isServerMuted
                ? {
                    key: "server-unmute",
                    label: "Sunucuda Susturmayı Kaldır",
                    icon: <AudioOutlined />,
                    onClick: () => onServerMute(false),
                  }
                : {
                    key: "server-mute",
                    label: "Sunucuda Sustur",
                    icon: <MutedOutlined />,
                    children: buildDurationMenuItems("member-mute", (durationSeconds) =>
                      onServerMute(true, durationSeconds),
                    ),
                  },
              // Not dangerous, and deliberately above the two that are: moving
              // somebody is the mild answer to "you are in the wrong room", and it
              // should not sit among the actions that end their session.
              ...(onMove
                ? [
                    {
                      key: "move",
                      label: "Başka Odaya Taşı",
                      icon: <SwapOutlined />,
                      children: buildMoveMenuItems(
                        "member-move",
                        moveTargets ?? [],
                        onMove,
                      ),
                    },
                  ]
                : []),
              {
                key: "kick",
                label: "Odadan At",
                icon: <LogoutOutlined />,
                danger: true,
                onClick: onKick,
              },
              // A kick is undone by walking back in; a timeout is the one that keeps
              // them out, so it is the one that asks how long for.
              {
                key: "timeout",
                label: "Zaman Aşımı",
                icon: <StopOutlined />,
                className: "ct-menu-danger",
                children: buildDurationMenuItems("member-timeout", onTimeout),
              },
            ],
          },
        ]
      : []),
  ];

  return (
    <Dropdown
      trigger={["contextMenu"]}
      popupRender={(menu) => (
        <ContextMenuPanel
          identity={{
            userId,
            name: username,
            avatarUrl,
            detail: isBot ? "Müzik botu" : isSelf ? "Sen" : `${roomName} odasında`,
          }}
          volumes={
            audio
              ? [
                  {
                    key: "voice",
                    label: isBot ? "Müzik sesi" : "Ses seviyesi",
                    icon: <SoundOutlined />,
                    value: audio.preference.volumePercent,
                    muted: locallyMuted,
                    onChange: audio.onVolume,
                  },
                ]
              : []
          }
          menu={menu}
        />
      )}
      menu={{
        // The overlay is portalled into document.body, but React synthetic
        // events still bubble along the REACT tree — Dropdown -> the member list
        // -> the lobby row, whose onClick joins the lobby. Without this, muting
        // someone in a room you are not in dragged you into it, mic live, right
        // before the action landed. Menu-level so no future item can forget it,
        // and it covers Enter on a focused item too.
        onClick: ({ domEvent }) => domEvent.stopPropagation(),
        items,
      }}
    >
      {children}
    </Dropdown>
  );
}
