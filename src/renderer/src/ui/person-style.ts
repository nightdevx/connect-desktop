import type { CSSProperties } from "react";

/**
 * The hue this person's name is written in, in a room with many speakers.
 *
 * A hue, not a colour: the stylesheet builds the final value with oklch() from
 * a lightness and a chroma that the theme owns, so one hue reads correctly on
 * both the near-black and the near-white ground. Handing out finished hex here
 * would mean a palette that is legible on exactly one of them.
 *
 * Twelve stops rather than `hash % 360`, because evenly spaced hues at fixed
 * chroma include a stretch of yellow-greens that read as the same colour next
 * to each other. These are picked to be distinguishable in a roster.
 *
 * Keyed by user id, not by name: a display name can change mid-conversation,
 * and a colour that moves is worse than no colour at all.
 */
const NAME_HUES = [12, 38, 62, 96, 140, 168, 196, 232, 262, 292, 322, 348];

export const getUsernameHue = (userId: string): number => {
  // djb2. Not for security -- for a well-spread bucket index from short ids
  // that often share a prefix.
  let hash = 5381;
  for (let index = 0; index < userId.length; index += 1) {
    hash = ((hash << 5) + hash + userId.charCodeAt(index)) | 0;
  }

  return NAME_HUES[Math.abs(hash) % NAME_HUES.length];
};

/**
 * The inline style that gives a face without a picture its owner's colour --
 * see .ct-hued and the avatar rules that read --ct-name-h. Every face in the
 * app (rows, tiles, the dock, messages) takes the same hue for the same person.
 */
export const hueStyle = (userId: string): CSSProperties =>
  ({ "--ct-name-h": getUsernameHue(userId) }) as CSSProperties;

export const getDisplayInitials = (value: string): string => {
  const parts = value.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "?";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};
