import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Input, Button, Avatar, message } from "antd";
import {
  UserOutlined,
  UploadOutlined,
  DeleteOutlined,
  SaveOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import { authService } from "@/features/auth";

interface ProfileSettings {
  displayName: string;
  email: string;
  emailVerified: boolean;
  bio: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
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

// A GIF is the one format that can be animated, and there is no way to re-encode
// one in a canvas without flattening it to a single frame. So a GIF skips the
// downscale below and is sent exactly as it came off disk — which means what is
// stored IS what every read of it moves, and it needs a much tighter ceiling
// than a picture that gets shrunk to 256px on the way. Matches maxAnimatedBytes
// on the server.
const MAX_ANIMATED_FILE_BYTES = 1024 * 1024;

const SUPPORTED_AVATAR_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const isAnimatableType = (mimeType: string): boolean => mimeType === "image/gif";

/**
 * Validates a chosen file and turns it into the data URL that will be sent.
 *
 * The GIF branch is the whole reason this exists as one function: an animated
 * GIF put through the canvas below comes back as a single still frame, with no
 * error anywhere to say the animation was thrown away. So a GIF is passed
 * through untouched and bounded by a tighter file size instead.
 */
const prepareImageUpload = async (
  file: File,
  maxDimension: number,
): Promise<string> => {
  if (!SUPPORTED_AVATAR_MIME_TYPES.has(file.type)) {
    throw new Error("Desteklenen formatlar: PNG, JPG, WEBP veya GIF.");
  }

  const animated = isAnimatableType(file.type);
  const ceiling = animated ? MAX_ANIMATED_FILE_BYTES : MAX_AVATAR_FILE_BYTES;
  if (file.size > ceiling) {
    throw new Error(
      animated
        ? `Hareketli görsel en fazla ${MAX_ANIMATED_FILE_BYTES / (1024 * 1024)} MB olabilir.`
        : `Görsel en fazla ${MAX_AVATAR_FILE_BYTES / (1024 * 1024)} MB olabilir.`,
    );
  }

  const dataUrl = await readFileAsDataURL(file);
  return animated ? dataUrl : downscaleImageDataURL(dataUrl, maxDimension);
};

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

// The largest an avatar is ever drawn is the profile card and its enlarged
// preview. Matches the server's own bound, which re-encodes anything above it.
const AVATAR_MAX_DIMENSION = 256;

// A banner is a strip across the top of the profile card rather than a face in a
// circle, so it is allowed to be several hundred pixels wide. Matches
// bannerMaxDimension on the server.
const BANNER_MAX_DIMENSION = 1024;

/**
 * Downscales the chosen picture before it is sent.
 *
 * The file used to go up exactly as it came off disk, so a photo from a phone was
 * stored at full camera resolution inside the user row — and that row is read by
 * the friends directory, by every lobby roster, and by the admin user table,
 * which renders it as a 32-pixel circle. A page of ten users was tens of
 * megabytes of JSON.
 *
 * The server normalises anything that gets past this anyway; doing it here as
 * well is what keeps the several megabytes off the wire in the first place.
 */
const downscaleImageDataURL = async (
  dataUrl: string,
  maxDimension: number,
): Promise<string> => {
  const image = document.createElement("img");
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Görsel çözümlenemedi"));
  });
  image.src = dataUrl;
  await loaded;

  const { naturalWidth: width, naturalHeight: height } = image;
  if (!width || !height) {
    return dataUrl;
  }
  if (width <= maxDimension && height <= maxDimension) {
    return dataUrl;
  }

  const scale = maxDimension / Math.max(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const context = canvas.getContext("2d");
  if (!context) {
    return dataUrl;
  }

  // JPEG has no alpha, so a transparent PNG would encode its transparent pixels
  // as black. Every surface clips the avatar to a circle, which hides white
  // corners and would not hide black ones.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const encoded = canvas.toDataURL("image/jpeg", 0.82);
  // An already-efficient picture can come out larger; keeping the original is
  // then both smaller and lossless.
  return encoded.length < dataUrl.length ? encoded : dataUrl;
};

export function SettingsProfile({
  currentUsername,
  onLogout,
  isLoggingOut,
}: ProfileSettingsProps) {
  const queryClient = useQueryClient();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const [messageApi, contextHolder] = message.useMessage();

  const [profileSettings, setProfileSettings] = useState<ProfileSettings>({
    displayName: currentUsername,
    email: "",
    emailVerified: false,
    bio: "",
    avatarUrl: null,
    bannerUrl: null,
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
            bannerUrl: null,
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
          bannerUrl: profile.bannerUrl ?? null,
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
          bannerUrl: null,
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
    // messageApi is stable (antd memoises it); currentUsername is what this
    // actually reacts to.
  }, [currentUsername, messageApi]);

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
        bannerUrl: profileSettings.bannerUrl,
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
          bannerUrl: profile.bannerUrl ?? null,
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

  const handleImageSelect = async (
    event: ChangeEvent<HTMLInputElement>,
    field: "avatarUrl" | "bannerUrl",
  ): Promise<void> => {
    const file = event.target.files?.[0];
    // Cleared immediately so picking the same file twice still fires a change.
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const dataURL = await prepareImageUpload(
        file,
        field === "avatarUrl" ? AVATAR_MAX_DIMENSION : BANNER_MAX_DIMENSION,
      );
      setProfileSettings((previous) => ({ ...previous, [field]: dataURL }));
      messageApi.info("Seçildi. Kaydet'e basarak profiline uygula.");
    } catch (error) {
      messageApi.warning(
        error instanceof Error ? error.message : "Görsel okunamadı",
      );
    }
  };

  const handleImageClear = (field: "avatarUrl" | "bannerUrl"): void => {
    setProfileSettings((previous) => ({ ...previous, [field]: null }));
    messageApi.info("Kaldırıldı. Kaydet'e basarak değişikliği uygula.");
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

          {/* Banner first, avatar second: that is the order they stack on the
              profile card, so the preview here reads as the card it produces. */}
          <div className="ct-settings-banner-preview">
            {profileSettings.bannerUrl ? (
              <img src={profileSettings.bannerUrl} alt="" />
            ) : (
              <span>Afiş seçilmedi</span>
            )}
          </div>

          <div className="ct-settings-profile-avatar-row">
            <input
              ref={bannerInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(event) => {
                void handleImageSelect(event, "bannerUrl");
              }}
              hidden
            />

            <div className="ct-settings-profile-avatar-actions">
              <div className="ct-settings-profile-avatar-buttons">
                <Button
                  type="text"
                  icon={<UploadOutlined />}
                  onClick={() => bannerInputRef.current?.click()}
                  disabled={isProfileLoading || isSavingProfile}
                >
                  Afiş Yükle
                </Button>

                {profileSettings.bannerUrl && (
                  <Button
                    danger
                    type="text"
                    icon={<DeleteOutlined />}
                    onClick={() => handleImageClear("bannerUrl")}
                    disabled={isProfileLoading || isSavingProfile}
                  >
                    Afişi Kaldır
                  </Button>
                )}
              </div>

              <small>
                Profil kartının üst şeridi · PNG/JPG/WEBP · Hareketli GIF en
                fazla 1 MB
              </small>
            </div>
          </div>

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
                  void handleImageSelect(event, "avatarUrl");
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
                  Profil Resmi Yükle
                </Button>

                {profileSettings.avatarUrl && (
                  <Button
                    danger
                    type="text"
                    icon={<DeleteOutlined />}
                    onClick={() => handleImageClear("avatarUrl")}
                    disabled={isProfileLoading || isSavingProfile}
                  >
                    Kaldır
                  </Button>
                )}
              </div>

              <small>
                PNG/JPG/WEBP en fazla 5 MB · Hareketli GIF en fazla 1 MB
              </small>
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
