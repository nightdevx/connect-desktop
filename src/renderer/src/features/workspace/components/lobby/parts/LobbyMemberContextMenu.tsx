import { Dropdown, Slider, type MenuProps } from "antd";
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
  UserAddOutlined,
  UserDeleteOutlined,
} from "@ant-design/icons";
import type { RemoteParticipantAudioPreference } from "@/features/livekit";
import { buildDurationMenuItems } from "./moderation-durations";

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
  username: string;
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
  isServerMuted: boolean;
  onServerMute: (muted: boolean, durationSeconds?: number) => void;
  onKick: () => void;
  onTimeout: (durationSeconds?: number) => void;
}

export function LobbyMemberContextMenu({
  children,
  username,
  isSelf,
  onShowProfile,
  onSendMessage,
  friendState,
  isFriendActionPending,
  onAddFriend,
  onRemoveFriend,
  audio,
  canModerate,
  isServerMuted,
  onServerMute,
  onKick,
  onTimeout,
}: LobbyMemberContextMenuProps): ReactElement {
  const items: MenuProps["items"] = [
    {
      key: "title",
      label: <div className="ct-participant-context-menu-title">@{username}</div>,
      disabled: true,
    },
    {
      key: "profile",
      label: "Profili Gör",
      icon: <IdcardOutlined />,
      className: "ct-participant-context-menu-button",
      onClick: onShowProfile,
    },
    ...(isSelf
      ? []
      : [
          {
            key: "message",
            label: "Mesaj Gönder",
            icon: <MessageOutlined />,
            className: "ct-participant-context-menu-button",
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
            className: "ct-participant-context-menu-button",
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
            label: audio.preference.muted ? "Sesi Aç" : "Sustur",
            icon: audio.preference.muted ? (
              <AudioOutlined />
            ) : (
              <AudioMutedOutlined />
            ),
            className: "ct-participant-context-menu-button",
            onClick: () => audio.onMute(!audio.preference.muted),
          },
          {
            key: "volume-header",
            label: (
              <div className="ct-participant-context-menu-hint">
                <SoundOutlined />
                <span>Ses Seviyesi: %{audio.preference.volumePercent}</span>
              </div>
            ),
            disabled: true,
          },
          {
            key: "volume-slider",
            label: (
              // The slider must not close the menu on every drag tick, and the
              // row underneath joins a lobby on click.
              <div
                className="ct-participant-context-menu-volume"
                onClick={(event) => event.stopPropagation()}
              >
                <Slider
                  min={0}
                  max={200}
                  step={5}
                  value={audio.preference.volumePercent}
                  onChange={audio.onVolume}
                  tooltip={{ formatter: (value) => `%${value}` }}
                />
              </div>
            ),
          },
          {
            key: "emote-mute",
            // Separate from "Sustur" because they are separate annoyances: a
            // person can be worth listening to and still be leaning on the
            // soundboard, and silencing them entirely is the wrong answer to it.
            label: audio.preference.emoteMuted
              ? "Emote Seslerini Aç"
              : "Emote Seslerini Sustur",
            icon: audio.preference.emoteMuted ? (
              <NotificationOutlined />
            ) : (
              <MutedOutlined />
            ),
            className: "ct-participant-context-menu-button",
            onClick: () => audio.onEmoteMute(!audio.preference.emoteMuted),
          },
        ]
      : []),
    ...(canModerate && !isSelf
      ? [
          { type: "divider" as const },
          {
            key: "moderation-header",
            label: (
              <div className="ct-participant-context-menu-hint">Moderasyon</div>
            ),
            disabled: true,
          },
          // Lifting a restriction is one click; applying one asks how long for.
          // The asymmetry is the point: "undo this" has no parameters, and
          // burying it in a submenu would put a step between a moderator and
          // the correction of their own mistake.
          isServerMuted
            ? {
                key: "server-unmute",
                label: "Sunucuda Susturmayı Kaldır",
                icon: <AudioOutlined />,
                className: "ct-participant-context-menu-button",
                onClick: () => onServerMute(false),
              }
            : {
                key: "server-mute",
                label: "Sunucuda Sustur",
                icon: <MutedOutlined />,
                className: "ct-participant-context-menu-button",
                children: buildDurationMenuItems("member-mute", (durationSeconds) =>
                  onServerMute(true, durationSeconds),
                ),
              },
          {
            key: "kick",
            label: "Odadan At",
            icon: <LogoutOutlined />,
            danger: true,
            className: "ct-participant-context-menu-button",
            onClick: onKick,
          },
          // A kick is undone by walking back in; a timeout is the one that keeps
          // them out, so it is the one that asks how long for.
          {
            key: "timeout",
            label: "Zaman Aşımı",
            icon: <StopOutlined />,
            danger: true,
            className: "ct-participant-context-menu-button",
            children: buildDurationMenuItems("member-timeout", onTimeout),
          },
        ]
      : []),
  ];

  return (
    <Dropdown
      trigger={["contextMenu"]}
      overlayClassName="ct-participant-context-menu"
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
