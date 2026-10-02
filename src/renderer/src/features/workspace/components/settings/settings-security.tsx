import { useState } from "react";
import { Input, Button, Modal } from "antd";
import {
  SafetyOutlined,
  LockOutlined,
  DeleteOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import { authService } from "@/features/auth";
import { ModalHeading } from "@/ui/modal-heading";
import { PageHeader } from "@/ui/page-header";
import { toast } from "@/services/toast";

// Matches the backend's AccountDeletionGrace. Only used for the wording, but
// keep the two in step: telling someone "14 days" and purging after 7 is worse
// than not telling them at all.
const DELETION_GRACE_DAYS = 14;

// Typed confirmation for the delete. A password field alone is muscle memory;
// this makes the user state what they are doing.
const DELETE_CONFIRM_WORD = "SİL";

export function SettingsSecurity() {
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
        toast.error(
          `Veriler dışa aktarılamadı: ${result.error?.message ?? "Bilinmeyen hata"}`,
        );
        return;
      }
      if (result.data?.saved) {
        toast.success("Hesap verileri kaydedildi.");
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAccount = async (): Promise<void> => {
    if (deleteConfirmWord.trim().toLocaleUpperCase("tr-TR") !== DELETE_CONFIRM_WORD) {
      toast.warning(`Onaylamak için "${DELETE_CONFIRM_WORD}" yazın.`);
      return;
    }

    if (deletePassword.length < 8) {
      toast.warning("Şifrenizi girin.");
      return;
    }

    setIsDeletingAccount(true);
    try {
      const result = await authService.deleteAccount({
        password: deletePassword,
      });

      if (!result.ok) {
        toast.error(
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
      toast.error(
        `Hesap silinemedi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
      );
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleChangePassword = async (): Promise<void> => {
    if (currentPassword.trim().length < 8) {
      toast.warning("Mevcut şifre en az 8 karakter olmalı.");
      return;
    }

    if (newPassword.trim().length < 8) {
      toast.warning("Yeni şifre en az 8 karakter olmalı.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.warning("Yeni şifre ve şifre tekrarı aynı olmalı.");
      return;
    }

    setIsChangingPassword(true);
    try {
      const result = await authService.changePassword({
        currentPassword,
        newPassword,
      });

      if (!result.ok || !result.data?.changed) {
        toast.error(
          `Şifre değiştirilemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
        );
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Şifre başarıyla değiştirildi.");
    } catch (error) {
      toast.error(
        `Şifre değiştirilemedi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
      );
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="ct-settings-section">
      <PageHeader
        className="ct-settings-section-header"
        title="Güvenlik"
        description="Şifreni değiştirebilir, hesap verilerini indirebilir ve hesabını silebilirsin."
      />

      <div className="ct-settings-content">
        <div className="ct-settings-subsection">
          <h5>Şifre</h5>

          <div className="ct-settings-form-group">
            <div className="ct-settings-field">
              <label
                className="ct-field-label"
                htmlFor="settings-current-password"
              >
                Mevcut Şifre
              </label>
              <Input.Password
                id="settings-current-password"
                prefix={<LockOutlined />}
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="Mevcut şifrenizi girin"
              />
            </div>

            <div className="ct-settings-field">
              <label className="ct-field-label" htmlFor="settings-new-password">
                Yeni Şifre
              </label>
              <Input.Password
                id="settings-new-password"
                prefix={<LockOutlined />}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                placeholder="Yeni şifrenizi girin"
              />
            </div>

            <div className="ct-settings-field">
              <label
                className="ct-field-label"
                htmlFor="settings-confirm-password"
              >
                Yeni Şifre (Tekrar)
              </label>
              <Input.Password
                id="settings-confirm-password"
                prefix={<LockOutlined />}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                placeholder="Yeni şifrenizi tekrar girin"
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
              // An empty form has nothing to submit, and a button that is
              // clickable there only exists to produce a warning toast.
              disabled={
                isChangingPassword ||
                !currentPassword ||
                !newPassword ||
                !confirmPassword
              }
            >
              Şifreyi Değiştir
            </Button>
          </div>
        </div>

        <div className="ct-settings-subsection">
          <h5>Hesap Verileri</h5>
          <p className="ct-field-hint">
            Profil bilgilerinizi ve engel listenizi JSON olarak indirin. Sohbet
            geçmişi dahil değildir: mesajlar karşı tarafla ortak veridir.
          </p>
          <div className="ct-settings-actions">
            <Button
              icon={<DownloadOutlined />}
              loading={isExporting}
              onClick={() => {
                void handleExportData();
              }}
            >
              Verilerimi İndir
            </Button>
          </div>
        </div>

        <div className="ct-settings-subsection danger">
          <h5>Hesabı Sil</h5>
          <p className="ct-field-hint">
            Hesabınız hemen devre dışı bırakılır ve {DELETION_GRACE_DAYS} gün
            sonra kalıcı olarak silinir. Bu süre içinde giriş yaparsanız hesabınız
            geri gelir.
          </p>
          <div className="ct-settings-actions">
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={() => setIsDeleteModalOpen(true)}
            >
              Hesabımı Sil
            </Button>
          </div>
        </div>
      </div>

      {/* rootClassName, like every other dialog in the app. Without it this one
          modal rendered in Ant Design's own chrome -- a different surface, a
          different header rule, a different footer -- and its three children
          stacked flush against each other, because the spacing between them is
          .ct-modal-form's, not something antd supplies. */}
      <Modal
        rootClassName="ct-modal danger"
        open={isDeleteModalOpen}
        title={
          <ModalHeading
            tone="danger"
            icon={<DeleteOutlined />}
            title="Hesabı Sil"
            description={`Hesabınız hemen devre dışı bırakılacak ve ${DELETION_GRACE_DAYS} gün sonra kalıcı olarak silinecek. Bu süre içinde giriş yaparak geri alabilirsiniz.`}
          />
        }
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
        <div className="ct-modal-form">

          <div className="ct-settings-field">
            <label className="ct-field-label" htmlFor="settings-delete-password">
              Şifreniz
            </label>
            <Input.Password
              id="settings-delete-password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
            />
          </div>

          <div className="ct-settings-field">
            <label className="ct-field-label" htmlFor="settings-delete-confirm">
              Onay
            </label>
            <Input
              id="settings-delete-confirm"
              placeholder={`Onaylamak için ${DELETE_CONFIRM_WORD} yazın`}
              value={deleteConfirmWord}
              onChange={(event) => setDeleteConfirmWord(event.target.value)}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}


