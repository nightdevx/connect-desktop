import type { OdakMenuEntry } from "@/ui/odak-menu";

/**
 * How long a moderator mute or a removal lasts.
 *
 * `seconds` undefined is indefinite — the restriction stands until somebody
 * lifts it — and that option is LAST in the list on purpose: the permanent one
 * should not be the row sitting under the cursor when the submenu opens.
 *
 * A fixed list rather than a free-text field. This is a decision made in the
 * middle of something going wrong in a voice room, where a duration picker is
 * three interactions too many, and every extra row is another thing to read
 * before acting.
 */
export interface ModerationDuration {
  key: string;
  label: string;
  seconds?: number;
}

export const MODERATION_DURATIONS: ModerationDuration[] = [
  { key: "5m", label: "5 dakika", seconds: 5 * 60 },
  { key: "15m", label: "15 dakika", seconds: 15 * 60 },
  { key: "1h", label: "1 saat", seconds: 60 * 60 },
  { key: "1d", label: "1 gün", seconds: 24 * 60 * 60 },
  { key: "forever", label: "Süresiz" },
];

/**
 * The submenu rows, shared by every place a member can be moderated from — the
 * video tile's menu and the sidebar roster's — so the two can never offer
 * different durations for the same action. The indefinite one is set apart
 * under a line, and red where it keeps somebody out.
 */
export const buildDurationMenuItems = (
  keyPrefix: string,
  onPick: (durationSeconds?: number) => void,
  foreverIsDanger = false,
): OdakMenuEntry[] =>
  MODERATION_DURATIONS.flatMap((duration): OdakMenuEntry[] =>
    duration.seconds === undefined
      ? [
          { type: "divider" },
          {
            key: `${keyPrefix}-${duration.key}`,
            label: duration.label,
            description: "Biri kaldırana kadar",
            danger: foreverIsDanger,
            onSelect: () => onPick(undefined),
          },
        ]
      : [
          {
            key: `${keyPrefix}-${duration.key}`,
            label: duration.label,
            onSelect: () => onPick(duration.seconds),
          },
        ],
  );

/**
 * The destination rows, shared by the same two menus for the same reason.
 *
 * An empty list is not an empty submenu: a disabled "no other room" row says
 * why nothing can be picked, where an empty menu just looks broken.
 */
export const buildMoveMenuItems = (
  keyPrefix: string,
  targets: Array<{ id: string; name: string }>,
  onPick: (targetLobbyId: string) => void,
): OdakMenuEntry[] => {
  if (targets.length === 0) {
    return [
      {
        key: `${keyPrefix}-empty`,
        label: "Taşınacak başka oda yok",
        disabled: true,
        onSelect: () => undefined,
      },
    ];
  }

  return targets.map((target) => ({
    key: `${keyPrefix}-${target.id}`,
    label: target.name,
    onSelect: () => onPick(target.id),
  }));
};

/** Human-readable confirmation text, so a moderator sees what they just chose. */
export const describeDuration = (durationSeconds?: number): string =>
  MODERATION_DURATIONS.find((duration) => duration.seconds === durationSeconds)?.label ??
  "Süresiz";
