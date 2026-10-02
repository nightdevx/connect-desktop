import { Dropdown, type MenuProps } from "antd";
import {
  AudioOutlined,
  AudioMutedOutlined,
  ClockCircleOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  SoundOutlined,
  DesktopOutlined,
  MutedOutlined,
  NotificationOutlined,
  LogoutOutlined,
  StopOutlined,
  SwapOutlined,
  UserAddOutlined,
  UserDeleteOutlined,
  IdcardOutlined,
} from "@ant-design/icons";
import type { RemoteParticipantAudioPreference } from "@/features/livekit";
import { isRemoteParticipantMuted } from "../../../hooks/media/use-remote-participant-audio";
import { buildDurationMenuItems, buildMoveMenuItems } from "./moderation-durations";
import type { MoveTarget } from "./member-move";
import { ContextMenuPanel, type MenuVolume } from "../../common/context-menu-panel";

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

  // Their voice, and their screen's sound while they share one: the two things
  // on this stage that come out of the user's speakers.
  const volumes: MenuVolume[] = [
    {
      key: "voice",
      label: isBot ? "Müzik sesi" : "Mikrofon sesi",
      icon: <SoundOutlined />,
      value: preference.volumePercent,
      muted: locallyMuted,
      onChange: onVolume,
    },
    ...(isScreenSharing
      ? [
          {
            key: "screen",
            label: "Yayın sesi",
            icon: <DesktopOutlined />,
            value: preference.screenAudioVolumePercent ?? 100,
            muted: preference.screenAudioMuted ?? false,
            onChange: onScreenAudioVolume,
          },
        ]
      : []),
  ];

  const menuItems: MenuProps['items'] = [
    ...(onShowProfile ? [
      {
        key: 'profile',
        label: 'Profili Gör',
        icon: <IdcardOutlined />,
        onClick: () => {
          onShowProfile();
          onClose();
        },
      },
    ] : []),
    ...(friendState ? [
      {
        key: 'friendship',
        label:
          friendState === 'friend'
            ? 'Arkadaşlıktan Çıkar'
            : friendState === 'requested'
              ? 'İstek Gönderildi'
              : 'Arkadaş Ekle',
        icon:
          friendState === 'friend'
            ? <UserDeleteOutlined />
            : friendState === 'requested'
              ? <ClockCircleOutlined />
              : <UserAddOutlined />,
        danger: friendState === 'friend',
        disabled: friendState === 'requested' || isFriendActionPending,
        onClick: () => {
          if (friendState === 'friend') {
            onRemoveFriend?.();
          } else {
            onAddFriend?.();
          }
          onClose();
        },
      },
      { type: 'divider' as const },
    ] : []),
    {
      key: 'mute',
      label: locallyMuted ? 'Sesi Aç' : 'Sustur',
      icon: locallyMuted ? <AudioOutlined /> : <AudioMutedOutlined />,
      onClick: () => {
        onMute(!locallyMuted);
        onClose();
      },
    },
    ...(onEmoteMute
      ? [
          {
            key: 'emote-mute',
            // Their soundboard, not their voice. Separate annoyances, separate
            // switches: somebody worth listening to can still be leaning on the
            // emotes, and silencing them entirely is the wrong answer to that.
            label: preference.emoteMuted
              ? 'Emote Seslerini Aç'
              : 'Emote Seslerini Sustur',
            icon: preference.emoteMuted ? (
              <NotificationOutlined />
            ) : (
              <MutedOutlined />
            ),
            onClick: () => {
              onEmoteMute(!preference.emoteMuted);
              onClose();
            },
          },
        ]
      : []),
    ...(isBot
      ? []
      : [
          {
            key: 'camera',
            label: preference.cameraHidden ? 'Kamerayı Göster' : 'Kamerayı Gizle',
            icon: preference.cameraHidden ? <EyeOutlined /> : <EyeInvisibleOutlined />,
            onClick: () => {
              onToggleCameraHidden(!preference.cameraHidden);
              onClose();
            },
          },
        ]),
    // Screen share controls only while they are sharing. Its volume is a
    // slider in the panel above.
    ...(isScreenSharing ? [
      {
        type: 'divider' as const,
      },
      {
        key: 'screen-watch',
        label: isWatchingScreen ? 'İzlemeyi Bırak' : 'Yayını İzle',
        icon: isWatchingScreen ? <EyeInvisibleOutlined /> : <DesktopOutlined />,
        onClick: () => {
          onSetScreenWatching?.(!isWatchingScreen);
          onClose();
        },
      },
      {
        key: 'screen-audio-mute',
        label: (preference.screenAudioMuted) ? 'Yayın Sesini Aç' : 'Yayın Sesini Sustur',
        icon: (preference.screenAudioMuted) ? <AudioOutlined /> : <AudioMutedOutlined />,
        onClick: () => {
          onScreenAudioMute(!(preference.screenAudioMuted ?? false));
          onClose();
        },
      },
    ] : []),
    // Server-enforced moderation, owner/admin only — a group of its own under
    // a heading, so it is not mistaken for a personal preference.
    ...(canModerate ? [
      { type: 'divider' as const },
      {
        type: 'group' as const,
        key: 'moderation',
        label: 'Moderasyon',
        children: [
          // Lifting a restriction is one click; applying one asks how long for.
          // The same two rows are offered from the sidebar roster — see
          // LobbyMemberContextMenu — and both read their durations from one
          // list.
          isServerMuted
            ? {
                key: 'server-unmute',
                label: 'Sunucuda Susturmayı Kaldır',
                icon: <AudioOutlined />,
                onClick: () => {
                  onServerMute?.(false);
                  onClose();
                },
              }
            : {
                key: 'server-mute',
                label: 'Sunucuda Sustur',
                icon: <MutedOutlined />,
                children: buildDurationMenuItems('tile-mute', (durationSeconds) => {
                  onServerMute?.(true, durationSeconds);
                  onClose();
                }),
              },
          // The mild answer to "you are in the wrong room", so it sits above the
          // two that end somebody's session rather than among them.
          ...(onMove
            ? [
                {
                  key: 'move',
                  label: 'Başka Odaya Taşı',
                  icon: <SwapOutlined />,
                  children: buildMoveMenuItems('tile-move', moveTargets ?? [], (targetLobbyId) => {
                    onMove(targetLobbyId);
                    onClose();
                  }),
                },
              ]
            : []),
          {
            key: 'kick',
            label: 'Odadan At',
            icon: <LogoutOutlined />,
            danger: true,
            onClick: () => {
              onKick?.();
              onClose();
            },
          },
          // A kick is undone by walking back in; a timeout is the one that keeps
          // them out, so it is the one that asks how long for.
          {
            key: 'timeout',
            label: 'Zaman Aşımı',
            icon: <StopOutlined />,
            className: 'ct-menu-danger',
            children: buildDurationMenuItems('tile-timeout', (durationSeconds) => {
              onTimeout?.(durationSeconds);
              onClose();
            }),
          },
        ],
      },
    ] : []),
  ];

  return (
    <Dropdown
      menu={{ items: menuItems }}
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      trigger={['click']}
      placement="bottomLeft"
      destroyOnHidden
      popupRender={(menu) => (
        <ContextMenuPanel
          identity={{
            userId,
            name,
            avatarUrl,
            detail: isBot ? 'Müzik botu ayarları' : 'Katılımcı ayarları',
          }}
          volumes={volumes}
          menu={menu}
        />
      )}
    >
      <div
        style={{
          position: 'fixed',
          left: x,
          top: y,
          width: '1px',
          height: '1px',
          zIndex: 9999,
          pointerEvents: 'none'
        }}
      />
    </Dropdown>
  );
}
