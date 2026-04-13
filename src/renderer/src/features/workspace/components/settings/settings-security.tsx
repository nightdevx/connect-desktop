import { useState } from "react";
import { authService } from "../../../../services/auth-service";

export function SettingsSecurity() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [securityNotice, setSecurityNotice] = useState("");

  const handleChangePassword = async (): Promise<void> => {
    setSecurityNotice("");

    if (currentPassword.trim().length < 8) {
      setSecurityNotice("Mevcut şifre en az 8 karakter olmalı.");
      return;
    }

    if (newPassword.trim().length < 8) {
      setSecurityNotice("Yeni şifre en az 8 karakter olmalı.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setSecurityNotice("Yeni şifre ve şifre tekrarı aynı olmalı.");
      return;
    }

    setIsChangingPassword(true);
    try {
      const result = await authService.changePassword({
        currentPassword,
        newPassword,
      });

      if (!result.ok || !result.data?.changed) {
        setSecurityNotice(
          `Şifre değiştirilemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
        );
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSecurityNotice("Şifre başarıyla değiştirildi.");
    } catch (error) {
      setSecurityNotice(
        `Şifre değiştirilemedi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
      );
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="ct-settings-section">
      <div className="ct-settings-section-header">
        <div className="ct-settings-section-header-icon">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <div>
          <h4>Güvenlik Ayarları</h4>
          <p className="ct-settings-section-description">
            Hesap güvenliği için sadece şifreni bu ekrandan değiştirebilirsin.
          </p>
        </div>
      </div>

      <div className="ct-settings-content">
        <div className="ct-settings-form-group">
          <label className="ct-label" htmlFor="settings-current-password">
            Mevcut Şifre
            <input
              id="settings-current-password"
              className="ct-input"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="Mevcut şifrenizi girin"
            />
          </label>

          <label className="ct-label" htmlFor="settings-new-password">
            Yeni Şifre
            <input
              id="settings-new-password"
              className="ct-input"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              placeholder="Yeni şifrenizi girin"
            />
          </label>

          <label className="ct-label" htmlFor="settings-confirm-password">
            Yeni Şifre (Tekrar)
            <input
              id="settings-confirm-password"
              className="ct-input"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              placeholder="Yeni şifrenizi tekrar girin"
            />
          </label>
        </div>

        <div className="ct-settings-actions">
          <button
            type="button"
            className="ct-btn-primary"
            onClick={() => {
              void handleChangePassword();
            }}
            disabled={isChangingPassword}
          >
            {isChangingPassword
              ? "Şifre değiştiriliyor..."
              : "Şifreyi Değiştir"}
          </button>
        </div>

        {securityNotice && (
          <p className="ct-settings-notice">{securityNotice}</p>
        )}
      </div>
    </div>
  );
}
