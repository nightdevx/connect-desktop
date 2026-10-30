import type { JSX } from "react";
import { OdakMenuHeader, type OdakMenuEntry } from "@/ui/odak-menu";
import { Avatar } from "../odak/odak-parts";
import { buildDurationMenuItems, buildMoveMenuItems } from "../lobby/parts/moderation-durations";
import type { MoveTarget } from "../lobby/parts/member-move";

/**
 * The menu about one person, the same wherever a person can be right-clicked:
 * a stage tile, a room's member row, a friend card and its ⋯, a conversation.
 * Each place passes what it can do there; the order is fixed:
 *
 *   who they are and how to reach them
 *   SES, yalnız senin için: what you hear of them
 *   MODERASYON, herkes için: a red block, only for whoever may
 *   Arkadaşlıktan çıkar, last, red, apart (the owner's decision, F10.2)
 */

export interface PersonMenuSwitch {
  on: boolean;
  onChange: (on: boolean) => void;
}

export interface PersonMenuVolume {
  label: string;
  value: number;
  /** Shown in place of the percentage while they are silenced. */
  muted?: boolean;
  onChange: (volumePercent: number) => void;
}

export interface PersonMenuOptions {
  /** Their name, for what a moderation choice will do. */
  name: string;
  /** Prefixes the submenu rows' keys, unique per place. */
  keyPrefix: string;
  /** Gets the menu row, to open the profile card beside it. */
  onShowProfile?: (row: HTMLElement) => void;
  onSendMessage?: () => void;
  /** `unavailable` says why it cannot ring ("çevrimdışı"). */
  call?: { onSelect: () => void; unavailable?: string };
  joinRoom?: { name: string; onSelect: () => void };
  copyUsername?: { username: string; onSelect: () => void };
  friendship?: {
    state: "friend" | "requested" | "none";
    pending: boolean;
    onAdd: () => void;
    onRemove: () => void;
    /** Removing opens a confirmation window first. */
    confirms: boolean;
  };
  sound?: {
    voice?: PersonMenuVolume;
    mute?: PersonMenuSwitch;
    emoteMute?: PersonMenuSwitch;
    cameraHidden?: PersonMenuSwitch;
    /** While they share a screen. */
    screen?: { volume: PersonMenuVolume; watch?: PersonMenuSwitch; audioMute: PersonMenuSwitch };
    /** A direct conversation: their calls stop ringing for you. */
    callMute?: PersonMenuSwitch;
  };
  moderation?: {
    isServerMuted: boolean;
    onServerMute?: (muted: boolean, durationSeconds?: number) => void;
    moveTargets?: MoveTarget[];
    onMove?: (targetLobbyId: string) => void;
    onKick?: () => void;
    onTimeout?: (durationSeconds?: number) => void;
  };
}

const present = (entries: OdakMenuEntry[]): OdakMenuEntry[] => entries.filter(Boolean);

const DIVIDER: OdakMenuEntry = { type: "divider" };

const slider = (key: string, icon: "volume" | "monitor", volume: PersonMenuVolume): OdakMenuEntry => ({
  type: "slider",
  key,
  icon,
  label: volume.label,
  value: volume.value,
  status: volume.muted ? "susturuldu" : undefined,
  onChange: volume.onChange,
});

export function buildPersonMenu(options: PersonMenuOptions): OdakMenuEntry[] {
  const { name, keyPrefix, friendship, sound, moderation } = options;

  const reach = present([
    options.onShowProfile && {
      key: "profile",
      icon: "idcard",
      label: "Profili gör",
      onSelect: options.onShowProfile,
    },
    options.onSendMessage && {
      key: "message",
      icon: "message",
      label: "Mesaj gönder",
      onSelect: options.onSendMessage,
    },
    options.call && {
      key: "call",
      icon: "phone",
      label: "Sesli ara",
      disabled: options.call.unavailable ?? false,
      onSelect: options.call.onSelect,
    },
    options.joinRoom && {
      key: "join",
      icon: "login",
      label: "Odasına katıl",
      description: options.joinRoom.name,
      onSelect: options.joinRoom.onSelect,
    },
    friendship &&
      friendship.state !== "friend" && {
        key: "friendship",
        icon: friendship.state === "requested" ? "clock" : "userPlus",
        label: friendship.state === "requested" ? "İstek gönderildi" : "Arkadaş ekle",
        disabled: friendship.state === "requested" ? "yanıt bekliyor" : friendship.pending,
        onSelect: friendship.onAdd,
      },
  ]);

  const soundRows = sound
    ? present([
        sound.voice && slider(`${keyPrefix}-voice`, "volume", sound.voice),
        sound.mute && {
          type: "toggle",
          key: "mute",
          icon: "volumeX",
          label: "Sustur",
          on: sound.mute.on,
          onChange: sound.mute.onChange,
        },
        // Their soundboard, not their voice: somebody worth listening to can
        // still be leaning on the emotes.
        sound.emoteMute && {
          type: "toggle",
          key: "emote-mute",
          icon: "music",
          label: "Emote seslerini sustur",
          on: sound.emoteMute.on,
          onChange: sound.emoteMute.onChange,
        },
        sound.cameraHidden && {
          type: "toggle",
          key: "camera",
          icon: "video",
          label: "Kamerasını gizle",
          on: sound.cameraHidden.on,
          onChange: sound.cameraHidden.onChange,
        },
        // Watching is opt-in, so it needs an explicit way out; leaving stops
        // the video at the SFU rather than just hiding it.
        sound.screen?.watch && {
          type: "toggle",
          key: "screen-watch",
          icon: "monitor",
          label: "Yayını izle",
          on: sound.screen.watch.on,
          onChange: sound.screen.watch.onChange,
        },
        sound.screen && slider(`${keyPrefix}-screen`, "monitor", sound.screen.volume),
        sound.screen && {
          type: "toggle",
          key: "screen-audio-mute",
          icon: "volumeX",
          label: "Yayın sesini sustur",
          on: sound.screen.audioMute.on,
          onChange: sound.screen.audioMute.onChange,
        },
        sound.callMute && {
          type: "toggle",
          key: "call-mute",
          icon: "bellOff",
          label: "Aramalarını sessize al",
          on: sound.callMute.on,
          onChange: sound.callMute.onChange,
        },
      ])
    : [];

  const moderationRows: OdakMenuEntry[] = moderation
    ? [
        // Lifting a restriction is one click; applying one asks how long for.
        moderation.isServerMuted
          ? {
              key: "server-unmute",
              icon: "mic",
              label: "Sunucuda susturmayı kaldır",
              onSelect: () => moderation.onServerMute?.(false),
            }
          : {
              type: "submenu",
              key: "server-mute",
              icon: "micOff",
              label: "Sunucuda sustur",
              title: "Ne kadar süre?",
              footer: `Seçtiğin süre boyunca ${name} bu odada konuşamaz.`,
              items: buildDurationMenuItems(`${keyPrefix}-mute`, (durationSeconds) =>
                moderation.onServerMute?.(true, durationSeconds),
              ),
            },
        // The mild answer to "you are in the wrong room", above the two that
        // end somebody's session.
        moderation.onMove && {
          type: "submenu",
          key: "move",
          icon: "move",
          label: "Başka odaya taşı",
          title: "Hangi odaya?",
          items: buildMoveMenuItems(`${keyPrefix}-move`, moderation.moveTargets ?? [], moderation.onMove),
        },
        DIVIDER,
        {
          key: "kick",
          icon: "logout",
          label: "Odadan at",
          danger: true,
          onSelect: () => moderation.onKick?.(),
        },
        // A kick is undone by walking back in; a timeout keeps them out, so it
        // is the one that asks how long for.
        {
          type: "submenu",
          key: "timeout",
          icon: "clock",
          label: "Zaman aşımı",
          danger: true,
          title: "Ne kadar süre?",
          footer: `Seçtiğin süre boyunca ${name} bu odaya giremez.`,
          items: buildDurationMenuItems(
            `${keyPrefix}-timeout`,
            (durationSeconds) => moderation.onTimeout?.(durationSeconds),
            true,
          ),
        },
      ]
    : [];

  const unfriend: OdakMenuEntry = friendship?.state === "friend" && {
    key: "unfriend",
    icon: "userMinus",
    label: "Arkadaşlıktan çıkar",
    opensDialog: friendship.confirms,
    danger: true,
    disabled: friendship.pending,
    onSelect: friendship.onRemove,
  };

  // Each block after the first starts under a line.
  const blocks: OdakMenuEntry[][] = [
    reach,
    options.copyUsername
      ? [
          {
            key: "copy",
            icon: "copy",
            label: "Kullanıcı adını kopyala",
            value: `@${options.copyUsername.username}`,
            onSelect: options.copyUsername.onSelect,
          },
        ]
      : [],
    soundRows.length > 0
      ? [{ type: "group", key: "sound", title: "Ses", hint: "yalnız senin için", items: soundRows }]
      : [],
    moderationRows.length > 0
      ? [
          {
            type: "group",
            key: "moderation",
            title: "Moderasyon",
            hint: "herkes için",
            icon: "shield",
            danger: true,
            items: moderationRows,
          },
        ]
      : [],
    unfriend ? [unfriend] : [],
  ];

  return blocks
    .filter((block) => block.length > 0)
    .flatMap((block, index) => (index === 0 ? block : [DIVIDER, ...block]));
}

/** Whose menu it is, for a menu whose anchor does not show it. */
export function PersonMenuHeader({
  userId,
  name,
  avatarUrl,
  detail,
}: {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  detail?: string;
}): JSX.Element {
  return (
    <OdakMenuHeader
      lead={<Avatar userId={userId} name={name} avatarUrl={avatarUrl} className="menu" />}
      name={name}
      detail={detail}
    />
  );
}
