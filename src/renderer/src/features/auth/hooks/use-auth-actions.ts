import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  LoginRequest,
  RegisterRequest,
} from "../../../../../shared/auth-contracts";
import type {
  ApiErrorPayload,
  DesktopResult,
  SessionSnapshot,
} from "../../../../../shared/desktop-api-types";
import { authService } from "../services/service";
import { useUiStore } from "../../../store/ui-store";
import { summarizeAuthError } from "../auth-error-messages";

// The backend's own message is English and written for developers. It is no
// longer shown to anyone; auth-error-messages.ts turns the error CODE into
// something a person can act on, and login()/register() hand the raw payload
// back so the form can explain it in place and mark the offending field.
const asErrorPayload = (error: unknown): ApiErrorPayload => {
  if (error instanceof Error) {
    return { code: "UNEXPECTED_ERROR", message: error.message, statusCode: 0 };
  }

  return { code: "UNEXPECTED_ERROR", message: "", statusCode: 0 };
};

export const useAuthActions = () => {
  const queryClient = useQueryClient();
  const setActivePage = useUiStore((state) => state.setActivePage);
  const setStatus = useUiStore((state) => state.setStatus);
  const setWorkspaceSection = useUiStore((state) => state.setWorkspaceSection);
  const setSettingsSection = useUiStore((state) => state.setSettingsSection);
  const setAdminSection = useUiStore((state) => state.setAdminSection);

  const updateSessionCache = (result: DesktopResult<SessionSnapshot>): void => {
    queryClient.setQueryData(["auth-session"], result);
  };

  const loginMutation = useMutation({
    mutationFn: (payload: LoginRequest) => authService.login(payload),
    onSuccess: (result) => {
      if (!result.ok || !result.data) {
        setStatus(
          `Giriş başarısız: ${summarizeAuthError(result.error, "login")}`,
          "error",
        );
        return;
      }

      updateSessionCache(result);
      setStatus("Giriş başarılı", "ok");
    },
    onError: (error) => {
      setStatus(
        `Giriş başarısız: ${summarizeAuthError(asErrorPayload(error), "login")}`,
        "error",
      );
    },
  });

  const registerMutation = useMutation({
    mutationFn: (payload: RegisterRequest) => authService.register(payload),
    onSuccess: (result) => {
      if (!result.ok || !result.data) {
        setStatus(
          `Kayıt başarısız: ${summarizeAuthError(result.error, "register")}`,
          "error",
        );
        return;
      }

      updateSessionCache(result);
      setStatus("Kayıt ve giriş başarılı", "ok");
    },
    onError: (error) => {
      setStatus(
        `Kayıt başarısız: ${summarizeAuthError(asErrorPayload(error), "register")}`,
        "error",
      );
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => authService.logout(),
    onSuccess: (result) => {
      if (!result.ok || !result.data) {
        setStatus(
          `Çıkış başarısız: ${summarizeAuthError(result.error, "login")}`,
          "error",
        );
        return;
      }

      updateSessionCache(result);
      setStatus("Çıkış yapıldı", "ok");
      setWorkspaceSection("lobbies");
      setSettingsSection("profile");
      setAdminSection("dashboard");
      setActivePage("login");
    },
    onError: (error) => {
      setStatus(
        `Çıkış başarısız: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
        "error",
      );
    },
  });

  return {
    isLoading:
      loginMutation.isPending ||
      registerMutation.isPending ||
      logoutMutation.isPending,
    isLoggingOut: logoutMutation.isPending,
    // Resolve with the error instead of throwing it away (or rethrowing): the
    // form needs the payload to explain the failure next to the field that
    // caused it. null means it worked.
    login: async (payload: LoginRequest): Promise<ApiErrorPayload | null> => {
      try {
        const result = await loginMutation.mutateAsync(payload);
        return result.ok && result.data ? null : (result.error ?? asErrorPayload(null));
      } catch (error) {
        return asErrorPayload(error);
      }
    },
    register: async (
      payload: RegisterRequest,
    ): Promise<ApiErrorPayload | null> => {
      try {
        const result = await registerMutation.mutateAsync(payload);
        return result.ok && result.data ? null : (result.error ?? asErrorPayload(null));
      } catch (error) {
        return asErrorPayload(error);
      }
    },
    logout: () => {
      logoutMutation.mutate();
    },
  };
};
