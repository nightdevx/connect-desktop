import { useEffect, useState } from "react";
import { Button, Select, Switch, Tag } from "antd";
import {
  MessageOutlined,
  PhoneOutlined,
  SaveOutlined,
  StopOutlined,
  TrophyOutlined,
  UserAddOutlined,
} from "@ant-design/icons";
import type {
  PrivacySettings,
  UpdatePrivacyRequest,
} from "@shared/auth-contracts";
import { authService } from "@/features/auth";
import { userService } from "../../services";
import { useBlockedUsers } from "../../hooks";
import { useDesktopAppPreferences } from "./settings-app-preferences";
import { getDisplayInitials, hueStyle } from "../../workspace-utils";
import { SettingsGroup, SettingsPage, SettingsRow } from "./settings-layout";
import { toast } from "@/services/toast";

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
  // Two copies: `saved` is what the server last told us, `draft` is what the
  // user sees. The diff between them is the PATCH body.
  const [saved, setSaved] = useState<PrivacySettings>(DEFAULT_PRIVACY);
  const [draft, setDraft] = useState<PrivacySettings>(DEFAULT_PRIVACY);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // ponytail: a second instance of the hook — WorkspaceShell holds its own, and
  // it stays stale until relaunch after an unblock here, so the conversation
  // toggle can lag. Thread the shell's controller down if that shows up.
  const { blockedUsers, unblockUser } = useBlockedUsers(true);
  // The hook's isUpdating is one boolean for the whole list, so two rows would
  // share a spinner and the first unblock to finish would clear both.
  const [unblockingIds, setUnblockingIds] = useState<string[]>([]);
  const {
    preferences: appPreferences,
    isSaving: isSavingAppPreference,
    savePreference,
  } = useDesktopAppPreferences();

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
          toast.error(
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
  }, []);

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
        toast.error(
          `Gizlilik ayarları kaydedilemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
        );
        return;
      }

      setSaved(result.data.privacy);
      setDraft(result.data.privacy);
      toast.success("Gizlilik ayarları kaydedildi.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUnblock = async (userId: string): Promise<void> => {
    setUnblockingIds((previous) => [...previous, userId]);
    try {
      if (await unblockUser(userId)) {
        toast.success("Engel kaldırıldı.");
        return;
      }

      toast.error("Engel kaldırılamadı.");
    } finally {
      setUnblockingIds((previous) => previous.filter((id) => id !== userId));
    }
  };

  const isDirty =
    draft.allowDirectMessagesFrom !== saved.allowDirectMessagesFrom ||
    draft.allowCallsFrom !== saved.allowCallsFrom ||
    draft.allowFriendRequests !== saved.allowFriendRequests;

  return (
    <SettingsPage
      title="Gizlilik"
      description="Sana kimlerin mesaj gönderebileceğini, seni kimlerin arayabileceğini ve kimleri engellediğini buradan yönetebilirsin."
    >
      <SettingsGroup
        title="Sana kimler ulaşabilir"
        description="Hesabına kaydedilir; her cihazda geçerlidir."
        footerHint={isDirty ? "Kaydedilmemiş değişikliklerin var." : undefined}
        footer={
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={() => {
              void handleSavePrivacy();
            }}
            loading={isSaving}
            disabled={isLoading || isSaving || !isDirty}
          >
            Kaydet
          </Button>
        }
      >
        <SettingsRow
          icon={<MessageOutlined />}
          title="Özel mesajlar"
          description="Sana kimler özel mesaj gönderebilir."
          htmlFor="settings-allow-dm-from"
        >
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
            className="ct-settings-row-select"
          />
        </SettingsRow>

        <SettingsRow
          icon={<PhoneOutlined />}
          title="Aramalar"
          description="Seni kimler arayabilir."
          htmlFor="settings-allow-calls-from"
        >
          <Select
            id="settings-allow-calls-from"
            value={draft.allowCallsFrom}
            onChange={(value) =>
              setDraft((current) => ({ ...current, allowCallsFrom: value }))
            }
            options={AUDIENCE_OPTIONS}
            disabled={isLoading}
            className="ct-settings-row-select"
          />
        </SettingsRow>

        <SettingsRow
          icon={<UserAddOutlined />}
          title="Arkadaşlık istekleri"
          description="Kapalıyken kimse sana arkadaşlık isteği gönderemez; mevcut arkadaşlıkların etkilenmez."
        >
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
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Oyun etkinliği"
        description="Yalnızca bu bilgisayarda geçerlidir ve anında kaydedilir."
      >
        <SettingsRow
          icon={<TrophyOutlined />}
          title="Oynadığım oyun profilimde görünsün"
          description="Açıkken bilgisayarında çalışan tanınan oyunlar tespit edilir ve arkadaşlarının gördüğü profil kartında süresiyle birlikte görünür. Kapatınca tarama durur ve bilgi hemen silinir."
        >
          <Switch
            id="settings-share-game-activity"
            checked={appPreferences.shareGameActivity}
            onChange={(checked) => {
              void savePreference("shareGameActivity", checked);
            }}
            disabled={isSavingAppPreference}
          />
        </SettingsRow>
      </SettingsGroup>

      {/* The only other way back is a toggle inside an open conversation, and
          a blocked non-friend has no row anywhere to open one from. */}
      <SettingsGroup
        title="Engellenen kullanıcılar"
        description="Engellediğin kişiler sana mesaj gönderemez ve seni arayamaz."
        action={
          blockedUsers.length > 0 ? (
            <Tag className="ct-tag">{blockedUsers.length} kişi</Tag>
          ) : null
        }
      >
        {blockedUsers.length === 0 ? (
          <div className="ct-settings-empty">
            <StopOutlined />
            <strong>Engellediğin kimse yok</strong>
            <span>Bir kişiyi sohbetinden ya da profil kartından engelleyebilirsin.</span>
          </div>
        ) : (
          [...blockedUsers]
            .sort((a, b) => a.displayName.localeCompare(b.displayName, "tr"))
            .map((user) => (
              <div key={user.userId} className="ct-settings-row">
                <span
                  className="ct-settings-row-icon person ct-hued"
                  style={hueStyle(user.userId)}
                  aria-hidden="true"
                >
                  {getDisplayInitials(user.displayName || user.username)}
                </span>
                <div className="ct-settings-row-text">
                  <strong>{user.displayName}</strong>
                  <span>@{user.username}</span>
                </div>
                <Button
                  size="small"
                  onClick={() => {
                    void handleUnblock(user.userId);
                  }}
                  loading={unblockingIds.includes(user.userId)}
                >
                  Engeli kaldır
                </Button>
              </div>
            ))
        )}
      </SettingsGroup>
    </SettingsPage>
  );
}
