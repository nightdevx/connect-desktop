import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPageHeader, AdminSection, AdminState, adminDateTime } from "./admin-primitives";
import { Button, Input, InputNumber, Segmented, Select, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  DeleteOutlined,
  GlobalOutlined,
  KeyOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import type { AdminInviteCode, AdminIpBan } from "@shared/desktop-api-types";
import type { AdminUserDetail } from "@shared/auth-contracts";
import { toErrorMessage } from "@shared/error-message";
import { adminService } from "../services/admin-service";
import { toast } from "@/services/toast";

type Pane = "ips" | "invites";

const USER_PAGE_SIZE = 200;

export default function AdminAccess() {
  const [pane, setPane] = useState<Pane>("ips");
  const [bans, setBans] = useState<AdminIpBan[]>([]);
  const [invites, setInvites] = useState<AdminInviteCode[]>([]);
  const [loading, setLoading] = useState(false);

  // Banning by account is the primary path: an operator knows WHO is causing
  // trouble, and had no way to find out what address that person was on. The
  // raw CIDR box is kept for the case the account form cannot express — a whole
  // block, or somebody who never got as far as signing in.
  const [banBy, setBanBy] = useState<"user" | "cidr">("user");
  const [banUserId, setBanUserId] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUserDetail[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
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
      toast.error(toErrorMessage(error, "Liste yüklenemedi"));
    } finally {
      setLoading(false);
    }
  }, [pane]);

  useEffect(() => {
    void load();
  }, [load]);

  // Only once the IP pane is actually open, and only in the account mode that
  // needs it: this is a full user listing, and the invite pane has no use for it.
  useEffect(() => {
    if (pane !== "ips" || banBy !== "user" || users.length > 0) {
      return;
    }
    setUsersLoading(true);
    void (async () => {
      try {
        const collected: AdminUserDetail[] = [];
        for (;;) {
          const page = await adminService.listUsers({
            limit: USER_PAGE_SIZE,
            offset: collected.length,
          });
          collected.push(...page.users);
          if (page.users.length === 0 || collected.length >= page.total) {
            break;
          }
        }
        setUsers(collected);
      } catch (error) {
        toast.error(toErrorMessage(error, "Kullanıcılar yüklenemedi"));
      } finally {
        setUsersLoading(false);
      }
    })();
  }, [banBy, pane, users.length]);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === banUserId) ?? null,
    [banUserId, users],
  );

  const userOptions = useMemo(
    () =>
      users.map((user) => ({
        value: user.id,
        label: user.lastIp
          ? `@${user.username} — ${user.lastIp}`
          : `@${user.username} — adres yok`,
        // Nothing to ban, so the row says why rather than failing on submit.
        disabled: !user.lastIp,
      })),
    [users],
  );

  const addBan = async (): Promise<void> => {
    if (newBanReason.trim().length < 3) {
      toast.warning("Gerekçe en az 3 karakter olmalı.");
      return;
    }
    try {
      if (banBy === "user") {
        if (!banUserId) {
          toast.warning("Bir kullanıcı seçin.");
          return;
        }
        const data = await adminService.unwrap(
          adminService.ops.banUserIp({ userId: banUserId, reason: newBanReason.trim() }),
          "IP yasaklanamadı",
        );
        toast.success(`${data.ban.cidr} yasaklandı ve oturumları kapatıldı`);
        setBanUserId(null);
      } else {
        await adminService.unwrap(
          adminService.ops.banIp({ cidr: newCidr.trim(), reason: newBanReason.trim() }),
          "IP yasaklanamadı",
        );
        toast.success("IP yasaklandı");
        setNewCidr("");
      }
      setNewBanReason("");
      void load();
    } catch (error) {
      toast.error(toErrorMessage(error, "IP yasaklanamadı"));
    }
  };

  const addInvite = async (): Promise<void> => {
    try {
      await adminService.unwrap(
        adminService.ops.createInvite({ code: newCode.trim(), maxUses: newMaxUses ?? 1 }),
        "Davet kodu oluşturulamadı",
      );
      toast.success("Davet kodu oluşturuldu");
      setNewCode("");
      setNewMaxUses(1);
      void load();
    } catch (error) {
      toast.error(toErrorMessage(error, "Davet kodu oluşturulamadı"));
    }
  };

  const banColumns: ColumnsType<AdminIpBan> = [
    {
      title: "Adres / blok",
      dataIndex: "cidr",
      width: 200,
      render: (value: string) => <code className="ct-admin-code">{value}</code>,
    },
    { title: "Gerekçe", dataIndex: "reason", ellipsis: true },
    { title: "Ekleyen", dataIndex: "createdBy", width: 120, ellipsis: true, responsive: ["lg"] },
    {
      title: "Bitiş",
      dataIndex: "expiresAt",
      width: 160,
      render: (value: string | null) =>
        value ? (
          <AdminState tone="warn">{adminDateTime(value)}</AdminState>
        ) : (
          <AdminState tone="danger">Süresiz</AdminState>
        ),
    },
    {
      title: "",
      key: "actions",
      width: 60,
      align: "right" as const,
      render: (_: unknown, row) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={async () => {
            try {
              await adminService.unwrap(adminService.ops.unbanIp({ cidr: row.cidr }), "Yasak kaldırılamadı");
              toast.success("Yasak kaldırıldı");
              void load();
            } catch (error) {
              toast.error(toErrorMessage(error, "Yasak kaldırılamadı"));
            }
          }}
        />
      ),
    },
  ];

  const inviteColumns: ColumnsType<AdminInviteCode> = [
    {
      title: "Kod",
      dataIndex: "code",
      width: 200,
      render: (value: string) => <code className="ct-admin-code">{value}</code>,
    },
    {
      title: "Kullanım",
      key: "uses",
      width: 140,
      render: (_: unknown, row) => (
        <div className="ct-admin-fill-cell">
          <span className="ct-admin-fill-count">
            {row.uses} / {row.maxUses}
          </span>
          <span className="ct-admin-fill" aria-hidden="true">
            <span style={{ width: `${Math.min(100, (row.uses / Math.max(1, row.maxUses)) * 100)}%` }} />
          </span>
        </div>
      ),
    },
    { title: "Oluşturan", dataIndex: "createdBy", width: 120, ellipsis: true, responsive: ["lg"] },
    {
      title: "Bitiş",
      dataIndex: "expiresAt",
      width: 160,
      render: (value: string | null) =>
        value ? (
          <span className="ct-admin-muted">{adminDateTime(value)}</span>
        ) : (
          <AdminState>Süresiz</AdminState>
        ),
    },
    {
      title: "",
      key: "actions",
      width: 60,
      align: "right" as const,
      render: (_: unknown, row) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={async () => {
            try {
              await adminService.unwrap(adminService.ops.deleteInvite({ code: row.code }), "Kod silinemedi");
              toast.success("Kod silindi");
              void load();
            } catch (error) {
              toast.error(toErrorMessage(error, "Kod silinemedi"));
            }
          }}
        />
      ),
    },
  ];

  return (
    <div className="ct-admin-page">
      <AdminPageHeader
        title="Erişim Denetimi"
        description={"IP yasakları ve davet kodları. Davet zorunluluğu Sunucu Ayarları'ndan açılır."}
        actions={
          <>
            <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
              Yenile
            </Button>
          </>
        }
      />

      <Segmented
        value={pane}
        onChange={(value) => setPane(value as Pane)}
        className="ct-segmented-premium"
        options={[
          { value: "ips", label: "IP Yasakları" },
          { value: "invites", label: "Davet Kodları" },
        ]}
      />

      {pane === "ips" ? (
        <AdminSection
          title="IP yasakları"
          description={
            banBy === "user"
              ? selectedUser
                ? selectedUser.lastIp
                  ? `Son giriş adresi ${selectedUser.lastIp} yasaklanır ve açık oturumları kapatılır.`
                  : "Bu hesap hiç giriş yapmamış, yasaklanacak bir adres yok."
                : "Adres, kişinin son girişinden alınır. Hiç giriş yapmamış hesaplarda kayıtlı adres olmaz."
              : "Tek bir adres ya da bir blok (CIDR) yasaklanır."
          }
          icon={<GlobalOutlined />}
          hint={`${bans.length} yasak`}
          flush
          toolbar={
            <>
              <Segmented
                value={banBy}
                onChange={(value) => setBanBy(value as "user" | "cidr")}
                className="ct-segmented-premium"
                options={[
                  { value: "user", label: "Kullanıcıdan" },
                  { value: "cidr", label: "Adres / blok" },
                ]}
              />

              {banBy === "user" ? (
                <Select
                  showSearch
                  allowClear
                  loading={usersLoading}
                  value={banUserId}
                  onChange={(value) => setBanUserId(value ?? null)}
                  placeholder="Kullanıcı seç"
                  optionFilterProp="label"
                  options={userOptions}
                  className="ct-admin-toolbar-filter wide"
                />
              ) : (
                <Input
                  placeholder="1.2.3.4 veya 1.2.3.0/24"
                  value={newCidr}
                  onChange={(event) => setNewCidr(event.target.value)}
                  className="ct-admin-toolbar-filter"
                />
              )}

              <Input
                placeholder="Gerekçe"
                value={newBanReason}
                onChange={(event) => setNewBanReason(event.target.value)}
                maxLength={280}
                className="ct-admin-toolbar-search"
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => void addBan()}
                disabled={banBy === "user" ? !selectedUser?.lastIp : !newCidr.trim()}
              >
                Yasakla
              </Button>
            </>
          }
        >
          <Table
            rowKey="cidr"
            size="small"
            loading={loading}
            dataSource={bans}
            columns={banColumns}
            pagination={false}
            tableLayout="fixed"
            className="ct-admin-table-wrap"
            locale={{ emptyText: "Yasaklı adres yok." }}
          />
        </AdminSection>
      ) : (
        <AdminSection
          title="Davet kodları"
          description="Yalnızca davetle kayıt açıkken yeni hesap açmak için gereken kodlar."
          icon={<KeyOutlined />}
          hint={`${invites.length} kod`}
          flush
          toolbar={
            <>
              <Input
                placeholder="Davet kodu"
                value={newCode}
                onChange={(event) => setNewCode(event.target.value)}
                maxLength={64}
                className="ct-admin-toolbar-filter"
              />
              <InputNumber
                className="ct-input-number ct-admin-toolbar-number"
                min={1}
                max={10000}
                value={newMaxUses}
                onChange={(value) => setNewMaxUses(value)}
                placeholder="Kullanım hakkı"
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => void addInvite()}
                disabled={newCode.trim().length < 3}
              >
                Oluştur
              </Button>
            </>
          }
        >
          <Table
            rowKey="code"
            size="small"
            loading={loading}
            dataSource={invites}
            columns={inviteColumns}
            pagination={false}
            tableLayout="fixed"
            className="ct-admin-table-wrap"
            locale={{ emptyText: "Davet kodu yok." }}
          />
        </AdminSection>
      )}
    </div>
  );
}
