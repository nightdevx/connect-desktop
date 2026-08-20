import { toErrorMessage } from "@shared/error-message";
import { useCallback, useEffect, useState } from "react";
import { InputNumber, Spin, Switch, message } from "antd";
import { LockOutlined, TeamOutlined } from "@ant-design/icons";
import adminService from "../services/admin-service";
import type { AdminRuntimeSettings, AdminRuntimeSettingsPatch } from "@shared/auth-contracts";
import { AdminPageHeader, AdminSection } from "./admin-primitives";

/**
 * Operator settings that take effect immediately.
 *
 * Every one of these was a compile-time constant or an environment variable read
 * once at boot, so "close registration, we are being raided" or "these rooms are
 * too small tonight" meant an edit, a build and a restart — which drops everyone
 * in a voice room to change a number.
 *
 * Saved per field on change rather than behind a Save button. These are single
 * values with immediate consequences, not a form: an admin closing registration
 * wants it closed now, and a switch that silently needed a second click is the
 * failure mode that matters here.
 */
export default function AdminSettings() {
  const [settings, setSettings] = useState<AdminRuntimeSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      setSettings(await adminService.getSettings());
    } catch (error) {
      message.error(toErrorMessage(error, "Ayarlar yüklenemedi"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const apply = async (patch: AdminRuntimeSettingsPatch): Promise<void> => {
    setSaving(true);
    try {
      // The response is the whole set, and it is what gets rendered — the server
      // clamps out-of-range values, so echoing the number that was typed would
      // show a limit that is not the one in force.
      setSettings(await adminService.updateSettings(patch));
      message.success("Ayar uygulandı.");
    } catch (error) {
      message.error(toErrorMessage(error, "Ayar kaydedilemedi"));
      await load();
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return (
      <div className="ct-admin-page">
        <div className="ct-admin-center-state">
          <Spin />
          <span>Ayarlar yükleniyor…</span>
        </div>
      </div>
    );
  }

  return (
    // The same page scaffold and the same section chrome as the other six
    // screens. This page and the moderation one used to ask for
    // .ct-admin-section, which no stylesheet declared: no gap between the
    // header and the cards, no bottom padding, and -- since Tailwind's
    // preflight strips heading size -- a page title rendered at body size.
    //
    // The ROWS are still the settings ones (.ct-settings-row and friends), so
    // "a setting" is one shape in this app rather than four.
    <div className="ct-admin-page">
      <AdminPageHeader
        title="Sunucu Ayarları"
        description="Değişiklikler anında geçerli olur; sunucuyu yeniden başlatmak gerekmez."
      />

      <AdminSection title="Erişim" icon={<LockOutlined />} flush>
        <div className="ct-settings-card">
          <div className="ct-settings-row">
            <div className="ct-settings-row-text">
              <strong>Yeni Kayıtlara Açık</strong>
              <span>
                Kapatıldığında kayıt formu reddedilir. Mevcut hesaplar
                etkilenmez.
              </span>
            </div>
            <Switch
              checked={settings.registrationOpen}
              disabled={saving}
              onChange={(registrationOpen) => void apply({ registrationOpen })}
            />
          </div>
        </div>
      </AdminSection>

      <AdminSection title="Oda Limitleri" icon={<TeamOutlined />} flush>
        <div className="ct-settings-card">
          <div className="ct-settings-row">
            <div className="ct-settings-row-text">
              <strong>Oda Kapasitesi</strong>
              <span>
                Bir odadaki en fazla kişi. Değişiklik açık odalara da uygulanır;
                kimse atılmaz, sadece sonraki katılım reddedilir.
              </span>
            </div>
            <InputNumber
              min={2}
              max={100}
              value={settings.lobbyCapacity}
              disabled={saving}
              onChange={(value) =>
                typeof value === "number" && void apply({ lobbyCapacity: value })
              }
            />
          </div>

          <div className="ct-settings-row">
            <div className="ct-settings-row-text">
              <strong>Toplam Oda Sayısı</strong>
              <span>Sunucuda aynı anda var olabilecek oda sayısı.</span>
            </div>
            <InputNumber
              min={1}
              max={1000}
              value={settings.maxLobbies}
              disabled={saving}
              onChange={(value) =>
                typeof value === "number" && void apply({ maxLobbies: value })
              }
            />
          </div>

          <div className="ct-settings-row">
            <div className="ct-settings-row-text">
              <strong>Kullanıcı Başına Oda</strong>
              <span>
                Bir hesabın kurabileceği oda sayısı. Yöneticiler bu limitten
                muaf.
              </span>
            </div>
            <InputNumber
              min={1}
              max={200}
              value={settings.maxLobbiesPerUser}
              disabled={saving}
              onChange={(value) =>
                typeof value === "number" &&
                void apply({ maxLobbiesPerUser: value })
              }
            />
          </div>
        </div>
      </AdminSection>
    </div>
  );
}
