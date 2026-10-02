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

export const formatActivityElapsed = (
  startedAt: string,
  nowMs: number = Date.now(),
): string => {
  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) {
    return "";
  }

  const totalSeconds = Math.max(0, Math.floor((nowMs - start.getTime()) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number): string => String(value).padStart(2, "0");

  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
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

// A person's colour and initials live in @/ui, where every feature can reach
// them; re-exported here so the workspace's own imports stay as they were.
export { getDisplayInitials, getUsernameHue, hueStyle } from "@/ui/person-style";

