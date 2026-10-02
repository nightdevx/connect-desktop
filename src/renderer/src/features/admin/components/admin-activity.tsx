import { toErrorMessage } from "@shared/error-message";
import { useCallback, useEffect, useRef, useState } from "react";
import { Table, Button, Input, Select } from "antd";
import type { TablePaginationConfig } from "antd";
import { HistoryOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import adminService from "../services/admin-service";
import { AdminLobbyEvent } from "@shared/auth-contracts";
import {
  AdminPageHeader,
  AdminPerson,
  AdminSection,
  AdminState,
  adminDateTime,
  type AdminTone,
} from "./admin-primitives";
import { toast } from "@/services/toast";

// antd hands the pagination object back with every field optional; this is what
// a page-size reset falls back to.
const DEFAULT_PAGE_SIZE = 50;

const EVENT_STATES: Record<string, { tone: AdminTone; text: string }> = {
  join: { tone: "ok", text: "Girdi" },
  leave: { tone: "danger", text: "Çıktı" },
  create: { tone: "info", text: "Oda açtı" },
  delete: { tone: "warn", text: "Oda sildi" },
  edit: { tone: "info", text: "Odayı düzenledi" },
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
      toast.error(toErrorMessage(err, "Aktivite logları alınamadı"));
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
      title: "Zaman",
      dataIndex: "occurredAt",
      key: "occurredAt",
      width: 170,
      // First, not last. This is a log: the question asked of every row is
      // "when".
      render: (date: string) => <span className="ct-admin-muted">{adminDateTime(date, true)}</span>,
    },
    {
      title: "Olay",
      dataIndex: "eventType",
      key: "eventType",
      width: 150,
      render: (type: string) => {
        const state = EVENT_STATES[type];
        return <AdminState tone={state?.tone ?? "muted"}>{state?.text ?? type}</AdminState>;
      },
    },
    {
      title: "Kişi",
      key: "user",
      ellipsis: true,
      render: (_value: unknown, record: AdminLobbyEvent) => (
        <AdminPerson userId={record.userId} name={record.username} handle={`@${record.username}`} />
      ),
    },
    {
      title: "Oda",
      key: "lobby",
      ellipsis: true,
      render: (_value: unknown, record: AdminLobbyEvent) => (
        <div className="ct-admin-person-text">
          <strong>{record.lobbyName}</strong>
          <span className="ct-admin-mono">{record.lobbyId}</span>
        </div>
      ),
    },
  ];

  return (
    <div className="ct-admin-page">
      <AdminPageHeader
        title="Oda Etkinliği"
        description="Odalara kim, ne zaman girdi ve çıktı; hangi oda açıldı, değişti ya da silindi."
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

      <AdminSection
        title="Olaylar"
        icon={<HistoryOutlined />}
        hint={`${total} kayıt`}
        flush
        toolbar={
          <>
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
                { value: "all", label: "Tüm olaylar" },
                { value: "join", label: "Giriş" },
                { value: "leave", label: "Çıkış" },
                { value: "create", label: "Oda oluşturma" },
                { value: "delete", label: "Oda silme" },
                { value: "edit", label: "Oda güncelleme" },
              ]}
            />

            <Select
              showSearch
              allowClear
              placeholder="Oda"
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
              placeholder="Kullanıcı"
              value={userFilter || undefined}
              onOpenChange={(open) => open && void loadFilterOptions()}
              onChange={(val) => setUserFilter(val || "")}
              filterOption={(input, option) =>
                (option?.label ?? "").toLowerCase().includes(input.toLowerCase())
              }
              options={usersList.map(u => ({ value: u.id, label: `@${u.username}${u.displayName ? ` (${u.displayName})` : ""}` }))}
              className="ct-admin-toolbar-filter"
            />
          </>
        }
      >
        <Table
          size="middle"
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
          tableLayout="fixed"
          className="ct-admin-table-wrap"
        />
      </AdminSection>
    </div>
  );
}
