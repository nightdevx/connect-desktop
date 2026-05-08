import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Input, Button, Avatar, message } from "antd";
import {
  UserOutlined,
  UploadOutlined,
  DeleteOutlined,
  SaveOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { authService } from "../../../../services/auth-service";

interface ProfileSettings {
  displayName: string;
  bio: string;
  avatarUrl: string | null;
}

interface ProfileSettingsProps {
  currentUsername: string;
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

export function SettingsProfile({ currentUsername }: ProfileSettingsProps) {
  const queryClient = useQueryClient();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [messageApi, contextHolder] = message.useMessage();

  const [profileSettings, setProfileSettings] = useState<ProfileSettings>({
    displayName: currentUsername,
    bio: "",
    avatarUrl: null,
  });

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
            bio: "",
            avatarUrl: null,
          });

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
          bio: profile.bio ?? "",
          avatarUrl: profile.avatarUrl ?? null,
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setProfileSettings({
          displayName: currentUsername,
          bio: "",
          avatarUrl: null,
        });
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
        email: null,
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
        bio: profile.bio ?? "",
        avatarUrl: profile.avatarUrl ?? null,
      });
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

      setProfileSettings({
        displayName: result.data.profile.displayName,
        bio: result.data.profile.bio ?? "",
        avatarUrl: result.data.profile.avatarUrl ?? null,
      });
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
      <div className="ct-settings-section-header">
        <div className="ct-settings-section-header-icon">
          <UserOutlined style={{ fontSize: "20px" }} />
        </div>
        <div>
          <h4>Profil Ayarları</h4>
          <p className="ct-settings-section-description">
            Hesap görünüm bilgilerini buradan yönetebilirsin.
          </p>
        </div>
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
          <Button
            type="text"
            icon={<ReloadOutlined />}
            onClick={() => {
              void handleResetProfile();
            }}
            disabled={isProfileLoading || isSavingProfile}
            style={{
              background: (isProfileLoading || isSavingProfile) ? "rgba(255, 255, 255, 0.02)" : "rgba(255, 255, 255, 0.05)",
              color: (isProfileLoading || isSavingProfile) ? "rgba(255, 255, 255, 0.25)" : "#ffffff",
              height: "40px",
              borderRadius: "6px",
            }}
          >
            Varsayılana Dön
          </Button>
        </div>
      </div>
    </div>
  );
}
