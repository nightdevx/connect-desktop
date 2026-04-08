export type UserFilter = "all" | "online" | "offline";

export const getApiErrorMessage = (error?: { message?: string }): string => {
  if (!error?.message?.trim()) {
    return "Bilinmeyen hata";
  }

  return error.message;
};

export const getUserStatusLabel = (appOnline?: boolean): string => {
  if (appOnline) {
    return "Çevrimiçi";
  }

  return "Çevrimdışı";
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
