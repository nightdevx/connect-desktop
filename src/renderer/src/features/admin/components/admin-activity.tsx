import { useEffect, useState } from "react";
import { Table, Button, Input, Tag, message, Select } from "antd";
import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import adminService from "../services/admin-service";
import { AdminLobbyEvent } from "@shared/auth-contracts";

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

  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        const [usersRes, lobbiesRes] = await Promise.all([
          adminService.listUsers(),
          adminService.listLobbies()
        ]);
        setUsersList(usersRes.users || []);
        setLobbiesList((lobbiesRes.lobbies || []).map(l => ({ id: l.lobby.id, name: l.lobby.name })));
      } catch (err: any) {
        console.error("Filtre seçenekleri yüklenemedi:", err);
      }
    };
    fetchFilterOptions();
  }, []);

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
    const delayDebounceFn = setTimeout(() => {
      fetchEvents(1);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [lobbyFilter, userFilter, eventTypeFilter, searchText]);

  useEffect(() => {
    fetchEvents(currentPage, pageSize);
  }, [currentPage, pageSize]);

  const handleTableChange = (pagination: any) => {
    setCurrentPage(pagination.current);
    setPageSize(pagination.pageSize);
  };

  const columns = [
    {
      title: "Olay Tipi",
      dataIndex: "eventType",
      key: "eventType",
      render: (type: string) => {
        let color = "default";
        let text = type.toUpperCase();
        if (type === "join") {
          color = "#10b981";
          text = "GİRİŞ";
        } else if (type === "leave") {
          color = "#ef4444";
          text = "ÇIKIŞ";
        } else if (type === "create") {
          color = "#a855f7";
          text = "YENİ ODA";
        } else if (type === "delete") {
          color = "#f59e0b";
          text = "ODA SİLİNDİ";
        } else if (type === "edit") {
          color = "#3b82f6";
          text = "GÜNCELLEME";
        }
        return (
          <Tag color={color} >
            {text}
          </Tag>
        );
      },
    },
    {
      title: "Oda",
      key: "lobby",
      render: (_: any, record: AdminLobbyEvent) => (
        <div>
          <div >{record.lobbyName}</div>
          <div className="ct-admin-muted">
            ID: {record.lobbyId}
          </div>
        </div>
      ),
    },
    {
      title: "Kullanıcı",
      key: "user",
      render: (_: any, record: AdminLobbyEvent) => (
        <div>
          <div >@{record.username}</div>
          <div className="ct-admin-muted">
            ID: {record.userId}
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
      <div >
        <div>
          <h1 >
            Aktivite Logları
          </h1>
          <p >
            Sistem genelinde lobilere giriş ve çıkış işlemlerinin denetim kaydı geçmişi
          </p>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => fetchEvents()}
          
        >
          Yenile
        </Button>
      </div>

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
          defaultValue="all"
          value={eventTypeFilter}
          onChange={setEventTypeFilter}
          className="ct-admin-toolbar-filter"
          dropdownStyle={{ background: "#1f1f1f" }}
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
          onChange={(val) => setLobbyFilter(val || "")}
          filterOption={(input, option) =>
            (option?.label ?? "").toLowerCase().includes(input.toLowerCase())
          }
          options={lobbiesList.map(l => ({ value: l.id, label: `${l.name} (${l.id.substring(0, 8)})` }))}
          className="ct-admin-toolbar-filter"
          dropdownStyle={{ background: "#1f1f1f" }}
        />

        <Select
          showSearch
          allowClear
          placeholder="Kullanıcı Seçin..."
          value={userFilter || undefined}
          onChange={(val) => setUserFilter(val || "")}
          filterOption={(input, option) =>
            (option?.label ?? "").toLowerCase().includes(input.toLowerCase())
          }
          options={usersList.map(u => ({ value: u.id, label: `@${u.username}${u.displayName ? ` (${u.displayName})` : ""}` }))}
          className="ct-admin-toolbar-filter"
          dropdownStyle={{ background: "#1f1f1f" }}
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
        scroll={{ y: "calc(100vh - 260px)" }}
        className="ct-admin-table-wrap"
      />
    </div>
  );
}
