import { useState } from "react";
import { Input, Button, message, Modal } from "antd";
import {
  SafetyOutlined,
  LockOutlined,
  DeleteOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import { authService } from "../../../auth";

// Matches the backend's AccountDeletionGrace. Only used for the wording, but
// keep the two in step: telling someone "14 days" and purging after 7 is worse
// than not telling them at all.
const DELETION_GRACE_DAYS = 14;

// Typed confirmation for the delete. A password field alone is muscle memory;
// this makes the user state what they are doing.
const DELETE_CONFIRM_WORD = "SİL";

export function SettingsSecurity() {
  const [messageApi, contextHolder] = message.useMessage();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmWord, setDeleteConfirmWord] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExportData = async (): Promise<void> => {
    setIsExporting(true);
    try {
      const result = await authService.exportAccountData();
      if (!result.ok) {
        messageApi.error(
          `Veriler dışa aktarılamadı: ${result.error?.message ?? "Bilinmeyen hata"}`,
        );
        return;
      }
      if (result.data?.saved) {
        messageApi.success("Hesap verileri kaydedildi.");
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAccount = async (): Promise<void> => {
    if (deleteConfirmWord.trim().toLocaleUpperCase("tr-TR") !== DELETE_CONFIRM_WORD) {
      messageApi.warning(`Onaylamak için "${DELETE_CONFIRM_WORD}" yazın.`);
      return;
    }

    if (deletePassword.length < 8) {
      messageApi.warning("Şifrenizi girin.");
      return;
    }

    setIsDeletingAccount(true);
    try {
      const result = await authService.deleteAccount({
        password: deletePassword,
      });

      if (!result.ok) {
        messageApi.error(
          `Hesap silinemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
        );
        return;
      }

      setIsDeleteModalOpen(false);
      setDeletePassword("");
      setDeleteConfirmWord("");
      // The main process has already cleared the session; a reload drops the
      // app back to the login screen without needing a shell-level callback.
      window.location.reload();
    } catch (error) {
      messageApi.error(
        `Hesap silinemedi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
      );
    } finally {
      setIsDeletingAccount(false);
    }
  };

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

        <div
          style={{
            marginTop: "32px",
            paddingTop: "24px",
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <h5 style={{ margin: 0, fontSize: "13px", color: "rgba(255,255,255,0.8)" }}>
            Hesap Verileri
          </h5>
          <p
            style={{
              margin: "6px 0 12px",
              fontSize: "12px",
              color: "rgba(255,255,255,0.45)",
            }}
          >
            Profil bilgilerinizi ve engel listenizi JSON olarak indirin. Sohbet
            geçmişi dahil değildir: mesajlar karşı tarafla ortak veridir.
          </p>
          <Button
            icon={<DownloadOutlined />}
            loading={isExporting}
            onClick={() => {
              void handleExportData();
            }}
            style={{
              background: "rgba(255,255,255,0.04)",
              borderColor: "rgba(255,255,255,0.12)",
              color: "#f5f5f5",
              height: "38px",
              borderRadius: "6px",
            }}
          >
            Verilerimi İndir
          </Button>
        </div>

        <div
          style={{
            marginTop: "24px",
            paddingTop: "24px",
            borderTop: "1px solid rgba(255, 77, 79, 0.2)",
          }}
        >
          <h5 style={{ margin: 0, fontSize: "13px", color: "#ff7875" }}>
            Hesabı Sil
          </h5>
          <p
            style={{
              margin: "6px 0 12px",
              fontSize: "12px",
              color: "rgba(255,255,255,0.45)",
            }}
          >
            Hesabınız hemen devre dışı bırakılır ve {DELETION_GRACE_DAYS} gün
            sonra kalıcı olarak silinir. Bu süre içinde giriş yaparsanız hesabınız
            geri gelir.
          </p>
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={() => setIsDeleteModalOpen(true)}
            style={{ height: "38px", borderRadius: "6px" }}
          >
            Hesabımı Sil
          </Button>
        </div>
      </div>

      <Modal
        open={isDeleteModalOpen}
        title="Hesabı Sil"
        okText="Hesabımı Sil"
        cancelText="Vazgeç"
        confirmLoading={isDeletingAccount}
        okButtonProps={{ danger: true }}
        onCancel={() => {
          setIsDeleteModalOpen(false);
          setDeletePassword("");
          setDeleteConfirmWord("");
        }}
        onOk={() => {
          void handleDeleteAccount();
        }}
      >
        <p style={{ marginBottom: 12 }}>
          Hesabınız hemen devre dışı bırakılacak ve {DELETION_GRACE_DAYS} gün
          sonra kalıcı olarak silinecek. Bu süre içinde giriş yaparak geri
          alabilirsiniz.
        </p>
        <Input.Password
          placeholder="Şifreniz"
          autoComplete="current-password"
          value={deletePassword}
          onChange={(event) => setDeletePassword(event.target.value)}
          style={{ marginBottom: 8 }}
        />
        <Input
          placeholder={`Onaylamak için ${DELETE_CONFIRM_WORD} yazın`}
          value={deleteConfirmWord}
          onChange={(event) => setDeleteConfirmWord(event.target.value)}
        />
      </Modal>
    </div>
  );
}


