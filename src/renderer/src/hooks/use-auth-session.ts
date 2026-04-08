import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SessionSnapshot } from "../../../shared/desktop-api-types";
import { authService } from "../services/auth-service";
import { useUiStore } from "../store/ui-store";

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
    queryFn: () => authService.getSession(),
    retry: false,
  });

  useEffect(() => {
    if (sessionQuery.isPending) {
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
    setStatus,
  ]);

  const session =
    sessionQuery.data?.ok && sessionQuery.data.data
      ? sessionQuery.data.data
      : emptySession;

  return {
    appVersion: appVersionQuery.data ?? "-",
    isBooting: sessionQuery.isPending || appVersionQuery.isPending,
    session,
  };
};
