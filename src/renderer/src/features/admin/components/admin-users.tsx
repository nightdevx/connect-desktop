import { useEffect, useState } from "react";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import {
  Table,
  Input,
  Button,
  Tag,
  Modal,
  Form,
  Select,
  message,
  Drawer,
  Space,
  Avatar,
  Popconfirm,
} from "antd";
import {
  SearchOutlined,
  EditOutlined,
  LockOutlined,
  DeleteOutlined,
  StopOutlined,
  CheckCircleOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import adminService from "../services/admin-service";
import { AdminUserDetail } from "@shared/auth-contracts";

export default function AdminUsers() {
  const { session } = useAuthSession();
  const currentUserId = session.user?.id;

  const [users, setUsers] = useState<AdminUserDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Edit Drawer State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUserDetail | null>(null);
  const [editForm] = Form.useForm();

  // Reset Password Modal State
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resettingUser, setResettingUser] = useState<AdminUserDetail | null>(null);
  const [resetForm] = Form.useForm();

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await adminService.listUsers({
        search: searchText || undefined,
        role: roleFilter !== "all" ? roleFilter : undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
      });
      setUsers(res.users);
    } catch (err: any) {
      message.error(err.message || "Kullanıcılar alınamadı");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchUsers();
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchText, roleFilter, statusFilter]);

  const handleEditClick = (user: AdminUserDetail) => {
    setEditingUser(user);
    editForm.setFieldsValue({
      displayName: user.displayName,
      email: user.email,
      bio: user.bio,
      role: user.role,
    });
    setIsEditOpen(true);
  };

  const handleEditSubmit = async (values: any) => {
    if (!editingUser) return;
    try {
      await adminService.updateUser(editingUser.id, {
        displayName: values.displayName,
        email: values.email || null,
        bio: values.bio || null,
        role: values.role,
      });
      message.success("Kullanıcı başarıyla güncellendi");
      setIsEditOpen(false);
      fetchUsers();
    } catch (err: any) {
      message.error(err.message || "Güncelleme başarısız");
    }
  };

  const handleResetPasswordClick = (user: AdminUserDetail) => {
    setResettingUser(user);
    resetForm.resetFields();
    setIsResetOpen(true);
  };

  const handleResetPasswordSubmit = async (values: any) => {
    if (!resettingUser) return;
    try {
      await adminService.resetPassword(resettingUser.id, values.password);
      message.success("Şifre başarıyla sıfırlandı");
      setIsResetOpen(false);
    } catch (err: any) {
      message.error(err.message || "Şifre sıfırlama başarısız");
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      await adminService.deleteUser(userId);
      message.success("Kullanıcı başarıyla silindi");
      fetchUsers();
    } catch (err: any) {
      message.error(err.message || "Kullanıcı silinemedi");
    }
  };

  const handleToggleBan = async (user: AdminUserDetail) => {
    try {
      if (user.bannedAt) {
        await adminService.unbanUser(user.id);
        message.success("Kullanıcının yasağı kaldırıldı");
      } else {
        await adminService.banUser(user.id);
        message.success("Kullanıcı yasaklandı");
      }
      fetchUsers();
    } catch (err: any) {
      message.error(err.message || "İşlem başarısız");
    }
  };

  // No-op local filters, handled by backend API

  const columns = [
    {
      title: "Kullanıcı",
      key: "user",
      render: (_: any, record: AdminUserDetail) => (
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Avatar src={record.avatarUrl} style={{ background: "#a855f7" }}>
            {record.displayName[0]?.toUpperCase()}
          </Avatar>
          <div>
            <div style={{ fontWeight: "600", color: "#ffffff" }}>{record.displayName}</div>
            <div style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.45)" }}>
              @{record.username}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "E-posta",
      key: "email",
      render: (_: any, record: AdminUserDetail) => (
        <div>
          <div>{record.email || "-"}</div>
          {record.email && (
            <Tag color={record.emailVerified ? "success" : "warning"} style={{ marginTop: "4px" }}>
              {record.emailVerified ? "Doğrulanmış" : "Doğrulanmamış"}
            </Tag>
          )}
        </div>
      ),
    },
    {
      title: "Rol",
      dataIndex: "role",
      key: "role",
      render: (role: string) => (
        <Tag color={role === "admin" ? "purple" : "blue"}>
          {role === "admin" ? "Yönetici" : "Üye"}
        </Tag>
      ),
    },
    {
      title: "Durum",
      key: "status",
      render: (_: any, record: AdminUserDetail) => (
        <Tag color={record.bannedAt ? "red" : "green"}>
          {record.bannedAt ? "Yasaklı" : "Aktif"}
        </Tag>
      ),
    },
    {
      title: "Kayıt Tarihi",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (date: string) => new Date(date).toLocaleDateString("tr-TR"),
    },
    {
      title: "İşlemler",
      key: "actions",
      render: (_: any, record: AdminUserDetail) => {
        const isSelf = record.id === currentUserId;
        return (
          <Space size="middle">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => handleEditClick(record)}
              style={{ color: isSelf ? "rgba(255, 255, 255, 0.25)" : "#3b82f6" }}
              title={isSelf ? "Kendi hesabınızı düzenleyemezsiniz" : "Düzenle"}
              disabled={isSelf}
            />
            <Button
              type="text"
              icon={<LockOutlined />}
              onClick={() => handleResetPasswordClick(record)}
              style={{ color: isSelf ? "rgba(255, 255, 255, 0.25)" : "#fbbf24" }}
              title={isSelf ? "Kendi şifrenizi buradan sıfırlayamazsınız" : "Şifre Sıfırla"}
              disabled={isSelf}
            />
            <Popconfirm
              title={`Kullanıcıyı ${record.bannedAt ? "aktif etmek" : "yasaklamak"} istediğinize emin misiniz?`}
              onConfirm={() => handleToggleBan(record)}
              okText="Evet"
              cancelText="Hayır"
              disabled={isSelf}
            >
              <Button
                type="text"
                icon={<StopOutlined />}
                style={{ color: isSelf ? "rgba(255, 255, 255, 0.25)" : (record.bannedAt ? "#10b981" : "#ef4444") }}
                title={isSelf ? "Kendi hesabınızı yasaklayamazsınız" : (record.bannedAt ? "Yasağı Kaldır" : "Yasakla")}
                disabled={isSelf}
              />
            </Popconfirm>
            <Popconfirm
              title="Kullanıcıyı silmek istediğinize emin misiniz? Bu işlem geri alınamaz!"
              onConfirm={() => handleDeleteUser(record.id)}
              okText="Evet"
              cancelText="Hayır"
              disabled={record.role === "admin" || isSelf}
            >
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                disabled={record.role === "admin" || isSelf}
                title={isSelf ? "Kendi hesabınızı silemezsiniz" : "Sil"}
              />
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", height: "100%" }}>
      <div>
        <h1 style={{ fontSize: "24px", fontWeight: "700", margin: "0 0 4px 0", color: "#ffffff" }}>
          Kullanıcı Yönetimi
        </h1>
        <p style={{ margin: 0, color: "rgba(255, 255, 255, 0.45)", fontSize: "14px" }}>
          Kullanıcı hesaplarını görüntüleyin, düzenleyin, şifrelerini sıfırlayın veya yasaklayın
        </p>
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
          placeholder="İsim, kullanıcı adı veya e-posta ara..."
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
          value={roleFilter}
          onChange={setRoleFilter}
          style={{ width: "150px" }}
          dropdownStyle={{ background: "#1f1f1f" }}
          options={[
            { value: "all", label: "Tüm Roller" },
            { value: "admin", label: "Yöneticiler" },
            { value: "member", label: "Üyeler" },
          ]}
        />

        <Select
          defaultValue="all"
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ width: "150px" }}
          dropdownStyle={{ background: "#1f1f1f" }}
          options={[
            { value: "all", label: "Tüm Durumlar" },
            { value: "active", label: "Aktif Kullanıcılar" },
            { value: "banned", label: "Yasaklı Kullanıcılar" },
          ]}
        />

        <Button
          type="primary"
          onClick={fetchUsers}
          style={{ background: "#a855f7", borderColor: "#a855f7" }}
        >
          Yenile
        </Button>
      </div>

      {/* Users Table */}
      <Table
        dataSource={users}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        style={{
          background: "rgba(20, 20, 20, 0.4)",
          borderRadius: "12px",
          overflow: "hidden",
        }}
      />

      {/* Edit Drawer */}
      <Drawer
        title={<span style={{ color: "#ffffff" }}>Profil Düzenle</span>}
        placement="right"
        onClose={() => setIsEditOpen(false)}
        open={isEditOpen}
        width={400}
        headerStyle={{ background: "#141414", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
        bodyStyle={{ background: "#141414" }}
        extra={
          <Space>
            <Button onClick={() => setIsEditOpen(false)} style={{ color: "#ffffff", background: "transparent", borderColor: "rgba(255,255,255,0.2)" }}>Kapat</Button>
            <Button
              type="primary"
              onClick={() => editForm.submit()}
              style={{ background: "#a855f7", borderColor: "#a855f7" }}
            >
              Kaydet
            </Button>
          </Space>
        }
      >
        <Form form={editForm} layout="vertical" onFinish={handleEditSubmit}>
          <Form.Item
            name="displayName"
            label={<span style={{ color: "rgba(255,255,255,0.85)" }}>Görünen Ad</span>}
            rules={[{ required: true, message: "Görünen ad girilmelidir" }]}
          >
            <Input style={{ background: "rgba(15, 15, 15, 0.8)", borderColor: "rgba(255, 255, 255, 0.08)", color: "#ffffff" }} />
          </Form.Item>

          <Form.Item
            name="email"
            label={<span style={{ color: "rgba(255,255,255,0.85)" }}>E-posta Adresi</span>}
            rules={[{ type: "email", message: "Geçerli bir e-posta girin" }]}
          >
            <Input style={{ background: "rgba(15, 15, 15, 0.8)", borderColor: "rgba(255, 255, 255, 0.08)", color: "#ffffff" }} />
          </Form.Item>

          <Form.Item
            name="bio"
            label={<span style={{ color: "rgba(255,255,255,0.85)" }}>Biyografi</span>}
          >
            <Input.TextArea rows={4} style={{ background: "rgba(15, 15, 15, 0.8)", borderColor: "rgba(255, 255, 255, 0.08)", color: "#ffffff" }} />
          </Form.Item>

          <Form.Item
            name="role"
            label={<span style={{ color: "rgba(255,255,255,0.85)" }}>Sistem Rolü</span>}
            rules={[{ required: true }]}
          >
            <Select
              dropdownStyle={{ background: "#1f1f1f" }}
              options={[
                { value: "admin", label: "Yönetici (Admin)" },
                { value: "member", label: "Üye (Member)" },
              ]}
            />
          </Form.Item>
        </Form>
      </Drawer>

      {/* Reset Password Modal */}
      <Modal
        title={<span style={{ color: "#ffffff" }}>Şifre Sıfırla</span>}
        open={isResetOpen}
        onCancel={() => setIsResetOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setIsResetOpen(false)} style={{ color: "#ffffff", background: "transparent", borderColor: "rgba(255,255,255,0.2)" }}>
            İptal
          </Button>,
          <Button
            key="submit"
            type="primary"
            onClick={() => resetForm.submit()}
            style={{ background: "#a855f7", borderColor: "#a855f7" }}
          >
            Şifreyi Güncelle
          </Button>,
        ]}
        style={{ background: "#141414" }}
        bodyStyle={{ background: "#141414" }}
      >
        <div style={{ color: "rgba(255,255,255,0.6)", marginBottom: "16px" }}>
          <strong>@{resettingUser?.username}</strong> kullanıcısı için yeni bir şifre tanımlayın.
        </div>
        <Form form={resetForm} layout="vertical" onFinish={handleResetPasswordSubmit}>
          <Form.Item
            name="password"
            label={<span style={{ color: "rgba(255,255,255,0.85)" }}>Yeni Şifre</span>}
            rules={[
              { required: true, message: "Yeni şifre girilmelidir" },
              { min: 8, message: "Şifre en az 8 karakter olmalıdır" },
            ]}
          >
            <Input.Password style={{ background: "rgba(15, 15, 15, 0.8)", borderColor: "rgba(255, 255, 255, 0.08)", color: "#ffffff" }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
