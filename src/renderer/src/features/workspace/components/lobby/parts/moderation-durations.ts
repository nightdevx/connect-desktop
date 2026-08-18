import type { MenuProps } from "antd";

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
 * The submenu rows, shared by both places a member can be moderated from — the
 * video tile's menu and the sidebar roster's — so the two can never offer
 * different durations for the same action.
 */
export const buildDurationMenuItems = (
  keyPrefix: string,
  onPick: (durationSeconds?: number) => void,
): NonNullable<MenuProps["items"]> =>
  MODERATION_DURATIONS.map((duration) => ({
    key: `${keyPrefix}-${duration.key}`,
    label: duration.label,
    className: "ct-participant-context-menu-button",
    onClick: () => onPick(duration.seconds),
  }));

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
): NonNullable<MenuProps["items"]> => {
  if (targets.length === 0) {
    return [
      {
        key: `${keyPrefix}-empty`,
        label: "Taşınacak başka oda yok",
        disabled: true,
      },
    ];
  }

  return targets.map((target) => ({
    key: `${keyPrefix}-${target.id}`,
    label: target.name,
    className: "ct-participant-context-menu-button",
    onClick: () => onPick(target.id),
  }));
};

/** Human-readable confirmation text, so a moderator sees what they just chose. */
export const describeDuration = (durationSeconds?: number): string =>
  MODERATION_DURATIONS.find((duration) => duration.seconds === durationSeconds)?.label ??
  "Süresiz";
