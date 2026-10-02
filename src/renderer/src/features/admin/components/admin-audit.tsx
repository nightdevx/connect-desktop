import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader, AdminSection, adminDateTime } from "./admin-primitives";
import { Button, Input, Select, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { AuditOutlined, ReloadOutlined, DownloadOutlined, SearchOutlined } from "@ant-design/icons";
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
      render: (value: string) => <span className="ct-admin-muted">{adminDateTime(value, true)}</span>,
    },
    {
      title: "Yönetici",
      dataIndex: "actorName",
      width: 120,
      ellipsis: true,
      render: (value: string) => <strong>{value}</strong>,
    },
    {
      title: "Eylem",
      dataIndex: "action",
      width: 170,
      render: (value: string) => <code className="ct-audit-action">{value}</code>,
    },
    {
      title: "Hedef",
      key: "target",
      ellipsis: true,
      render: (_: unknown, row) => (
        <span className="ct-admin-target">
          <span className="ct-admin-muted">{row.targetType}</span>
          <span className="ct-admin-ellipsis">{row.targetLabel || row.targetId || "—"}</span>
        </span>
      ),
    },
    {
      title: "Gerekçe",
      dataIndex: "reason",
      ellipsis: true,
      responsive: ["lg"],
      render: (value: string) => value || <span className="ct-muted">—</span>,
    },
    {
      title: "IP",
      dataIndex: "clientIp",
      width: 120,
      responsive: ["xl"],
      render: (value: string) => <span className="ct-admin-mono">{value || "—"}</span>,
    },
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

      <AdminSection
        title="Yönetici eylemleri"
        icon={<AuditOutlined />}
        hint={`${total} kayıt`}
        flush
        toolbar={
          <>
            <Input.Search
              placeholder="Yönetici, hedef veya gerekçe ara"
              allowClear
              prefix={<SearchOutlined className="ct-admin-muted" />}
              onSearch={(value) => {
                setPage(1);
                setSearch(value);
              }}
              className="ct-admin-toolbar-search"
            />
            <Select
              value={targetType}
              options={TARGET_TYPES}
              onChange={(value) => {
                setPage(1);
                setTargetType(value);
              }}
              className="ct-admin-toolbar-filter"
            />
          </>
        }
      >
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={entries}
          columns={columns}
          tableLayout="fixed"
          className="ct-admin-table-wrap"
          locale={{ emptyText: "Bu filtrelerle eşleşen kayıt yok." }}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total,
            showSizeChanger: false,
            onChange: setPage,
            showTotal: (count) => `${count} kayıt`,
          }}
        />
      </AdminSection>
    </div>
  );
}
