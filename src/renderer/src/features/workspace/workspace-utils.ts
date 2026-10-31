import type { PresenceStatus } from "@shared/auth-contracts";
import {
  isTransientApiError,
  TRANSIENT_API_ERROR_MESSAGE,
} from "@shared/error-message";

export type UserFilter = "all" | "online" | "offline";

export const getApiErrorMessage = (error?: {
  code?: string;
  statusCode?: number;
  message?: string;
}): string => {
  if (isTransientApiError(error)) {
    return TRANSIENT_API_ERROR_MESSAGE;
  }

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

// What other people see: "offline" for anyone without a connection, whatever
// they picked. One status per place, drawn as one glyph (PresenceGlyph).
export const getVisiblePresence = (
  appOnline?: boolean,
  presence?: PresenceStatus,
): PresenceStatus => (appOnline ? (presence ?? "online") : "offline");

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

