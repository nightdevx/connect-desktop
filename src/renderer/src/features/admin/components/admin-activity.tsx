import { toErrorMessage } from "@shared/error-message";
import { useCallback, useEffect, useRef, useState } from "react";
import { Table, Button, Input, Tag, message, Select } from "antd";
import type { TablePaginationConfig } from "antd";
import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import adminService from "../services/admin-service";
import { AdminLobbyEvent } from "@shared/auth-contracts";
import { AdminPageHeader } from "./admin-primitives";

// antd hands the pagination object back with every field optional; this is what
// a page-size reset falls back to.
const DEFAULT_PAGE_SIZE = 50;

const EVENT_TAGS: Record<string, { color: string; text: string }> = {
  join: { color: "green", text: "GİRİŞ" },
  leave: { color: "red", text: "ÇIKIŞ" },
  create: { color: "purple", text: "YENİ ODA" },
  delete: { color: "orange", text: "ODA SİLİNDİ" },
  edit: { color: "blue", text: "GÜNCELLEME" },
};

export default function AdminActivity() {
  const [events, setEvents] = useState<AdminLobbyEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchText, setSearchText] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [lobbyFilter, setLobbyFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");

  // Options Lists for Selects
  const [usersList, setUsersList] = useState<{ id: string; username: string; displayName?: string }[]>([]);
  const [lobbiesList, setLobbiesList] = useState<{ id: string; name: string }[]>([]);

  // Loaded when a filter dropdown is first opened, not on mount.
  //
  // These two calls are the whole user table (every avatar is a base64 data
  // URL) and the whole lobby list, fetched so two dropdowns could offer
  // options. Reading the log is what people come here for; filtering it by a
  // specific room or person is the rare case, and it now pays for itself.
  const filterOptionsRequestedRef = useRef(false);

  const loadFilterOptions = async (): Promise<void> => {
    if (filterOptionsRequestedRef.current) {
      return;
    }
    filterOptionsRequestedRef.current = true;

    try {
      const [usersRes, lobbiesRes] = await Promise.all([
        adminService.listUsers(),
        adminService.listLobbies()
      ]);
      setUsersList(usersRes.users || []);
      setLobbiesList((lobbiesRes.lobbies || []).map(l => ({ id: l.lobby.id, name: l.lobby.name })));
    } catch (err) {
      // Let the next open try again rather than leaving both filters empty for
      // the rest of the session.
      filterOptionsRequestedRef.current = false;
      console.error("Filtre seçenekleri yüklenemedi:", err);
    }
  };

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const fetchEvents = useCallback(
    async (page = currentPage, size = pageSize): Promise<void> => {
    try {
      setLoading(true);
      const offset = (page - 1) * size;
      const res = await adminService.listLobbyEvents({
        limit: size,
        offset,
        lobbyId: lobbyFilter || undefined,
        userId: userFilter || undefined,
        eventType: eventTypeFilter !== "all" ? eventTypeFilter : undefined,
        search: searchText || undefined,
      });
      setEvents(res.events || []);
      setTotal(res.total || 0);
    } catch (err) {
      message.error(toErrorMessage(err, "Aktivite logları alınamadı"));
    } finally {
      setLoading(false);
    }
    },
    [currentPage, pageSize, lobbyFilter, userFilter, eventTypeFilter, searchText],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [lobbyFilter, userFilter, eventTypeFilter, searchText]);

  // One debounced fetch for filters and paging alike — see admin-users for why
  // splitting them fired two requests per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => fetchEvents(currentPage, pageSize), 300);
    return () => clearTimeout(timer);
  }, [
    currentPage,
    pageSize,
    // fetchEvents is memoised on the four filters this list used to name, so
    // depending on it re-runs the fetch on the same changes — and the debounced
    // timer can no longer fire a closure built from a filter that has moved on.
    fetchEvents,
  ]);

  const handleTableChange = (pagination: TablePaginationConfig): void => {
    setCurrentPage(pagination.current ?? 1);
    setPageSize(pagination.pageSize ?? DEFAULT_PAGE_SIZE);
  };

  const hasFilter =
    Boolean(searchText || lobbyFilter || userFilter) || eventTypeFilter !== "all";

  const columns = [
    {
      title: "Tarih / Saat",
      dataIndex: "occurredAt",
      key: "occurredAt",
      width: 180,
      // First, not last. This is a log: the question asked of every row is
      // "when", and it was the one column parked past the right edge of a
      // table that scrolls horizontally.
      render: (date: string) => new Date(date).toLocaleString("tr-TR"),
    },
    {
      title: "Olay",
      dataIndex: "eventType",
      key: "eventType",
      width: 140,
      // antd's preset names, not literal hex. A hex Tag is a solid block of one
      // fixed colour with white text on it — the same five blocks whether the
      // page is dark or light, and the only reason a log row could be brighter
      // than the heading above it.
      render: (type: string) => {
        const preset = EVENT_TAGS[type];
        return preset ? (
          <Tag color={preset.color}>{preset.text}</Tag>
        ) : (
          <Tag>{type.toUpperCase()}</Tag>
        );
      },
    },
    {
      title: "Kullanıcı",
      key: "user",
      width: 240,
      render: (_value: unknown, record: AdminLobbyEvent) => (
        <div className="ct-admin-cell">
          <strong>@{record.username}</strong>
          <span className="ct-admin-mono">{record.userId}</span>
        </div>
      ),
    },
    {
      title: "Oda",
      key: "lobby",
      width: 240,
      render: (_value: unknown, record: AdminLobbyEvent) => (
        <div className="ct-admin-cell">
          <strong>{record.lobbyName}</strong>
          <span className="ct-admin-mono">{record.lobbyId}</span>
        </div>
      ),
    },
  ];

  return (
    <div className="ct-admin-page">
      <AdminPageHeader
        title="Aktivite Logları"
        description="Sistem genelinde lobilere giriş ve çıkış işlemlerinin denetim kaydı geçmişi."
        actions={
          <Button
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => fetchEvents()}
          >
            Yenile
          </Button>
        }
      />

      {/* Filters */}
      <div className="ct-admin-toolbar">
        <Input
          allowClear
          placeholder="İsim, kullanıcı adı, oda adı ara..."
          prefix={<SearchOutlined className="ct-admin-muted" />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="ct-admin-toolbar-search"
        />

        <Select
          value={eventTypeFilter}
          onChange={setEventTypeFilter}
          className="ct-admin-toolbar-filter"
          options={[
            { value: "all", label: "Tüm Olay Tipleri" },
            { value: "join", label: "Giriş (Join)" },
            { value: "leave", label: "Çıkış (Leave)" },
            { value: "create", label: "Oda Oluşturma" },
            { value: "delete", label: "Oda Silme" },
            { value: "edit", label: "Oda Güncelleme" },
          ]}
        />

        <Select
          showSearch
          allowClear
          placeholder="Oda seçin..."
          value={lobbyFilter || undefined}
          onOpenChange={(open) => open && void loadFilterOptions()}
          onChange={(val) => setLobbyFilter(val || "")}
          filterOption={(input, option) =>
            (option?.label ?? "").toLowerCase().includes(input.toLowerCase())
          }
          options={lobbiesList.map(l => ({ value: l.id, label: `${l.name} (${l.id.substring(0, 8)})` }))}
          className="ct-admin-toolbar-filter"
        />

        <Select
          showSearch
          allowClear
          placeholder="Kullanıcı seçin..."
          value={userFilter || undefined}
          onOpenChange={(open) => open && void loadFilterOptions()}
          onChange={(val) => setUserFilter(val || "")}
          filterOption={(input, option) =>
            (option?.label ?? "").toLowerCase().includes(input.toLowerCase())
          }
          options={usersList.map(u => ({ value: u.id, label: `@${u.username}${u.displayName ? ` (${u.displayName})` : ""}` }))}
          className="ct-admin-toolbar-filter"
        />
      </div>

      {/* Audit Log Table */}
      <Table
        dataSource={events}
        columns={columns}
        rowKey="id"
        loading={loading}
        onChange={handleTableChange}
        locale={{
          emptyText: hasFilter
            ? "Bu filtrelerle eşleşen kayıt yok."
            : "Henüz kayıt yok.",
        }}
        pagination={{
          current: currentPage,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: ["10", "20", "50", "100"],
          showTotal: (count) => `${count} kayıt`,
        }}
        // See admin-users: the viewport-height body cut the last row and hid
        // the pagination. This page defaults to 50 rows, so it was the worst
        // affected.
        scroll={{ x: "max-content" }}
        className="ct-admin-table-wrap"
      />
    </div>
  );
}
