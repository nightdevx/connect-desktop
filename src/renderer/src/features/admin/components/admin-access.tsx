import { useCallback, useEffect, useState } from "react";
import { Button, Input, InputNumber, Segmented, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DeleteOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import type { AdminInviteCode, AdminIpBan } from "@shared/desktop-api-types";
import { toErrorMessage } from "@shared/error-message";
import { adminService } from "../services/admin-service";

type Pane = "ips" | "invites";

export default function AdminAccess() {
  const [pane, setPane] = useState<Pane>("ips");
  const [bans, setBans] = useState<AdminIpBan[]>([]);
  const [invites, setInvites] = useState<AdminInviteCode[]>([]);
  const [loading, setLoading] = useState(false);

  const [newCidr, setNewCidr] = useState("");
  const [newBanReason, setNewBanReason] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newMaxUses, setNewMaxUses] = useState<number | null>(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (pane === "ips") {
        const data = await adminService.unwrap(adminService.ops.listIpBans(), "IP yasakları yüklenemedi");
        setBans(data.bans);
      } else {
        const data = await adminService.unwrap(adminService.ops.listInvites(), "Davet kodları yüklenemedi");
        setInvites(data.invites);
      }
    } catch (error) {
      message.error(toErrorMessage(error, "Liste yüklenemedi"));
    } finally {
      setLoading(false);
    }
  }, [pane]);

  useEffect(() => {
    void load();
  }, [load]);

  const addBan = async (): Promise<void> => {
    if (newBanReason.trim().length < 3) {
      message.warning("Gerekçe en az 3 karakter olmalı.");
      return;
    }
    try {
      await adminService.unwrap(
        adminService.ops.banIp({ cidr: newCidr.trim(), reason: newBanReason.trim() }),
        "IP yasaklanamadı",
      );
      message.success("IP yasaklandı");
      setNewCidr("");
      setNewBanReason("");
      void load();
    } catch (error) {
      message.error(toErrorMessage(error, "IP yasaklanamadı"));
    }
  };

  const addInvite = async (): Promise<void> => {
    try {
      await adminService.unwrap(
        adminService.ops.createInvite({ code: newCode.trim(), maxUses: newMaxUses ?? 1 }),
        "Davet kodu oluşturulamadı",
      );
      message.success("Davet kodu oluşturuldu");
      setNewCode("");
      setNewMaxUses(1);
      void load();
    } catch (error) {
      message.error(toErrorMessage(error, "Davet kodu oluşturulamadı"));
    }
  };

  const banColumns: ColumnsType<AdminIpBan> = [
    { title: "Adres / blok", dataIndex: "cidr", width: 200 },
    { title: "Gerekçe", dataIndex: "reason", ellipsis: true },
    { title: "Ekleyen", dataIndex: "createdBy", width: 150 },
    {
      title: "Bitiş",
      dataIndex: "expiresAt",
      width: 170,
      render: (value: string | null) => (value ? new Date(value).toLocaleString("tr-TR") : "Süresiz"),
    },
    {
      title: "",
      key: "actions",
      width: 60,
      render: (_: unknown, row) => (
        <Button
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={async () => {
            try {
              await adminService.unwrap(adminService.ops.unbanIp({ cidr: row.cidr }), "Yasak kaldırılamadı");
              message.success("Yasak kaldırıldı");
              void load();
            } catch (error) {
              message.error(toErrorMessage(error, "Yasak kaldırılamadı"));
            }
          }}
        />
      ),
    },
  ];

  const inviteColumns: ColumnsType<AdminInviteCode> = [
    { title: "Kod", dataIndex: "code", width: 200 },
    {
      title: "Kullanım",
      key: "uses",
      width: 130,
      render: (_: unknown, row) => `${row.uses} / ${row.maxUses}`,
    },
    { title: "Oluşturan", dataIndex: "createdBy", width: 150 },
    {
      title: "Bitiş",
      dataIndex: "expiresAt",
      width: 170,
      render: (value: string | null) => (value ? new Date(value).toLocaleString("tr-TR") : "Süresiz"),
    },
    {
      title: "",
      key: "actions",
      width: 60,
      render: (_: unknown, row) => (
        <Button
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={async () => {
            try {
              await adminService.unwrap(adminService.ops.deleteInvite({ code: row.code }), "Kod silinemedi");
              message.success("Kod silindi");
              void load();
            } catch (error) {
              message.error(toErrorMessage(error, "Kod silinemedi"));
            }
          }}
        />
      ),
    },
  ];

  return (
    <div className="ct-admin-section">
      <header className="ct-admin-section-header">
        <div>
          <h3>Erişim Denetimi</h3>
          <p>IP yasakları ve davet kodları. Davet zorunluluğu Sunucu Ayarları'ndan açılır.</p>
        </div>
        <div className="ct-admin-section-actions">
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            Yenile
          </Button>
        </div>
      </header>

      <Segmented
        value={pane}
        onChange={(value) => setPane(value as Pane)}
        options={[
          { value: "ips", label: "IP Yasakları" },
          { value: "invites", label: "Davet Kodları" },
        ]}
      />

      {pane === "ips" ? (
        <>
          <div className="ct-admin-filters">
            <Input
              placeholder="1.2.3.4 veya 1.2.3.0/24"
              value={newCidr}
              onChange={(event) => setNewCidr(event.target.value)}
              style={{ maxWidth: 220 }}
            />
            <Input
              placeholder="Gerekçe"
              value={newBanReason}
              onChange={(event) => setNewBanReason(event.target.value)}
              maxLength={280}
              style={{ maxWidth: 320 }}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => void addBan()} disabled={!newCidr.trim()}>
              Yasakla
            </Button>
          </div>
          <Table rowKey="cidr" size="small" loading={loading} dataSource={bans} columns={banColumns} pagination={false} />
        </>
      ) : (
        <>
          <div className="ct-admin-filters">
            <Input
              placeholder="Davet kodu"
              value={newCode}
              onChange={(event) => setNewCode(event.target.value)}
              maxLength={64}
              style={{ maxWidth: 220 }}
            />
            <InputNumber
              className="ct-input-number"
              min={1}
              max={10000}
              value={newMaxUses}
              onChange={(value) => setNewMaxUses(value)}
              placeholder="Kullanım hakkı"
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => void addInvite()} disabled={newCode.trim().length < 3}>
              Oluştur
            </Button>
          </div>
          <Table rowKey="code" size="small" loading={loading} dataSource={invites} columns={inviteColumns} pagination={false} />
        </>
      )}
    </div>
  );
}
