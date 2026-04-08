import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
        reject(new Error("Dosya okunamadi"));
        return;
      }

      resolve(reader.result);
    };

    reader.onerror = () => {
      reject(new Error("Dosya okunamadi"));
    };

    reader.readAsDataURL(file);
  });
};

export function SettingsProfile({ currentUsername }: ProfileSettingsProps) {
  const queryClient = useQueryClient();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const [profileSettings, setProfileSettings] = useState<ProfileSettings>({
    displayName: currentUsername,
    bio: "",
    avatarUrl: null,
  });

  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    setProfileNotice("");
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
            setProfileNotice(
              `Profil bilgisi alinamadi: ${result.error?.message ?? "Bilinmeyen hata"}`,
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
        setProfileNotice(
          `Profil bilgisi alinamadi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
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
    setProfileNotice("");

    const normalizedDisplayName = profileSettings.displayName.trim();
    if (normalizedDisplayName.length < 3) {
      setProfileNotice("Gorunen ad en az 3 karakter olmali.");
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
        setProfileNotice(
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
      setProfileNotice("Profil ayarlari kaydedildi.");
    } catch (error) {
      setProfileNotice(
        `Profil kaydedilemedi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
      );
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleResetProfile = async (): Promise<void> => {
    setProfileNotice("");
    setIsSavingProfile(true);
    try {
      const result = await authService.updateProfile({
        displayName: currentUsername,
        email: null,
        bio: null,
        avatarUrl: null,
      });

      if (!result.ok || !result.data?.profile) {
        setProfileNotice(
          `Profil sifirlanamadi: ${result.error?.message ?? "Bilinmeyen hata"}`,
        );
        return;
      }

      setProfileSettings({
        displayName: result.data.profile.displayName,
        bio: result.data.profile.bio ?? "",
        avatarUrl: result.data.profile.avatarUrl ?? null,
      });
      await queryClient.invalidateQueries({ queryKey: ["workspace-users"] });
      setProfileNotice("Profil ayarlari varsayilana donduruldu.");
    } catch (error) {
      setProfileNotice(
        `Profil sifirlanamadi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
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
      setProfileNotice("Desteklenen formatlar: PNG, JPG, WEBP veya GIF.");
      return;
    }

    if (file.size > MAX_AVATAR_FILE_BYTES) {
      setProfileNotice("Logo boyutu en fazla 512 KB olabilir.");
      return;
    }

    try {
      const dataURL = await readFileAsDataURL(file);
      setProfileSettings((previous) => ({
        ...previous,
        avatarUrl: dataURL,
      }));
      setProfileNotice("Logo secildi. Kaydet'e basarak profiline uygula.");
    } catch (error) {
      setProfileNotice(
        `Logo okunamadi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
      );
    }
  };

  const handleAvatarClear = (): void => {
    setProfileSettings((previous) => ({
      ...previous,
      avatarUrl: null,
    }));
    setProfileNotice("Logo kaldirildi. Kaydet'e basarak degisikligi uygula.");
  };

  return (
    <div className="ct-settings-section">
      <div className="ct-settings-section-header">
        <div className="ct-settings-section-header-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <div>
          <h4>Profil Ayarlari</h4>
          <p className="ct-settings-section-description">Hesap görünüm bilgilerini buradan yönetebilirsin.</p>
        </div>
      </div>

      <div className="ct-settings-content">
        <div className="ct-settings-profile-avatar-row">
          <div className="ct-settings-profile-avatar" aria-hidden="true">
            {profileSettings.avatarUrl ? (
              <img src={profileSettings.avatarUrl} alt="" />
            ) : (
              <span>
                {getInitials(profileSettings.displayName || currentUsername)}
              </span>
            )}
          </div>

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

            <div className="ct-action-row mt-0">
              <button
                type="button"
                className="ct-btn-secondary ct-btn-sm"
                onClick={() => avatarInputRef.current?.click()}
                disabled={isProfileLoading || isSavingProfile}
              >
                Logo Yukle
              </button>

              {profileSettings.avatarUrl && (
                <button
                  type="button"
                  className="ct-btn-secondary ct-btn-sm"
                  onClick={handleAvatarClear}
                  disabled={isProfileLoading || isSavingProfile}
                >
                  Logoyu Kaldir
                </button>
              )}
            </div>

            <small>PNG/JPG/WEBP/GIF - En fazla 512 KB</small>
          </div>
        </div>

        <div className="ct-settings-grid">
          <label className="ct-label" htmlFor="settings-display-name">
            Görünen Ad
            <input
              id="settings-display-name"
              className="ct-input"
              type="text"
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
          </label>

          <label className="ct-label" htmlFor="settings-profile-bio">
            Hakkımda
            <textarea
              id="settings-profile-bio"
              className="ct-input ct-textarea"
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
          </label>
        </div>

        <div className="ct-settings-info-grid">
          <div className="ct-settings-info-item">
            <span className="ct-settings-info-label">Kullanıcı Adı</span>
            <strong className="ct-settings-info-value">@{currentUsername}</strong>
          </div>
          <div className="ct-settings-info-item">
            <span className="ct-settings-info-label">Rol</span>
            <strong className="ct-settings-info-value">Yönetici</strong>
          </div>
        </div>

        <div className="ct-settings-actions">
          <button
            type="button"
            className="ct-btn-primary"
            onClick={() => {
              void handleSaveProfile();
            }}
            disabled={isProfileLoading || isSavingProfile}
          >
            {isSavingProfile ? "Kaydediliyor..." : "Profili Kaydet"}
          </button>
          <button
            type="button"
            className="ct-btn-secondary"
            onClick={() => {
              void handleResetProfile();
            }}
            disabled={isProfileLoading || isSavingProfile}
          >
            Varsayılana Dön
          </button>
        </div>

        {profileNotice && (
          <p className="ct-settings-notice">{profileNotice}</p>
        )}
      </div>
    </div>
  );
}
