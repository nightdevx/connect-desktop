import { useAuthActions } from "./use-auth-actions";
import { useAuthSession } from "./use-auth-session";
import { useUiStore } from "../store/ui-store";

export const useAuthController = () => {
  const activePage = useUiStore((state) => state.activePage);
  const statusMessage = useUiStore((state) => state.statusMessage);
  const statusTone = useUiStore((state) => state.statusTone);
  const setActivePage = useUiStore((state) => state.setActivePage);
  const sessionState = useAuthSession();
  const actionState = useAuthActions();

  return {
    activePage,
    statusMessage,
    statusTone,
    appVersion: sessionState.appVersion,
    isBooting: sessionState.isBooting,
    isLoading: actionState.isLoading,
    isLoggingOut: actionState.isLoggingOut,
    session: sessionState.session,
    setActivePage,
    login: actionState.login,
    register: actionState.register,
    logout: actionState.logout,
  };
};
