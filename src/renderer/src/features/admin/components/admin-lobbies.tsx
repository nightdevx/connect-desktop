import { useEffect, useState } from "react";
import { Table, Button, Space, message, Tag, Avatar, Modal, Form, Input, Popconfirm, Select, ConfigProvider, theme, Switch } from "antd";
import {
  HomeOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  AudioMutedOutlined,
  SoundOutlined,
  VideoCameraOutlined,
  DesktopOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import adminService from "../services/admin-service";
import { AdminLobbySnapshot } from "@shared/auth-contracts";

export default function AdminLobbies() {
  const [lobbies, setLobbies] = useState<AdminLobbySnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [lockedFilter, setLockedFilter] = useState("all");
  const [debouncedSearchText, setDebouncedSearchText] = useState("");

  // Edit State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingLobby, setEditingLobby] = useState<AdminLobbySnapshot | null>(null);
  const [editForm] = Form.useForm();
  const [allUsers, setAllUsers] = useState<any[]>([]);

  const fetchLobbies = async () => {
    try {
      setLoading(true);
      const res = await adminService.listLobbies({
        search: searchText || undefined,
        locked: lockedFilter !== "all" ? lockedFilter : undefined,
      });
      setLobbies(res.lobbies);
    } catch (err: any) {
      message.error(err.message || "Lobiler alınamadı");
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await adminService.listUsers();
      setAllUsers(res.users);
    } catch (err) {
      console.error("Kullanıcılar alınamadı", err);
    }
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchText(searchText);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchText]);

  useEffect(() => {
    fetchLobbies();
    fetchUsers();
    const interval = setInterval(fetchLobbies, 4000);
    return () => clearInterval(interval);
  }, [debouncedSearchText, lockedFilter]);

  const handleEditClick = (record: AdminLobbySnapshot) => {
    setEditingLobby(record);
    editForm.setFieldsValue({
      name: record.lobby.name,
      isLocked: record.lobby.isLocked,
      allowedUsers: record.lobby.allowedUsers ? record.lobby.allowedUsers.split(",").filter(Boolean) : [],
    });
    setIsEditOpen(true);
  };

  const handleEditSubmit = async (values: any) => {
    if (!editingLobby) return;
    try {
      const res = await window.desktopApi.updateLobby({
        lobbyId: editingLobby.lobby.id,
        name: values.name,
        isLocked: values.isLocked,
        allowedUsers: values.allowedUsers || [],
      });
      if (res.ok) {
        message.success("Oda güncellendi");
        setIsEditOpen(false);
        fetchLobbies();
      } else {
        throw new Error(res.error?.message || "Güncelleme başarısız");
      }
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const handleDeleteLobby = async (lobbyId: string) => {
    try {
      const res = await window.desktopApi.deleteLobby({ lobbyId });
      if (res.ok) {
        message.success("Oda silindi");
        fetchLobbies();
      } else {
        throw new Error(res.error?.message || "Silme işlemi başarısız");
      }
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const handleKickUser = async (lobbyId: string, userId: string) => {
    try {
      await adminService.kickUser(lobbyId, userId);
      message.success("Kullanıcı odadan atıldı");
      fetchLobbies();
    } catch (err: any) {
      message.error(err.message || "Kullanıcı odadan atılamadı");
    }
  };

  const columns = [
    {
      title: "Oda Bilgisi",
      key: "lobby",
      render: (_: any, record: AdminLobbySnapshot) => (
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <HomeOutlined style={{ fontSize: "20px", color: "#a855f7" }} />
          <div>
            <div style={{ fontWeight: "600", color: "#ffffff" }}>{record.lobby.name}</div>
            <div style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.45)" }}>
              ID: {record.lobby.id}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Oluşturan",
      key: "createdBy",
      render: (_: any, record: AdminLobbySnapshot) => {
        const username = record.lobby.createdByUsername || record.lobby.createdBy;
        return <Tag color="blue">@{username}</Tag>;
      },
    },
    {
      title: "Üye Sayısı",
      dataIndex: "size",
      key: "size",
      render: (size: number) => (
        <Tag color={size > 0 ? "green" : "default"}>{size} Aktif Üye</Tag>
      ),
    },
    {
      title: "Kurulma Tarihi",
      dataIndex: ["lobby", "createdAt"],
      key: "createdAt",
      render: (date: string) => new Date(date).toLocaleString("tr-TR"),
    },
    {
      title: "İşlemler",
      key: "actions",
      render: (_: any, record: AdminLobbySnapshot) => (
        <Space size="middle">
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => handleEditClick(record)}
            style={{ color: "#3b82f6" }}
            title="Adı Değiştir"
          />
          <Popconfirm
            title="Odayı silmek istediğinize emin misiniz? Tüm katılımcıların bağlantısı kesilecektir."
            onConfirm={() => handleDeleteLobby(record.lobby.id)}
            okText="Evet"
            cancelText="Hayır"
          >
            <Button type="text" danger icon={<DeleteOutlined />} title="Sil" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // Render sub table listing live participants in a lobby
  const expandedRowRender = (record: AdminLobbySnapshot) => {
    if (record.members.length === 0) {
      return (
        <div style={{ padding: "8px 16px", color: "rgba(255, 255, 255, 0.45)", fontSize: "13px" }}>
          Odada şu anda kimse yok.
        </div>
      );
    }

    const memberColumns = [
      {
        title: "Kullanıcı Adı",
        dataIndex: "username",
        key: "username",
        render: (username: string) => (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Avatar size="small" style={{ background: "#8b5cf6" }}>
              {username[0]?.toUpperCase()}
            </Avatar>
            <span style={{ color: "#ffffff", fontWeight: "500" }}>@{username}</span>
          </div>
        ),
      },
      {
        title: "Giriş Saati",
        dataIndex: "joinedAt",
        key: "joinedAt",
        render: (date: string) => new Date(date).toLocaleTimeString("tr-TR"),
      },
      {
        title: "Ses / Mikrofon Durumu",
        key: "audioStatus",
        render: (_: any, member: any) => (
          <Space>
            {member.muted ? (
              <Tag color="red" icon={<AudioMutedOutlined />}>
                Sessiz
              </Tag>
            ) : (
              <Tag color="green" icon={<SoundOutlined />}>
                Ses Açık
              </Tag>
            )}
            {member.deafened && (
              <Tag color="volcano">Sağırlaştırılmış</Tag>
            )}
          </Space>
        ),
      },
      {
        title: "Kamera / Ekran Durumu",
        key: "mediaStatus",
        render: (_: any, member: any) => (
          <Space>
            {member.cameraEnabled ? (
              <Tag color="purple" icon={<VideoCameraOutlined />}>
                Kamera Açık
              </Tag>
            ) : (
              <Tag color="default">Kamera Kapalı</Tag>
            )}
            {member.screenSharing ? (
              <Tag color="cyan" icon={<DesktopOutlined />}>
                Ekran Paylaşıyor
              </Tag>
            ) : null}
          </Space>
        ),
      },
      {
        title: "İşlemler",
        key: "actions",
        render: (_: any, member: any) => (
          <Popconfirm
            title="Kullanıcıyı odadan atmak istediğinize emin misiniz?"
            onConfirm={() => handleKickUser(record.lobby.id, member.userId)}
            okText="Evet"
            cancelText="Hayır"
          >
            <Button type="link" danger size="small" style={{ padding: 0 }}>
              Odadan At
            </Button>
          </Popconfirm>
        ),
      },
    ];

    return (
      <ConfigProvider
        theme={{
          algorithm: theme.darkAlgorithm,
          components: {
            Table: {
              colorBgContainer: "transparent",
              headerBg: "rgba(255, 255, 255, 0.04)",
            }
          }
        }}
      >
        <div style={{ padding: "8px 16px" }}>
          <Table
            columns={memberColumns}
            dataSource={record.members}
            rowKey="userId"
            pagination={false}
            size="small"
            style={{
              background: "rgba(10, 10, 10, 0.25)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "8px",
            }}
          />
        </div>
      </ConfigProvider>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: "700", margin: "0 0 4px 0", color: "#ffffff" }}>
            Aktif Odalar
          </h1>
          <p style={{ margin: 0, color: "rgba(255, 255, 255, 0.45)", fontSize: "14px" }}>
            Sistemdeki tüm sesli görüşme odalarını ve katılımcılarını anlık izleyin
          </p>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={fetchLobbies}
          style={{ color: "#ffffff", background: "transparent", borderColor: "rgba(255,255,255,0.2)" }}
        >
          Yenile
        </Button>
      </div>

      {/* Filters Bar */}
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
          placeholder="Oda adı, ID veya oluşturan ara..."
          prefix={<SearchOutlined style={{ color: "rgba(255,255,255,0.45)" }} />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{
            flex: 1,
            minWidth: "200px",
            background: "rgba(15, 15, 15, 0.8)",
            borderColor: "rgba(255, 255, 255, 0.08)",
            color: "#ffffff",
          }}
        />

        <Select
          defaultValue="all"
          value={lockedFilter}
          onChange={setLockedFilter}
          style={{ width: "150px" }}
          dropdownStyle={{ background: "#1f1f1f" }}
          options={[
            { value: "all", label: "Tüm Odalar" },
            { value: "true", label: "Kilitli Odalar" },
            { value: "false", label: "Açık Odalar" },
          ]}
        />
      </div>

      <Table
        dataSource={lobbies}
        columns={columns}
        rowKey={(record) => record.lobby.id}
        loading={loading}
        expandable={{ expandedRowRender, defaultExpandAllRows: true }}
        style={{
          background: "rgba(20, 20, 20, 0.4)",
          borderRadius: "12px",
          overflow: "hidden",
        }}
      />

      {/* Edit Name Modal */}
      <Modal
        title={<span style={{ color: "#ffffff" }}>Oda Yetkilerini Düzenle</span>}
        open={isEditOpen}
        onCancel={() => setIsEditOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setIsEditOpen(false)} style={{ color: "#ffffff", background: "transparent", borderColor: "rgba(255,255,255,0.2)" }}>
            İptal
          </Button>,
          <Button
            key="submit"
            type="primary"
            onClick={() => editForm.submit()}
            style={{ background: "#a855f7", borderColor: "#a855f7" }}
          >
            Güncelle
          </Button>,
        ]}
        style={{ background: "#141414" }}
        bodyStyle={{ background: "#141414" }}
      >
        <Form form={editForm} layout="vertical" onFinish={handleEditSubmit}>
          <Form.Item
            name="name"
            label={<span style={{ color: "rgba(255,255,255,0.85)" }}>Oda Adı</span>}
            rules={[
              { required: true, message: "Oda adı girilmelidir" },
              { min: 2, message: "En az 2 karakter olmalıdır" },
            ]}
          >
            <Input style={{ background: "rgba(15, 15, 15, 0.8)", borderColor: "rgba(255, 255, 255, 0.08)", color: "#ffffff" }} />
          </Form.Item>

          <Form.Item
            name="isLocked"
            valuePropName="checked"
            label={<span style={{ color: "rgba(255,255,255,0.85)" }}>Kilitli Oda</span>}
          >
            <Switch />
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.isLocked !== currentValues.isLocked}>
            {({ getFieldValue }) => {
              const isLocked = getFieldValue("isLocked");
              return isLocked ? (
                <Form.Item
                  name="allowedUsers"
                  label={<span style={{ color: "rgba(255,255,255,0.85)" }}>İzin Verilen Kullanıcılar</span>}
                >
                  <Select
                    mode="multiple"
                    placeholder="Kullanıcıları seçin..."
                    style={{ width: "100%" }}
                    options={allUsers
                      .filter((u) => u.id !== editingLobby?.lobby.createdBy)
                      .map((u) => ({
                        label: `@${u.username} (${u.displayName})`,
                        value: u.id,
                      }))}
                    dropdownStyle={{ background: "#1f1f1f" }}
                  />
                </Form.Item>
              ) : null;
            }}
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
