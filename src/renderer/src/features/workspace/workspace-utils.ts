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
export const PRESENCE_COLORS: Record<PresenceStatus, string> = {
  online: "#22c55e",
  idle: "#eab308",
  dnd: "#ef4444",
  offline: "#6b7280",
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

