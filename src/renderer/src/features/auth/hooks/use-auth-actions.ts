import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  LoginRequest,
  RegisterRequest,
} from "../../../../../shared/auth-contracts";
import type {
  DesktopResult,
  SessionSnapshot,
} from "../../../../../shared/desktop-api-types";
import { authService } from "../services/service";
import { useUiStore } from "../../../store/ui-store";

const getErrorMessage = (error?: { message?: string }): string => {
  if (!error?.message?.trim()) {
    return "Bilinmeyen hata";
  }

  return error.message;
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
        setStatus(`Giriş başarısız: ${getErrorMessage(result.error)}`, "error");
        return;
      }

      updateSessionCache(result);
      setStatus("Giriş başarılı", "ok");
    },
    onError: (error) => {
      setStatus(
        `Giriş başarısız: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
        "error",
      );
    },
  });

  const registerMutation = useMutation({
    mutationFn: (payload: RegisterRequest) => authService.register(payload),
    onSuccess: (result) => {
      if (!result.ok || !result.data) {
        setStatus(`Kayıt başarısız: ${getErrorMessage(result.error)}`, "error");
        return;
      }

      updateSessionCache(result);
      setStatus("Kayıt ve giriş başarılı", "ok");
    },
    onError: (error) => {
      setStatus(
        `Kayıt başarısız: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
        "error",
      );
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => authService.logout(),
    onSuccess: (result) => {
      if (!result.ok || !result.data) {
        setStatus(`Çıkış başarısız: ${getErrorMessage(result.error)}`, "error");
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
    login: async (payload: LoginRequest) => {
      await loginMutation.mutateAsync(payload);
    },
    register: async (payload: RegisterRequest) => {
      await registerMutation.mutateAsync(payload);
    },
    logout: () => {
      logoutMutation.mutate();
    },
  };
};
