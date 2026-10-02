import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "./admin-primitives";
import { Button, Input, Select, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ReloadOutlined, DownloadOutlined } from "@ant-design/icons";
import type { AdminAuditEntry } from "@shared/desktop-api-types";
import { toErrorMessage } from "@shared/error-message";
import { adminService } from "../services/admin-service";
import { toast } from "@/services/toast";

const TARGET_TYPES = [
  { value: "", label: "Tüm hedefler" },
  { value: "user", label: "Kullanıcı" },
  { value: "lobby", label: "Oda" },
  { value: "message", label: "Mesaj" },
  { value: "settings", label: "Ayar" },
  { value: "emote", label: "Emote" },
  { value: "minigame", label: "Oyun" },
  { value: "music", label: "Müzik" },
  { value: "network", label: "Ağ" },
  { value: "invite", label: "Davet" },
  { value: "system", label: "Sistem" },
];

const PAGE_SIZE = 50;

export default function AdminAudit() {
  const [entries, setEntries] = useState<AdminAuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [targetType, setTargetType] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminService.unwrap(
        adminService.ops.listAudit({
          search: search.trim() || undefined,
          targetType: targetType || undefined,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        }),
        "Denetim kaydı yüklenemedi",
      );
      setEntries(data.entries);
      setTotal(data.total);
    } catch (error) {
      toast.error(toErrorMessage(error, "Denetim kaydı yüklenemedi"));
    } finally {
      setLoading(false);
    }
  }, [search, targetType, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ColumnsType<AdminAuditEntry> = [
    {
      title: "Zaman",
      dataIndex: "occurredAt",
      width: 170,
      render: (value: string) => new Date(value).toLocaleString("tr-TR"),
    },
    { title: "Yönetici", dataIndex: "actorName", width: 140 },
    {
      title: "Eylem",
      dataIndex: "action",
      width: 190,
      render: (value: string) => <Tag className="ct-audit-action">{value}</Tag>,
    },
    {
      title: "Hedef",
      key: "target",
      render: (_: unknown, row) => (
        <span>
          <Tag className="ct-tag">{row.targetType}</Tag>
          {row.targetLabel || row.targetId || "—"}
        </span>
      ),
    },
    {
      title: "Gerekçe",
      dataIndex: "reason",
      render: (value: string) => value || <span className="ct-muted">—</span>,
    },
    { title: "IP", dataIndex: "clientIp", width: 130 },
  ];

  return (
    <div className="ct-admin-page">
      <AdminPageHeader
        title="Denetim Kaydı"
        description={"Her yönetici eylemi: kim, kime, neden ve nereden."}
        actions={
          <>
            <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
              Yenile
            </Button>
            <Button
              icon={<DownloadOutlined />}
              onClick={() => {
                toast.info("CSV dökümü GET /admin/audit/export adresinden alınır.");
              }}
            >
              CSV
            </Button>
          </>
        }
      />

      <div className="ct-admin-filters">
        <Input.Search
          placeholder="Yönetici, hedef veya gerekçe ara"
          allowClear
          onSearch={(value) => {
            setPage(1);
            setSearch(value);
          }}
          style={{ maxWidth: 320 }}
        />
        <Select
          value={targetType}
          options={TARGET_TYPES}
          onChange={(value) => {
            setPage(1);
            setTargetType(value);
          }}
          style={{ width: 180 }}
        />
      </div>

      <div className="ct-admin-table-wrap">
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={entries}
          columns={columns}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total,
            showSizeChanger: false,
            onChange: setPage,
          }}
        />
      </div>
    </div>
  );
}
