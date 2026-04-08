import type {
  DesktopResult,
  SessionSnapshot,
} from "../../../shared/desktop-api-types";
import type {
  ChangePasswordRequest,
  LoginRequest,
  RegisterRequest,
  UpdateProfileRequest,
  UserSettingsProfile,
} from "../../../shared/auth-contracts";

export const authService = {
  login: (payload: LoginRequest): Promise<DesktopResult<SessionSnapshot>> => {
    return window.desktopApi.login(payload);
  },
  register: (
    payload: RegisterRequest,
  ): Promise<DesktopResult<SessionSnapshot>> => {
    return window.desktopApi.register(payload);
  },
  changePassword: (payload: ChangePasswordRequest) => {
    return window.desktopApi.changePassword(payload);
  },
  logout: (): Promise<DesktopResult<SessionSnapshot>> => {
    return window.desktopApi.logout();
  },
  getSession: (): Promise<DesktopResult<SessionSnapshot>> => {
    return window.desktopApi.getSession();
  },
  getProfile: (): Promise<DesktopResult<{ profile: UserSettingsProfile }>> => {
    return window.desktopApi.getAuthProfile();
  },
  updateProfile: (
    payload: UpdateProfileRequest,
  ): Promise<DesktopResult<{ profile: UserSettingsProfile }>> => {
    return window.desktopApi.updateAuthProfile(payload);
  },
};
