import type {
  DesktopResult,
  SessionSnapshot,
} from "../../../../../shared/desktop-api-types";
import type {
  ChangePasswordRequest,
  LoginRequest,
  RegisterRequest,
  UpdateProfileRequest,
  UserSettingsProfile,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  SendVerificationOTPRequest,
  VerifyEmailRequest,
} from "../../../../../shared/auth-contracts";

export const authService = {
  login: (payload: LoginRequest): Promise<DesktopResult<SessionSnapshot>> => {
    return window.desktopApi.login(payload);
  },
  register: (
    payload: RegisterRequest,
  ): Promise<DesktopResult<SessionSnapshot>> => {
    return window.desktopApi.register(payload);
  },
  forgotPassword: (payload: ForgotPasswordRequest): Promise<DesktopResult<{ sent: boolean }>> => {
    return window.desktopApi.forgotPassword(payload);
  },
  resetPassword: (payload: ResetPasswordRequest): Promise<DesktopResult<{ reset: boolean }>> => {
    return window.desktopApi.resetPassword(payload);
  },
  sendVerificationOTP: (payload: SendVerificationOTPRequest): Promise<DesktopResult<{ sent: boolean }>> => {
    return window.desktopApi.sendVerificationOTP(payload);
  },
  verifyEmail: (payload: VerifyEmailRequest): Promise<DesktopResult<{ verified: boolean }>> => {
    return window.desktopApi.verifyEmail(payload);
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
