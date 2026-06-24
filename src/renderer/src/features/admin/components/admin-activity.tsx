import { useEffect, useState } from "react";
import { Table, Button, Input, Tag, message, Space, Select } from "antd";
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
          <Tag color={color} style={{ fontWeight: "600" }}>
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
          <div style={{ fontWeight: "500", color: "#ffffff" }}>{record.lobbyName}</div>
          <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.45)" }}>
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
          <div style={{ fontWeight: "500", color: "#ffffff" }}>@{record.username}</div>
          <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.45)" }}>
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
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: "700", margin: "0 0 4px 0", color: "#ffffff" }}>
            Aktivite Logları
          </h1>
          <p style={{ margin: 0, color: "rgba(255, 255, 255, 0.45)", fontSize: "14px" }}>
            Sistem genelinde lobilere giriş ve çıkış işlemlerinin denetim kaydı geçmişi
          </p>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => fetchEvents()}
          style={{ color: "#ffffff", background: "transparent", borderColor: "rgba(255,255,255,0.2)" }}
        >
          Yenile
        </Button>
      </div>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          background: "rgba(255, 255, 255, 0.02)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "8px",
          padding: "12px",
          flexWrap: "wrap",
        }}
      >
        <Input
          placeholder="İsim, kullanıcı adı, oda adı ara..."
          prefix={<SearchOutlined style={{ color: "rgba(255,255,255,0.45)" }} />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{
            flex: 1.5,
            minWidth: "200px",
            background: "rgba(15, 15, 15, 0.8)",
            borderColor: "rgba(255, 255, 255, 0.08)",
            color: "#ffffff",
          }}
        />

        <Select
          defaultValue="all"
          value={eventTypeFilter}
          onChange={setEventTypeFilter}
          style={{ width: "180px" }}
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
          style={{
            flex: 1,
            minWidth: "160px",
          }}
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
          style={{
            flex: 1,
            minWidth: "160px",
          }}
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
        style={{
          background: "rgba(20, 20, 20, 0.4)",
          borderRadius: "12px",
          overflow: "hidden",
        }}
      />
    </div>
  );
}
