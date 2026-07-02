import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Input, Button, Avatar, message } from "antd";
import {
  UserOutlined,
  UploadOutlined,
  DeleteOutlined,
  SaveOutlined,
  ReloadOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import { authService } from "../../../auth";

interface ProfileSettings {
  displayName: string;
  email: string;
  emailVerified: boolean;
  bio: string;
  avatarUrl: string | null;
}

interface ProfileSettingsProps {
  currentUsername: string;
  onLogout?: () => void;
  isLoggingOut?: boolean;
}

const MAX_AVATAR_FILE_BYTES = 512 * 1024;
const SUPPORTED_AVATAR_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const getInitials = (value: string): string => {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const readFileAsDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Dosya okunamadı"));
        return;
      }

      resolve(reader.result);
    };

    reader.onerror = () => {
      reject(new Error("Dosya okunamadı"));
    };

    reader.readAsDataURL(file);
  });
};

export function SettingsProfile({
  currentUsername,
  onLogout,
  isLoggingOut,
}: ProfileSettingsProps) {
  const queryClient = useQueryClient();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [messageApi, contextHolder] = message.useMessage();

  const [profileSettings, setProfileSettings] = useState<ProfileSettings>({
    displayName: currentUsername,
    email: "",
    emailVerified: false,
    bio: "",
    avatarUrl: null,
  });

  const [savedEmail, setSavedEmail] = useState("");
  const [verificationSent, setVerificationSent] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);

  useEffect(() => {
    setVerificationSent(false);
    setVerificationCode("");
  }, [profileSettings.email]);

  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsProfileLoading(true);

    void authService
      .getProfile()
      .then((result) => {
        if (cancelled) {
          return;
        }

        if (!result.ok || !result.data?.profile) {
          setProfileSettings({
            displayName: currentUsername,
            email: "",
            emailVerified: false,
            bio: "",
            avatarUrl: null,
          });
          setSavedEmail("");

          if (!result.ok) {
            messageApi.error(
              `Profil bilgisi alınamadı: ${result.error?.message ?? "Bilinmeyen hata"}`,
            );
          }
          return;
        }

        const profile = result.data.profile;
        setProfileSettings({
          displayName: profile.displayName?.trim() || currentUsername,
          email: profile.email ?? "",
          emailVerified: !!profile.emailVerified,
          bio: profile.bio ?? "",
          avatarUrl: profile.avatarUrl ?? null,
        });
        setSavedEmail(profile.email ?? "");
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setProfileSettings({
          displayName: currentUsername,
          email: "",
          emailVerified: false,
          bio: "",
          avatarUrl: null,
        });
        setSavedEmail("");
        messageApi.error(
          `Profil bilgisi alınamadı: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
        );
      })
      .finally(() => {
        if (!cancelled) {
          setIsProfileLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentUsername]);

  const handleSaveProfile = async (): Promise<void> => {
    const normalizedDisplayName = profileSettings.displayName.trim();
    if (normalizedDisplayName.length < 3) {
      messageApi.warning("Görünen ad en az 3 karakter olmalı.");
      return;
    }

    setIsSavingProfile(true);
    try {
      const result = await authService.updateProfile({
        displayName: normalizedDisplayName,
        email: profileSettings.email.trim() || null,
        bio: profileSettings.bio.trim() || null,
        avatarUrl: profileSettings.avatarUrl,
      });

      if (!result.ok || !result.data?.profile) {
        messageApi.error(
          `Profil kaydedilemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
        );
        return;
      }

      const profile = result.data.profile;
      setProfileSettings({
        displayName: profile.displayName,
        email: profile.email ?? "",
        emailVerified: !!profile.emailVerified,
        bio: profile.bio ?? "",
        avatarUrl: profile.avatarUrl ?? null,
      });
      setSavedEmail(profile.email ?? "");
      await queryClient.invalidateQueries({ queryKey: ["workspace-users"] });
      messageApi.success("Profil ayarları kaydedildi.");
    } catch (error) {
      messageApi.error(
        `Profil kaydedilemedi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
      );
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSendVerificationCode = async (): Promise<void> => {
    const targetEmail = profileSettings.email.trim();
    if (!targetEmail) {
      messageApi.warning("Lütfen önce geçerli bir e-posta adresi girin ve kaydedin.");
      return;
    }

    setIsSendingCode(true);
    try {
      const result = await authService.sendVerificationOTP({
        email: targetEmail,
      });
      if (result.ok) {
        setVerificationSent(true);
        messageApi.success("Doğrulama kodu e-posta adresinize gönderildi!");
      } else {
        messageApi.error(
          `Kod gönderilemedi: ${result.error?.message ?? "Bilinmeyen hata"}`
        );
      }
    } catch (error) {
      messageApi.error(
        `Kod gönderilemedi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`
      );
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleVerifyEmailCode = async (): Promise<void> => {
    if (verificationCode.length !== 6) {
      messageApi.warning("Lütfen 6 haneli doğrulama kodunu girin.");
      return;
    }

    setIsVerifyingCode(true);
    try {
      const result = await authService.verifyEmail({
        email: profileSettings.email.trim(),
        code: verificationCode,
      });

      if (result.ok) {
        messageApi.success("E-posta adresiniz başarıyla doğrulandı!");
        setProfileSettings((prev) => ({
          ...prev,
          emailVerified: true,
        }));
        setVerificationSent(false);
        setVerificationCode("");
      } else {
        messageApi.error(
          `Doğrulama başarısız: ${result.error?.message ?? "Bilinmeyen hata"}`
        );
      }
    } catch (error) {
      messageApi.error(
        `Doğrulama başarısız: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`
      );
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const handleResetProfile = async (): Promise<void> => {
    setIsSavingProfile(true);
    try {
      const result = await authService.updateProfile({
        displayName: currentUsername,
        email: null,
        bio: null,
        avatarUrl: null,
      });

      if (!result.ok || !result.data?.profile) {
        messageApi.error(
          `Profil sıfırlanamadı: ${result.error?.message ?? "Bilinmeyen hata"}`,
        );
        return;
      }

      const profile = result.data.profile;
      setProfileSettings({
        displayName: profile.displayName,
        email: profile.email ?? "",
        emailVerified: !!profile.emailVerified,
        bio: profile.bio ?? "",
        avatarUrl: profile.avatarUrl ?? null,
      });
      setSavedEmail(profile.email ?? "");
      await queryClient.invalidateQueries({ queryKey: ["workspace-users"] });
      messageApi.success("Profil ayarları varsayılana döndürüldü.");
    } catch (error) {
      messageApi.error(
        `Profil sıfırlanamadı: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
      );
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleAvatarSelect = async (
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!SUPPORTED_AVATAR_MIME_TYPES.has(file.type)) {
      messageApi.warning("Desteklenen formatlar: PNG, JPG, WEBP veya GIF.");
      return;
    }

    if (file.size > MAX_AVATAR_FILE_BYTES) {
      messageApi.warning("Logo boyutu en fazla 512 KB olabilir.");
      return;
    }

    try {
      const dataURL = await readFileAsDataURL(file);
      setProfileSettings((previous) => ({
        ...previous,
        avatarUrl: dataURL,
      }));
      messageApi.info("Logo seçildi. Kaydet'e basarak profiline uygula.");
    } catch (error) {
      messageApi.error(
        `Logo okunamadı: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
      );
    }
  };

  const handleAvatarClear = (): void => {
    setProfileSettings((previous) => ({
      ...previous,
      avatarUrl: null,
    }));
    messageApi.info("Logo kaldırıldı. Kaydet'e basarak değişikliği uygula.");
  };

  return (
    <div className="ct-settings-section">
      {contextHolder}
      <div className="ct-settings-section-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "start", gap: "12px" }}>
          <div className="ct-settings-section-header-icon">
            <UserOutlined style={{ fontSize: "20px" }} />
          </div>
          <div>
            <h4 style={{ margin: 0 }}>Profil Ayarları</h4>
            <p className="ct-settings-section-description" style={{ margin: 0 }}>
              Hesap görünüm bilgilerini buradan yönetebilirsin.
            </p>
          </div>
        </div>

        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={() => {
            void handleSaveProfile();
          }}
          loading={isSavingProfile}
          disabled={isProfileLoading || isSavingProfile}
          style={{
            background: (isProfileLoading || isSavingProfile) ? "rgba(255, 255, 255, 0.08)" : "#ffffff",
            borderColor: (isProfileLoading || isSavingProfile) ? "rgba(255, 255, 255, 0.08)" : "#ffffff",
            color: (isProfileLoading || isSavingProfile) ? "rgba(255, 255, 255, 0.25)" : "#000000",
            fontWeight: "600",
            height: "40px",
            borderRadius: "6px",
          }}
        >
          Profili Kaydet
        </Button>
      </div>

      <div className="ct-settings-content" style={{ marginTop: "24px" }}>
        <div className="ct-settings-profile-avatar-row" style={{ display: "flex", gap: "20px", alignItems: "center", marginBottom: "24px" }}>
          <Avatar
            size={80}
            src={profileSettings.avatarUrl}
            icon={!profileSettings.avatarUrl && <UserOutlined />}
            style={{
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              color: "#ffffff",
              fontSize: "24px",
              fontWeight: "600",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {!profileSettings.avatarUrl && getInitials(profileSettings.displayName || currentUsername)}
          </Avatar>

          <div className="ct-settings-profile-avatar-actions" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(event) => {
                void handleAvatarSelect(event);
              }}
              hidden
            />

            <div style={{ display: "flex", gap: "8px" }}>
              <Button
                type="text"
                icon={<UploadOutlined />}
                onClick={() => avatarInputRef.current?.click()}
                disabled={isProfileLoading || isSavingProfile}
                style={{
                  background: "rgba(255, 255, 255, 0.05)",
                  borderColor: "rgba(255, 255, 255, 0.1)",
                  color: "#ffffff",
                }}
              >
                Logo Yükle
              </Button>

              {profileSettings.avatarUrl && (
                <Button
                  danger
                  type="text"
                  icon={<DeleteOutlined />}
                  onClick={handleAvatarClear}
                  disabled={isProfileLoading || isSavingProfile}
                  style={{
                    background: "rgba(239, 68, 68, 0.08)",
                  }}
                >
                  Logoyu Kaldır
                </Button>
              )}
            </div>

            <small style={{ color: "rgba(255,255,255,0.4)", fontSize: "11px" }}>PNG/JPG/WEBP/GIF - En fazla 512 KB</small>
          </div>
        </div>

        <div className="ct-settings-grid" style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "24px" }}>
          <div>
            <label className="ct-label" htmlFor="settings-display-name" style={{ display: "block", marginBottom: "6px", fontSize: "12px", color: "rgba(255,255,255,0.45)" }}>
              Görünen Ad
            </label>
            <Input
              id="settings-display-name"
              value={profileSettings.displayName}
              onChange={(event) =>
                setProfileSettings((previous) => ({
                  ...previous,
                  displayName: event.target.value,
                }))
              }
              maxLength={40}
              disabled={isProfileLoading || isSavingProfile}
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <label className="ct-label" htmlFor="settings-email" style={{ fontSize: "12px", color: "rgba(255,255,255,0.45)", margin: 0 }}>
                E-posta Adresi
              </label>
              {profileSettings.email ? (
                profileSettings.emailVerified ? (
                  <span style={{
                    fontSize: "10px",
                    fontWeight: "600",
                    color: "#10b981",
                    background: "rgba(16, 185, 129, 0.1)",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    border: "1px solid rgba(16, 185, 129, 0.2)"
                  }}>
                    Doğrulanmış
                  </span>
                ) : (
                  <span style={{
                    fontSize: "10px",
                    fontWeight: "600",
                    color: "#f59e0b",
                    background: "rgba(245, 158, 11, 0.1)",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    border: "1px solid rgba(245, 158, 11, 0.2)"
                  }}>
                    Doğrulanmamış
                  </span>
                )
              ) : (
                <span style={{
                  fontSize: "10px",
                  fontWeight: "600",
                  color: "#ef4444",
                  background: "rgba(239, 68, 68, 0.1)",
                  padding: "2px 8px",
                  borderRadius: "12px",
                  border: "1px solid rgba(239, 68, 68, 0.2)"
                }}>
                  E-posta Yok
                </span>
              )}
            </div>
            <Input
              id="settings-email"
              value={profileSettings.email}
              onChange={(event) =>
                setProfileSettings((previous) => ({
                  ...previous,
                  email: event.target.value,
                }))
              }
              placeholder="örnek@mail.com"
              disabled={isProfileLoading || isSavingProfile}
              style={{
                background: "rgba(15, 15, 15, 0.8)",
                borderColor: "rgba(255, 255, 255, 0.08)",
                color: "#f5f5f5",
                borderRadius: "6px",
                height: "40px",
              }}
            />
            
            {profileSettings.email && profileSettings.email !== savedEmail && (
              <div style={{ marginTop: "6px", fontSize: "11px", color: "#f59e0b" }}>
                E-posta adresini doğrulamak için önce profili kaydedin.
              </div>
            )}

            {profileSettings.email && profileSettings.email === savedEmail && !profileSettings.emailVerified && (
              <div style={{
                marginTop: "12px",
                padding: "16px",
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid rgba(255, 255, 255, 0.05)",
                borderRadius: "8px",
                display: "flex",
                flexDirection: "column",
                gap: "12px"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.7)" }}>
                    E-posta adresinizi doğrulamak için bir doğrulama kodu gönderin.
                  </span>
                  {!verificationSent && (
                    <Button
                      type="primary"
                      onClick={() => { void handleSendVerificationCode(); }}
                      loading={isSendingCode}
                      style={{
                        background: "#f59e0b",
                        borderColor: "#f59e0b",
                        color: "#000000",
                        fontWeight: "600",
                        borderRadius: "6px",
                        height: "32px",
                        fontSize: "12px",
                      }}
                    >
                      Doğrulama Kodu Gönder
                    </Button>
                  )}
                </div>

                {verificationSent && (
                  <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                    <Input
                      placeholder="000000"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.trim())}
                      maxLength={6}
                      style={{
                        width: "120px",
                        textAlign: "center",
                        letterSpacing: "4px",
                        fontWeight: "bold",
                        background: "rgba(15, 15, 15, 0.8)",
                        borderColor: "rgba(255, 255, 255, 0.08)",
                        color: "#ffffff",
                        height: "40px",
                      }}
                    />
                    <Button
                      type="primary"
                      onClick={() => { void handleVerifyEmailCode(); }}
                      loading={isVerifyingCode}
                      disabled={verificationCode.length !== 6}
                      style={{
                        background: "#10b981",
                        borderColor: "#10b981",
                        color: "#ffffff",
                        fontWeight: "600",
                        height: "40px",
                        borderRadius: "6px",
                      }}
                    >
                      Doğrula
                    </Button>
                    <Button
                      type="text"
                      onClick={() => { void handleSendVerificationCode(); }}
                      loading={isSendingCode}
                      style={{ color: "rgba(255,255,255,0.6)", fontSize: "12px" }}
                    >
                      Yeniden Gönder
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="ct-label" htmlFor="settings-profile-bio" style={{ display: "block", marginBottom: "6px", fontSize: "12px", color: "rgba(255,255,255,0.45)" }}>
              Hakkımda
            </label>
            <Input.TextArea
              id="settings-profile-bio"
              value={profileSettings.bio}
              onChange={(event) =>
                setProfileSettings((previous) => ({
                  ...previous,
                  bio: event.target.value,
                }))
              }
              maxLength={220}
              rows={4}
              disabled={isProfileLoading || isSavingProfile}
              style={{
                background: "rgba(15, 15, 15, 0.8)",
                borderColor: "rgba(255, 255, 255, 0.08)",
                color: "#f5f5f5",
                borderRadius: "6px",
              }}
            />
          </div>
        </div>

        <div className="ct-settings-info-grid" style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "16px",
          background: "rgba(255, 255, 255, 0.02)",
          border: "1px solid rgba(255, 255, 255, 0.04)",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "24px",
        }}>
          <div className="ct-settings-info-item" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span className="ct-settings-info-label" style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)" }}>Kullanıcı Adı</span>
            <strong className="ct-settings-info-value" style={{ fontSize: "14px", color: "#ffffff", fontWeight: "600" }}>
              @{currentUsername}
            </strong>
          </div>
          <div className="ct-settings-info-item" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span className="ct-settings-info-label" style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)" }}>Rol</span>
            <strong className="ct-settings-info-value" style={{ fontSize: "14px", color: "#ffffff", fontWeight: "600" }}>Yönetici</strong>
          </div>
        </div>

        <div className="ct-settings-actions" style={{ display: "flex", gap: "12px" }}>
          {onLogout && (
            <Button
              danger
              type="primary"
              icon={<LogoutOutlined />}
              onClick={onLogout}
              loading={isLoggingOut}
              disabled={isLoggingOut}
              style={{
                background: "#ef4444",
                borderColor: "#ef4444",
                color: "#ffffff",
                fontWeight: "600",
                height: "40px",
                borderRadius: "6px",
                boxShadow: "0 4px 12px rgba(239, 68, 68, 0.2)",
                marginLeft: "auto",
              }}
            >
              Hesaptan Çık
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
