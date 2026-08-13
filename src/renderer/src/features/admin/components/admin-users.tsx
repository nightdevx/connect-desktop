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
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Edit Drawer State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUserDetail | null>(null);
  const [editForm] = Form.useForm();

  // Reset Password Modal State
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resettingUser, setResettingUser] = useState<AdminUserDetail | null>(null);
  const [resetForm] = Form.useForm();

  const fetchUsers = async (page = currentPage, size = pageSize) => {
    try {
      setLoading(true);
      const offset = (page - 1) * size;
      const res = await adminService.listUsers({
        search: searchText || undefined,
        role: roleFilter !== "all" ? roleFilter : undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        limit: size,
        offset,
      });
      setUsers(res.users);
      setTotal(res.total || 0);
    } catch (err: any) {
      message.error(err.message || "Kullanıcılar alınamadı");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchUsers(1);
      setCurrentPage(1);
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchText, roleFilter, statusFilter]);

  useEffect(() => {
    fetchUsers(currentPage, pageSize);
  }, [currentPage, pageSize]);

  const handleTableChange = (pagination: any) => {
    setCurrentPage(pagination.current);
    setPageSize(pagination.pageSize);
  };

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
        <div className="ct-admin-table-user">
          <Avatar src={record.avatarUrl} className="ct-admin-avatar">
            {record.displayName[0]?.toUpperCase()}
          </Avatar>
          <div>
            <div >{record.displayName}</div>
            <div className="ct-admin-muted">
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
            <Tag color={record.emailVerified ? "success" : "warning"} >
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
              className="ct-icon-info"
              title={isSelf ? "Kendi hesabınızı düzenleyemezsiniz" : "Düzenle"}
              disabled={isSelf}
            />
            <Button
              type="text"
              icon={<LockOutlined />}
              onClick={() => handleResetPasswordClick(record)}
              className="ct-icon-warning"
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
                className={record.bannedAt ? "ct-icon-success" : "ct-icon-danger"}
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
    <div className="ct-admin-page">
      <div>
        <h1 >
          Kullanıcı Yönetimi
        </h1>
        <p >
          Kullanıcı hesaplarını görüntüleyin, düzenleyin, şifrelerini sıfırlayın veya yasaklayın
        </p>
      </div>

      {/* Filters Bar */}
      <div
        className="ct-admin-toolbar"
      >
        <Input
          placeholder="İsim, kullanıcı adı veya e-posta ara..."
          prefix={<SearchOutlined className="ct-admin-muted" />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="ct-admin-toolbar-search"
        />

        <Select
          defaultValue="all"
          value={roleFilter}
          onChange={setRoleFilter}
          className="ct-admin-toolbar-filter"
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
          className="ct-admin-toolbar-filter"
          dropdownStyle={{ background: "#1f1f1f" }}
          options={[
            { value: "all", label: "Tüm Durumlar" },
            { value: "active", label: "Aktif Kullanıcılar" },
            { value: "banned", label: "Yasaklı Kullanıcılar" },
          ]}
        />

        <Button
          type="primary"
          onClick={() => fetchUsers()}
          
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

      {/* Edit Drawer */}
      <Drawer
        title={<span >Profil Düzenle</span>}
        placement="right"
        onClose={() => setIsEditOpen(false)}
        open={isEditOpen}
        width={400}
        headerStyle={{ background: "#141414", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
        bodyStyle={{ background: "#141414" }}
        extra={
          <Space>
            <Button onClick={() => setIsEditOpen(false)} >Kapat</Button>
            <Button
              type="primary"
              onClick={() => editForm.submit()}
              
            >
              Kaydet
            </Button>
          </Space>
        }
      >
        <Form form={editForm} layout="vertical" onFinish={handleEditSubmit}>
          <Form.Item
            name="displayName"
            label={<span >Görünen Ad</span>}
            rules={[{ required: true, message: "Görünen ad girilmelidir" }]}
          >
            <Input  />
          </Form.Item>

          <Form.Item
            name="email"
            label={<span >E-posta Adresi</span>}
            rules={[{ type: "email", message: "Geçerli bir e-posta girin" }]}
          >
            <Input  />
          </Form.Item>

          <Form.Item
            name="bio"
            label={<span >Biyografi</span>}
          >
            <Input.TextArea rows={4}  />
          </Form.Item>

          <Form.Item
            name="role"
            label={<span >Sistem Rolü</span>}
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
        rootClassName="ct-modal"
        title={<span >Şifre Sıfırla</span>}
        open={isResetOpen}
        onCancel={() => setIsResetOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setIsResetOpen(false)} >
            İptal
          </Button>,
          <Button
            key="submit"
            type="primary"
            onClick={() => resetForm.submit()}
            
          >
            Şifreyi Güncelle
          </Button>,
        ]}
      >
        <div >
          <strong>@{resettingUser?.username}</strong> kullanıcısı için yeni bir şifre tanımlayın.
        </div>
        <Form form={resetForm} layout="vertical" onFinish={handleResetPasswordSubmit}>
          <Form.Item
            name="password"
            label={<span >Yeni Şifre</span>}
            rules={[
              { required: true, message: "Yeni şifre girilmelidir" },
              { min: 8, message: "Şifre en az 8 karakter olmalıdır" },
            ]}
          >
            <Input.Password  />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
