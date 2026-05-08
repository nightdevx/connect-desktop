import { useState } from "react";
import { Input, Button, message } from "antd";
import { SafetyOutlined, LockOutlined } from "@ant-design/icons";
import { authService } from "../../../../services/auth-service";

export function SettingsSecurity() {
  const [messageApi, contextHolder] = message.useMessage();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handleChangePassword = async (): Promise<void> => {
    if (currentPassword.trim().length < 8) {
      messageApi.warning("Mevcut şifre en az 8 karakter olmalı.");
      return;
    }

    if (newPassword.trim().length < 8) {
      messageApi.warning("Yeni şifre en az 8 karakter olmalı.");
      return;
    }

    if (newPassword !== confirmPassword) {
      messageApi.warning("Yeni şifre ve şifre tekrarı aynı olmalı.");
      return;
    }

    setIsChangingPassword(true);
    try {
      const result = await authService.changePassword({
        currentPassword,
        newPassword,
      });

      if (!result.ok || !result.data?.changed) {
        messageApi.error(
          `Şifre değiştirilemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
        );
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      messageApi.success("Şifre başarıyla değiştirildi.");
    } catch (error) {
      messageApi.error(
        `Şifre değiştirilemedi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
      );
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="ct-settings-section">
      {contextHolder}
      <div className="ct-settings-section-header">
        <div className="ct-settings-section-header-icon">
          <SafetyOutlined style={{ fontSize: "20px" }} />
        </div>
        <div>
          <h4>Güvenlik Ayarları</h4>
          <p className="ct-settings-section-description">
            Hesap güvenliği için sadece şifreni bu ekrandan değiştirebilirsin.
          </p>
        </div>
      </div>

      <div className="ct-settings-content" style={{ marginTop: "24px" }}>
        <div className="ct-settings-form-group" style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "24px" }}>
          <div>
            <label className="ct-label" htmlFor="settings-current-password" style={{ display: "block", marginBottom: "6px", fontSize: "12px", color: "rgba(255,255,255,0.45)" }}>
              Mevcut Şifre
            </label>
            <Input.Password
              id="settings-current-password"
              prefix={<LockOutlined style={{ color: "rgba(255,255,255,0.25)" }} />}
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="Mevcut şifrenizi girin"
              style={{
                background: "rgba(15, 15, 15, 0.8)",
                borderColor: "rgba(255, 255, 255, 0.08)",
                color: "#f5f5f5",
                borderRadius: "6px",
                height: "40px",
              }}
            />
          </div>

          <div>
            <label className="ct-label" htmlFor="settings-new-password" style={{ display: "block", marginBottom: "6px", fontSize: "12px", color: "rgba(255,255,255,0.45)" }}>
              Yeni Şifre
            </label>
            <Input.Password
              id="settings-new-password"
              prefix={<LockOutlined style={{ color: "rgba(255,255,255,0.25)" }} />}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              placeholder="Yeni şifrenizi girin"
              style={{
                background: "rgba(15, 15, 15, 0.8)",
                borderColor: "rgba(255, 255, 255, 0.08)",
                color: "#f5f5f5",
                borderRadius: "6px",
                height: "40px",
              }}
            />
          </div>

          <div>
            <label className="ct-label" htmlFor="settings-confirm-password" style={{ display: "block", marginBottom: "6px", fontSize: "12px", color: "rgba(255,255,255,0.45)" }}>
              Yeni Şifre (Tekrar)
            </label>
            <Input.Password
              id="settings-confirm-password"
              prefix={<LockOutlined style={{ color: "rgba(255,255,255,0.25)" }} />}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              placeholder="Yeni şifrenizi tekrar girin"
              style={{
                background: "rgba(15, 15, 15, 0.8)",
                borderColor: "rgba(255, 255, 255, 0.08)",
                color: "#f5f5f5",
                borderRadius: "6px",
                height: "40px",
              }}
            />
          </div>
        </div>

        <div className="ct-settings-actions">
          <Button
            type="primary"
            icon={<SafetyOutlined />}
            onClick={() => {
              void handleChangePassword();
            }}
            loading={isChangingPassword}
            disabled={isChangingPassword}
            style={{
              background: isChangingPassword ? "rgba(255, 255, 255, 0.08)" : "#ffffff",
              borderColor: isChangingPassword ? "rgba(255, 255, 255, 0.08)" : "#ffffff",
              color: isChangingPassword ? "rgba(255, 255, 255, 0.25)" : "#000000",
              fontWeight: "600",
              height: "40px",
              borderRadius: "6px",
            }}
          >
            Şifreyi Değiştir
          </Button>
        </div>
      </div>
    </div>
  );
}
