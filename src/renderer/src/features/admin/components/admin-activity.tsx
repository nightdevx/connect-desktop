import { useEffect, useRef, useState } from "react";
import { Table, Button, Input, Tag, message, Select } from "antd";
import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import adminService from "../services/admin-service";
import { AdminLobbyEvent } from "@shared/auth-contracts";

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
    } catch (err: any) {
      // Let the next open try again rather than leaving both filters empty for
      // the rest of the session.
      filterOptionsRequestedRef.current = false;
      console.error("Filtre seçenekleri yüklenemedi:", err);
    }
  };

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const fetchEvents = async (page = currentPage, size = pageSize) => {
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
    } catch (err: any) {
      message.error(err.message || "Aktivite logları alınamadı");
    } finally {
      setLoading(false);
    }
  };

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
    lobbyFilter,
    userFilter,
    eventTypeFilter,
    searchText,
  ]);

  const handleTableChange = (pagination: any) => {
    setCurrentPage(pagination.current);
    setPageSize(pagination.pageSize);
  };

  const columns = [
    {
      title: "Olay Tipi",
      dataIndex: "eventType",
      key: "eventType",
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
      title: "Oda",
      key: "lobby",
      render: (_: any, record: AdminLobbyEvent) => (
        <div className="ct-admin-table-user">
          <div>
            <strong>{record.lobbyName}</strong>
            <span>ID: {record.lobbyId}</span>
          </div>
        </div>
      ),
    },
    {
      title: "Kullanıcı",
      key: "user",
      render: (_: any, record: AdminLobbyEvent) => (
        <div className="ct-admin-table-user">
          <div>
            <strong>@{record.username}</strong>
            <span>ID: {record.userId}</span>
          </div>
        </div>
      ),
    },
    {
      title: "Tarih / Saat",
      dataIndex: "occurredAt",
      key: "occurredAt",
      render: (date: string) => new Date(date).toLocaleString("tr-TR"),
    },
  ];

  return (
    <div className="ct-admin-page">
      <header className="ct-admin-page-header">
        <div>
          <h1>Aktivite Logları</h1>
          <p>
            Sistem genelinde lobilere giriş ve çıkış işlemlerinin denetim kaydı
            geçmişi
          </p>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => fetchEvents()}>
          Yenile
        </Button>
      </header>

      {/* Filters */}
      <div
        className="ct-admin-toolbar"
      >
        <Input
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
            { value: "create", label: "Oda Oluşturma (Create)" },
            { value: "delete", label: "Oda Silme (Delete)" },
            { value: "edit", label: "Oda Güncelleme (Edit)" },
          ]}
        />

        <Select
          showSearch
          allowClear
          placeholder="Oda Seçin..."
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
          placeholder="Kullanıcı Seçin..."
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
        pagination={{
          current: currentPage,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: ["10", "20", "50", "100"],
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
