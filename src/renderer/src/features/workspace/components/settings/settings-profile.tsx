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

// 5 MB. The image is stored and transmitted as a base64 data URL, so it costs
// ~6.7 MB on the wire; the backend's own limit (maxAvatarDataURLLength) is set
// to match, and the /auth/profile route carries a 10 MiB body cap for it.
const MAX_AVATAR_FILE_BYTES = 5 * 1024 * 1024;
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
      messageApi.warning("Profil resmi en fazla 5 MB olabilir.");
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
      <div className="ct-settings-section-header">
        <div className="ct-settings-section-header-main">
          <div className="ct-settings-section-header-icon">
            <UserOutlined />
          </div>
          <div>
            <h4>Profil Ayarları</h4>
            <p className="ct-settings-section-description">
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
        >
          Profili Kaydet
        </Button>
      </div>

      <div className="ct-settings-content">
        <div className="ct-settings-subsection">
          <h5>Görünüm</h5>

          <div className="ct-settings-profile-avatar-row">
            <Avatar
              size={80}
              src={profileSettings.avatarUrl}
              icon={!profileSettings.avatarUrl && <UserOutlined />}
              className="ct-settings-profile-avatar"
            >
              {!profileSettings.avatarUrl &&
                getInitials(profileSettings.displayName || currentUsername)}
            </Avatar>

            <div className="ct-settings-profile-avatar-actions">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(event) => {
                  void handleAvatarSelect(event);
                }}
                hidden
              />

              <div className="ct-settings-profile-avatar-buttons">
                <Button
                  type="text"
                  icon={<UploadOutlined />}
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={isProfileLoading || isSavingProfile}
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
                  >
                    Logoyu Kaldır
                  </Button>
                )}
              </div>

              <small>PNG/JPG/WEBP/GIF - En fazla 5 MB</small>
            </div>
          </div>

          <div className="ct-settings-grid">
            <div>
              <label className="ct-field-label" htmlFor="settings-display-name">
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
              />
            </div>

            <div>
              <label className="ct-field-label" htmlFor="settings-profile-bio">
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
              />
            </div>
          </div>
        </div>

        {/* Its own block: the address, its verification state and the OTP
            exchange are one flow, and inline in the name/bio grid the code
            panel read as a third profile field. */}
        <div className="ct-settings-subsection">
          <h5>E-posta</h5>

          <div>
            <div>
              <label className="ct-field-label" htmlFor="settings-email">
                E-posta Adresi
              </label>
              {profileSettings.email ? (
                profileSettings.emailVerified ? (
                  <span className="ct-status-chip ok">Doğrulanmış</span>
                ) : (
                  <span className="ct-status-chip warn">Doğrulanmamış</span>
                )
              ) : (
                <span className="ct-status-chip danger">E-posta Yok</span>
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
            />

            {profileSettings.email && profileSettings.email !== savedEmail && (
              <div className="ct-inline-note">
                E-posta adresini doğrulamak için önce profili kaydedin.
              </div>
            )}

            {profileSettings.email &&
              profileSettings.email === savedEmail &&
              !profileSettings.emailVerified && (
                <div className="ct-inset-panel">
                  <div className="ct-inset-panel-row">
                    <span>
                      E-posta adresinizi doğrulamak için bir doğrulama kodu
                      gönderin.
                    </span>
                    {!verificationSent && (
                      <Button
                        type="primary"
                        onClick={() => {
                          void handleSendVerificationCode();
                        }}
                        loading={isSendingCode}
                      >
                        Doğrulama Kodu Gönder
                      </Button>
                    )}
                  </div>

                  {verificationSent && (
                    <div className="ct-inset-panel-row">
                      <Input
                        placeholder="000000"
                        value={verificationCode}
                        onChange={(e) =>
                          setVerificationCode(e.target.value.trim())
                        }
                        maxLength={6}
                        className="ct-code-input"
                      />
                      <Button
                        type="primary"
                        onClick={() => {
                          void handleVerifyEmailCode();
                        }}
                        loading={isVerifyingCode}
                        disabled={verificationCode.length !== 6}
                      >
                        Doğrula
                      </Button>
                      <Button
                        type="text"
                        onClick={() => {
                          void handleSendVerificationCode();
                        }}
                        loading={isSendingCode}
                      >
                        Yeniden Gönder
                      </Button>
                    </div>
                  )}
                </div>
              )}
          </div>
        </div>

        <div className="ct-settings-subsection">
          <h5>Hesap</h5>

          <div className="ct-settings-info-grid">
            <div className="ct-settings-info-item">
              <span className="ct-settings-info-label">Kullanıcı Adı</span>
              <strong className="ct-settings-info-value">
                @{currentUsername}
              </strong>
            </div>
            <div className="ct-settings-info-item">
              <span className="ct-settings-info-label">Rol</span>
              <strong className="ct-settings-info-value">Yönetici</strong>
            </div>
          </div>

          {onLogout && (
            <div className="ct-settings-actions">
              <Button
                danger
                type="primary"
                icon={<LogoutOutlined />}
                onClick={onLogout}
                loading={isLoggingOut}
                disabled={isLoggingOut}
              >
                Hesaptan Çık
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
