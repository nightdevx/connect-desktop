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

