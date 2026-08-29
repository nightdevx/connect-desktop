import { toErrorMessage } from "@shared/error-message";
import { useCallback, useEffect, useState } from "react";
import { Input, InputNumber, Spin, Switch, message } from "antd";
import { LockOutlined, MessageOutlined, TeamOutlined, ToolOutlined } from "@ant-design/icons";
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

      <AdminSection title="Bakım" icon={<ToolOutlined />} flush>
        <div className="ct-settings-card">
          <div className="ct-settings-row">
            <div className="ct-settings-row-text">
              <strong>Bakım Modu</strong>
              <span>
                Açıkken yöneticiler dışında kimse giremez; giriş, çıkış ve
                yenileme açık kalır.
              </span>
            </div>
            <Switch
              checked={settings.maintenanceMode}
              disabled={saving}
              onChange={(maintenanceMode) => void apply({ maintenanceMode })}
            />
          </div>

          <div className="ct-settings-row">
            <div className="ct-settings-row-text">
              <strong>Bakım Mesajı</strong>
              <span>Bakım modundayken kullanıcıya gösterilen açıklama.</span>
            </div>
            <Input
              defaultValue={settings.maintenanceMessage}
              maxLength={280}
              disabled={saving}
              onBlur={(event) => {
                const value = event.target.value.trim();
                if (value && value !== settings.maintenanceMessage) {
                  void apply({ maintenanceMessage: value });
                }
              }}
              style={{ maxWidth: 320 }}
            />
          </div>

          <div className="ct-settings-row">
            <div className="ct-settings-row-text">
              <strong>Salt Okunur Mod</strong>
              <span>
                Açıkken yöneticiler dışında hiçbir yazma işlemi kabul edilmez;
                okuma serbesttir.
              </span>
            </div>
            <Switch
              checked={settings.readOnly}
              disabled={saving}
              onChange={(readOnly) => void apply({ readOnly })}
            />
          </div>
        </div>
      </AdminSection>

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

          <div className="ct-settings-row">
            <div className="ct-settings-row-text">
              <strong>Yalnızca Davetle</strong>
              <span>
                Açıkken kayıt için geçerli bir davet kodu gerekir. Kodlar Erişim
                Denetimi ekranından yönetilir.
              </span>
            </div>
            <Switch
              checked={settings.inviteOnly}
              disabled={saving}
              onChange={(inviteOnly) => void apply({ inviteOnly })}
            />
          </div>

          <div className="ct-settings-row">
            <div className="ct-settings-row-text">
              <strong>İzinli E-posta Alan Adları</strong>
              <span>
                Virgülle ayır. Boş bırakılırsa her alan adı kabul edilir.
              </span>
            </div>
            <Input
              defaultValue={settings.emailDomains.join(", ")}
              placeholder="ornek.com, sirket.com.tr"
              disabled={saving}
              onBlur={(event) => {
                const next = event.target.value
                  .split(",")
                  .map((part) => part.trim().toLowerCase())
                  .filter(Boolean);
                if (next.join(",") !== settings.emailDomains.join(",")) {
                  void apply({ emailDomains: next });
                }
              }}
              style={{ maxWidth: 320 }}
            />
          </div>
        </div>
      </AdminSection>

      <AdminSection title="Sohbet ve Müzik" icon={<MessageOutlined />} flush>
        <div className="ct-settings-card">
          <div className="ct-settings-row">
            <div className="ct-settings-row-text">
              <strong>Mesaj Saklama Süresi</strong>
              <span>Gün cinsinden. 0 = süresiz sakla.</span>
            </div>
            <InputNumber
              min={0}
              max={3650}
              value={settings.chatRetentionDays}
              disabled={saving}
              onChange={(value) =>
                typeof value === "number" && void apply({ chatRetentionDays: value })
              }
            />
          </div>

          <div className="ct-settings-row">
            <div className="ct-settings-row-text">
              <strong>Kişi Başına Kuyruk</strong>
              <span>Bir kullanıcının müzik kuyruğuna aynı anda ekleyebileceği parça sayısı.</span>
            </div>
            <InputNumber
              min={1}
              max={500}
              value={settings.maxQueuePerUser}
              disabled={saving}
              onChange={(value) =>
                typeof value === "number" && void apply({ maxQueuePerUser: value })
              }
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
