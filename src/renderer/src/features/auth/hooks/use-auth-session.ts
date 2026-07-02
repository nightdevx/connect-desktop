import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SessionSnapshot } from "../../../../../shared/desktop-api-types";
import { authService } from "../services/service";
import { useUiStore } from "../../../store/ui-store";

const getErrorMessage = (error?: { message?: string }): string => {
  if (!error?.message?.trim()) {
    return "Bilinmeyen hata";
  }

  return error.message;
};

const emptySession: SessionSnapshot = {
  authenticated: false,
  user: null,
};

export const useAuthSession = () => {
  const setStatus = useUiStore((state) => state.setStatus);

  const appVersionQuery = useQuery({
    queryKey: ["app-version"],
    queryFn: () => window.desktopApi.getAppVersion(),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const sessionQuery = useQuery({
    queryKey: ["auth-session"],
    // Absorb transient network blips: a single failed recheck must not flip the
    // whole app offline. ~3 tries over a few seconds before an error surfaces.
    retry: 2,
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 4000),
    // A network reconnect blip refetching this destructively tore down live
    // sessions; the 5s poll + `online` listener below handle recovery instead.
    refetchOnReconnect: false,
    queryFn: () => authService.getSession(),
  });

  // Last known-good authenticated session. Once we've authenticated, a failed
  // recheck (unreachable/timeout) is treated as transient: we keep this session
  // so the workspace stays mounted instead of being nuked by one blip. Cleared
  // only when the server explicitly returns an unauthenticated session.
  const lastGoodSessionRef = useRef<SessionSnapshot | null>(null);
  const data = sessionQuery.data;
  if (data?.ok) {
    lastGoodSessionRef.current = data.data?.authenticated ? data.data : null;
  }

  const isBackendUnreachable = Boolean(
    !sessionQuery.isPending &&
      (sessionQuery.isError ||
        (data &&
          !data.ok &&
          (data.error?.code === "BACKEND_UNREACHABLE" ||
            data.error?.code === "REQUEST_TIMEOUT")))
  );

  // Full-screen offline overlay ONLY when we have no authenticated session to
  // fall back on (initial boot with backend down, or after a real logout). If
  // already authenticated, a transient blip keeps the workspace up (its own
  // lobby/LiveKit reconnect handles live drops); we surface a warning instead.
  const isOffline =
    isBackendUnreachable && !lastGoodSessionRef.current?.authenticated;

  // Keep revalidating whenever the backend looks unreachable, whether or not the
  // overlay is showing, so an authenticated session silently re-confirms.
  const needsRevalidate = isBackendUnreachable;

  // Auto-retry on window online event
  useEffect(() => {
    if (!needsRevalidate) return;

    const handleOnline = () => {
      void sessionQuery.refetch();
    };

    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [needsRevalidate, sessionQuery]);

  // Background polling retry (every 5 seconds)
  useEffect(() => {
    if (!needsRevalidate) return;

    const interval = setInterval(() => {
      void sessionQuery.refetch();
    }, 5000);

    return () => {
      clearInterval(interval);
    };
  }, [needsRevalidate, sessionQuery]);

  useEffect(() => {
    if (sessionQuery.isPending || isOffline) {
      return;
    }

    // Transient backend blip while still authenticated: workspace stays mounted,
    // just warn — don't scare the user with an error or tear anything down.
    if (isBackendUnreachable) {
      setStatus(
        "Bağlantı geçici olarak koptu, yeniden deneniyor...",
        "warn",
      );
      return;
    }

    if (sessionQuery.isError) {
      setStatus(
        "Oturum kontrolü sırasında beklenmeyen bir hata oluştu",
        "error",
      );
      return;
    }

    const result = sessionQuery.data;
    if (!result) {
      return;
    }

    if (!result.ok) {
      setStatus(
        `Oturum kontrolü başarısız: ${getErrorMessage(result.error)}`,
        "error",
      );
      return;
    }

    if (result.data?.authenticated) {
      setStatus("Kimlik doğrulandı", "ok");
      return;
    }

    setStatus("Giriş gerekli", "warn");
  }, [
    sessionQuery.data,
    sessionQuery.isError,
    sessionQuery.isPending,
    isOffline,
    isBackendUnreachable,
    setStatus,
  ]);

  // On a fresh authenticated/unauthenticated answer use it; on a transient
  // failure fall back to the last known-good session so the workspace survives.
  const session =
    data?.ok && data.data
      ? data.data
      : (lastGoodSessionRef.current ?? emptySession);

  return {
    appVersion: appVersionQuery.data ?? "-",
    isBooting: (sessionQuery.isPending || appVersionQuery.isPending) && !isOffline,
    isOffline,
    retryConnection: () => {
      void sessionQuery.refetch();
    },
    session,
  };
};
