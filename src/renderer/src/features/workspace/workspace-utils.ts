import type { PresenceStatus } from "@shared/auth-contracts";

export type UserFilter = "all" | "online" | "offline";

export const getApiErrorMessage = (error?: { message?: string }): string => {
  if (!error?.message?.trim()) {
    return "Bilinmeyen hata";
  }

  return error.message;
};

export const getUserStatusLabel = (
  appOnline?: boolean,
  presence?: PresenceStatus,
): string => {
  if (!appOnline) {
    return "Çevrimdışı";
  }

  switch (presence) {
    case "idle":
      return "Boşta";
    case "dnd":
      return "Rahatsız etmeyin";
    // Only ever seen by the person who chose it: the server reports appOnline
    // false for them, so everyone else takes the branch above.
    case "offline":
      return "Çevrimdışı görünüyorsun";
    default:
      return "Çevrimiçi";
  }
};

// Colours are shared by the sidebar dot, the profile drawer and the presence
// picker so a status always reads the same way.
//
// Token references, not hex. These are handed to `style={{ background }}`, and
// an inline style is the one place a stylesheet cannot reach — so the literals
// that used to be here were the only colours in the app that could not follow
// the light theme. The dark theme's green and amber measure 2.3:1 and 1.7:1 on
// a white ground, which is a dot that has stopped saying anything.
export const PRESENCE_COLORS: Record<PresenceStatus, string> = {
  online: "var(--ct-presence-online)",
  idle: "var(--ct-presence-idle)",
  dnd: "var(--ct-presence-dnd)",
  offline: "var(--ct-presence-offline)",
};

export const getPresenceColor = (
  appOnline?: boolean,
  presence?: PresenceStatus,
): string => {
  if (!appOnline) {
    return PRESENCE_COLORS.offline;
  }
  return PRESENCE_COLORS[presence ?? "online"] ?? PRESENCE_COLORS.online;
};

export const formatDateLabel = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Bilinmiyor";
  }

  return new Intl.DateTimeFormat("tr-TR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

/**
 * How long somebody has been here, in words: "3 yıl 2 ay", "5 ay", "12 gün".
 *
 * A date on its own is a fact nobody can rank — "14.03.2024" says nothing about
 * whether this is a founding member or someone who signed up last week, which
 * is the only thing a join date is ever read for.
 */
export const formatMembershipLength = (value: string): string => {
  const start = new Date(value);
  if (Number.isNaN(start.getTime())) {
    return "Bilinmiyor";
  }

  const days = Math.max(
    0,
    Math.floor((Date.now() - start.getTime()) / 86_400_000),
  );

  if (days < 1) {
    return "Bugün katıldı";
  }
  if (days < 31) {
    return `${days} gün`;
  }

  const months = Math.floor(days / 30.44);
  if (months < 12) {
    return `${months} ay`;
  }

  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  return remainingMonths > 0 ? `${years} yıl ${remainingMonths} ay` : `${years} yıl`;
};

export const formatTimeLabel = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

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

