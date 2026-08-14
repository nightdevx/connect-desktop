import { useEffect, useState } from "react";
import { Button, Select, Switch, message } from "antd";
import { EyeInvisibleOutlined, SaveOutlined } from "@ant-design/icons";
import type {
  PrivacySettings,
  UpdatePrivacyRequest,
} from "@shared/auth-contracts";
import { authService } from "../../../auth";
import { userService } from "../../services";

// Mirrors the backend column defaults, so an account created before privacy
// existed shows what it actually does: reachable by everyone.
const DEFAULT_PRIVACY: PrivacySettings = {
  allowDirectMessagesFrom: "everyone",
  allowCallsFrom: "everyone",
  allowFriendRequests: true,
};

const AUDIENCE_OPTIONS = [
  { value: "everyone", label: "Herkes" },
  { value: "friends", label: "Sadece arkadaşlarım" },
];

export function SettingsPrivacy() {
  const [messageApi, contextHolder] = message.useMessage();
  // Two copies: `saved` is what the server last told us, `draft` is what the
  // user sees. The diff between them is the PATCH body.
  const [saved, setSaved] = useState<PrivacySettings>(DEFAULT_PRIVACY);
  const [draft, setDraft] = useState<PrivacySettings>(DEFAULT_PRIVACY);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    // Privacy rides along on the profile payload, so the tab costs no extra
    // round trip; writes still go to the dedicated PATCH /auth/privacy.
    void authService
      .getProfile()
      .then((result) => {
        if (cancelled) {
          return;
        }

        if (!result.ok) {
          messageApi.error(
            `Gizlilik ayarları alınamadı: ${result.error?.message ?? "Bilinmeyen hata"}`,
          );
          return;
        }

        const privacy = result.data?.profile?.privacy ?? DEFAULT_PRIVACY;
        setSaved(privacy);
        setDraft(privacy);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [messageApi]);

  const handleSavePrivacy = async (): Promise<void> => {
    // Omitted means "leave unchanged", so send only the fields the user
    // actually touched.
    const payload: UpdatePrivacyRequest = {};
    if (draft.allowDirectMessagesFrom !== saved.allowDirectMessagesFrom) {
      payload.allowDirectMessagesFrom = draft.allowDirectMessagesFrom;
    }
    if (draft.allowCallsFrom !== saved.allowCallsFrom) {
      payload.allowCallsFrom = draft.allowCallsFrom;
    }
    if (draft.allowFriendRequests !== saved.allowFriendRequests) {
      payload.allowFriendRequests = draft.allowFriendRequests;
    }

    setIsSaving(true);
    try {
      const result = await userService.updatePrivacySettings(payload);

      if (!result.ok || !result.data?.privacy) {
        messageApi.error(
          `Gizlilik ayarları kaydedilemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
        );
        return;
      }

      setSaved(result.data.privacy);
      setDraft(result.data.privacy);
      messageApi.success("Gizlilik ayarları kaydedildi.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="ct-settings-section">
      {contextHolder}
      <div className="ct-settings-section-header">
        <div className="ct-settings-section-header-main">
          <div className="ct-settings-section-header-icon">
            <EyeInvisibleOutlined />
          </div>
          <div>
            <h4>Gizlilik Ayarları</h4>
            <p className="ct-settings-section-description">
            Sana kimlerin mesaj gönderebileceğini, seni kimlerin arayabileceğini
            ve arkadaşlık isteği alıp almayacağını buradan belirleyebilirsin.
            </p>
          </div>
        </div>
      </div>

      <div className="ct-settings-content">
        <div className="ct-settings-two-col">
          <div>
            <label className="ct-field-label" htmlFor="settings-allow-dm-from">
              Bana kim mesaj gönderebilir?
            </label>
            <Select
              id="settings-allow-dm-from"
              value={draft.allowDirectMessagesFrom}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  allowDirectMessagesFrom: value,
                }))
              }
              options={AUDIENCE_OPTIONS}
              disabled={isLoading}
              className="ct-block-control"
            />
          </div>

          <div>
            <label className="ct-field-label" htmlFor="settings-allow-calls-from">
              Beni kim arayabilir?
            </label>
            <Select
              id="settings-allow-calls-from"
              value={draft.allowCallsFrom}
              onChange={(value) =>
                setDraft((current) => ({ ...current, allowCallsFrom: value }))
              }
              options={AUDIENCE_OPTIONS}
              disabled={isLoading}
              className="ct-block-control"
            />
          </div>
        </div>

        <div>
          <label
            className="ct-field-label"
            htmlFor="settings-allow-friend-requests"
          >
            Arkadaşlık isteği alayım
          </label>
          <Switch
            id="settings-allow-friend-requests"
            checked={draft.allowFriendRequests}
            onChange={(checked) =>
              setDraft((current) => ({
                ...current,
                allowFriendRequests: checked,
              }))
            }
            disabled={isLoading}
          />
        </div>

        <div className="ct-settings-actions">
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={() => {
              void handleSavePrivacy();
            }}
            loading={isSaving}
            disabled={isLoading || isSaving}
          >
            Gizlilik Ayarlarını Kaydet
          </Button>
        </div>
      </div>
    </div>
  );
}
