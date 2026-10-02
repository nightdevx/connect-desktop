import { toErrorMessage } from "@shared/error-message";
import { useCallback, useEffect, useRef, useState } from "react";
import { Table, Input, Button, Modal, Form, Select, Drawer, Space, Popconfirm, Tooltip, Switch } from "antd";
import {
  SearchOutlined,
  EditOutlined,
  LockOutlined,
  DeleteOutlined,
  StopOutlined,
  DisconnectOutlined,
  PictureOutlined,
  MailOutlined,
  UndoOutlined,
  AudioMutedOutlined,
  ReloadOutlined,
  UserOutlined,
  ThunderboltOutlined,
  CheckCircleFilled,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import { getDisplayInitials, hueStyle } from "@/ui/person-style";
import { ModalHeading } from "@/ui/modal-heading";
import adminService from "../services/admin-service";
import type {
  AdminUserDetail,
  PrivacyAudience,
  UserRestriction,
  UserRole,
} from "@shared/auth-contracts";
import { USER_RESTRICTIONS } from "@shared/auth-contracts";
import { AdminUserRelationsPanel, AdminUserSessions } from "./admin-user-panels";
import type { TablePaginationConfig } from "antd";
import { AdminPageHeader, AdminPerson, AdminSection, AdminState } from "./admin-primitives";
import { toast } from "@/services/toast";

interface EditUserFormValues {
  username: string;
  displayName: string;
  email?: string | null;
  emailVerified?: boolean;
  bio?: string | null;
  role: UserRole;
  adminNote?: string;
  allowDmFrom?: PrivacyAudience;
  allowCallsFrom?: PrivacyAudience;
  allowFriendRequests?: boolean;
  restrictions?: UserRestriction[];
  reason?: string;
  banned?: boolean;
}

interface ResetPasswordFormValues {
  password: string;
}


const ROLE_LABELS: Record<string, string> = {
  owner: "Sahip",
  admin: "Yönetici",
  moderator: "Moderatör",
  member: "Üye",
};

// antd hands the pagination object back with every field optional; this is what
// a page-size reset falls back to.
const DEFAULT_PAGE_SIZE = 10;

interface AdminUsersProps {
  // Passed down rather than read from useAuthSession.
  //
  // This screen mounted that whole hook to learn one id, and the hook is not a
  // getter: it registers a second session-expired IPC listener, and its
  // ["auth-session"] query carries no staleTime, so opening this page fired a
  // fresh GET /auth/session — which is where the "Kimlik doğrulandı" that flashed
  // in the status bar on the way in came from. Every other admin screen opens
  // without it.
  currentUserId?: string;
}

export default function AdminUsers({ currentUserId }: AdminUsersProps) {
  const [users, setUsers] = useState<AdminUserDetail[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // Edit Drawer State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUserDetail | null>(null);
  const [editForm] = Form.useForm();

  // Reset Password Modal State
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resettingUser, setResettingUser] = useState<AdminUserDetail | null>(null);
  const [resetForm] = Form.useForm();

  const fetchUsers = useCallback(
    async (page = currentPage, size = pageSize): Promise<void> => {
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
      // The drawer's account actions read their own labels off this record --
      // "E-postayı Doğrula" vs "Doğrulamayı Geri Al" is the same button. Left
      // on the copy taken when the drawer opened, every one of them still
      // offered the action that had just been carried out.
      setEditingUser((current) =>
        current ? (res.users.find((user) => user.id === current.id) ?? current) : current,
      );
    } catch (err) {
      toast.error(toErrorMessage(err, "Kullanıcılar alınamadı"));
    } finally {
      setLoading(false);
    }
    },
    [currentPage, pageSize, searchText, roleFilter, statusFilter],
  );

  // A narrowed result set has fewer pages; staying on page 4 of a one-page
  // result showed an empty table.
  useEffect(() => {
    setCurrentPage(1);
  }, [searchText, roleFilter, statusFilter]);

  // One debounced fetch for every input, page included.
  //
  // It used to be two effects — one for the filters, one for the page — and a
  // filter change while past page 1 ran both: page 1 was fetched, the page
  // reset fired, and page 1 was fetched again. Two spinners for one keystroke.
  // The shared timer collapses that into a single request.
  //
  // The FIRST run is not debounced. Debouncing it charged the empty screen 300ms
  // before the request even left, on every visit to this page, for a keystroke
  // that had not happened.
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      void fetchUsers(currentPage, pageSize);
      return;
    }

    const timer = setTimeout(() => fetchUsers(currentPage, pageSize), 300);
    return () => clearTimeout(timer);
    // fetchUsers is memoised on exactly the filters and the page, so depending on
    // it re-runs this on precisely the same changes the old literal list named —
    // and it can no longer close over a filter value a render out of date.
  }, [currentPage, pageSize, fetchUsers]);

  const handleTableChange = (pagination: TablePaginationConfig): void => {
    setCurrentPage(pagination.current ?? 1);
    setPageSize(pagination.pageSize ?? DEFAULT_PAGE_SIZE);
  };

  const handleEditClick = (user: AdminUserDetail) => {
    setEditingUser(user);
    editForm.setFieldsValue({
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      emailVerified: user.emailVerified,
      bio: user.bio,
      role: user.role,
      adminNote: user.adminNote,
      allowDmFrom: user.allowDmFrom,
      allowCallsFrom: user.allowCallsFrom,
      allowFriendRequests: user.allowFriendRequests,
      restrictions: user.restrictions ?? [],
    });
    setIsEditOpen(true);
  };

  const handleEditSubmit = async (values: EditUserFormValues): Promise<void> => {
    if (!editingUser) return;
    try {
      await adminService.updateUser(editingUser.id, {
        username: values.username,
        displayName: values.displayName,
        email: values.email || null,
        emailVerified: values.emailVerified,
        bio: values.bio || null,
        role: values.role,
        adminNote: values.adminNote ?? "",
        allowDmFrom: values.allowDmFrom,
        allowCallsFrom: values.allowCallsFrom,
        allowFriendRequests: values.allowFriendRequests,
        restrictions: values.restrictions ?? [],
        reason: values.reason,
      });
      toast.success("Kullanıcı başarıyla güncellendi");
      setIsEditOpen(false);
      fetchUsers();
    } catch (err) {
      toast.error(toErrorMessage(err, "Güncelleme başarısız"));
    }
  };

  const handleResetPasswordClick = (user: AdminUserDetail) => {
    setResettingUser(user);
    resetForm.resetFields();
    setIsResetOpen(true);
  };

  const handleResetPasswordSubmit = async (values: ResetPasswordFormValues): Promise<void> => {
    if (!resettingUser) return;
    try {
      await adminService.resetPassword(resettingUser.id, values.password);
      toast.success("Şifre başarıyla sıfırlandı");
      setIsResetOpen(false);
    } catch (err) {
      toast.error(toErrorMessage(err, "Şifre sıfırlama başarısız"));
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      await adminService.deleteUser(userId);
      toast.success("Kullanıcı başarıyla silindi");
      setIsEditOpen(false);
      fetchUsers();
    } catch (err) {
      toast.error(toErrorMessage(err, "Kullanıcı silinemedi"));
    }
  };

  // Ends every session and pulls them out of every voice room, without the
  // ban that used to be the only way to do it. For a shared password or a
  // machine left signed in, a ban is both too visible and too blunt.
  const handleForceLogout = async (user: AdminUserDetail) => {
    try {
      await adminService.forceLogout(user.id);
      toast.success(`@${user.username} oturumları sonlandırıldı`);
    } catch (err) {
      toast.error(toErrorMessage(err, "Oturumlar sonlandırılamadı"));
    }
  };

  // The four things the panel could SHOW but not change. Each one existed as
  // state on the row — a picture, a verified badge, a deletion countdown, a mute
  // icon — with no way for an admin to act on it.
  const handleClearMedia = async (user: AdminUserDetail): Promise<void> => {
    try {
      await adminService.clearProfileMedia(user.id);
      toast.success("Profil görselleri kaldırıldı.");
      await fetchUsers();
    } catch (error) {
      toast.error(toErrorMessage(error, "Görseller kaldırılamadı"));
    }
  };

  // The address comes from the account's last sign-in, so this needs no CIDR
  // typed from somewhere else. Sessions are ended with it: an IP ban that only
  // takes effect at the next reconnect is not a ban anybody notices.
  const handleBanUserIp = async (user: AdminUserDetail): Promise<void> => {
    try {
      const result = await adminService.ops.banUserIp({
        userId: user.id,
        reason: `@${user.username} hesabının adresi yasaklandı`,
      });
      if (!result.ok || !result.data) {
        throw new Error(result.error?.message || "IP yasaklanamadı");
      }
      toast.success(`${result.data.ban.cidr} yasaklandı`);
      await fetchUsers();
    } catch (error) {
      toast.error(toErrorMessage(error, "IP yasaklanamadı"));
    }
  };

  const handleToggleEmailVerified = async (user: AdminUserDetail): Promise<void> => {
    try {
      await adminService.setEmailVerified(user.id, !user.emailVerified);
      toast.success(
        user.emailVerified ? "Doğrulama geri alındı." : "E-posta doğrulandı.",
      );
      await fetchUsers();
    } catch (error) {
      toast.error(toErrorMessage(error, "Doğrulama durumu değiştirilemedi"));
    }
  };

  const handleCancelDeletion = async (user: AdminUserDetail): Promise<void> => {
    try {
      await adminService.cancelDeletion(user.id);
      toast.success("Hesap silme talebi iptal edildi.");
      await fetchUsers();
    } catch (error) {
      toast.error(toErrorMessage(error, "Silme talebi iptal edilemedi"));
    }
  };

  // Indefinite on purpose: a timed mute is a lobby decision made in the moment,
  // and this reaches somebody who is not in a lobby at all.
  const handleServerMute = async (user: AdminUserDetail): Promise<void> => {
    try {
      await adminService.setVoiceMute(user.id, true);
      toast.success(`@${user.username} sunucuda susturuldu.`);
    } catch (error) {
      toast.error(toErrorMessage(error, "Susturma uygulanamadı"));
    }
  };

  const handleToggleBan = async (user: AdminUserDetail) => {
    try {
      if (user.bannedAt) {
        await adminService.unbanUser(user.id);
        toast.success("Kullanıcının yasağı kaldırıldı");
      } else {
        await adminService.banUser(user.id);
        toast.success("Kullanıcı yasaklandı");
      }
      fetchUsers();
    } catch (err) {
      toast.error(toErrorMessage(err, "İşlem başarısız"));
    }
  };

  // Four buttons, not nine.
  //
  // The action cell used to carry every operation this screen can perform, as
  // nine unlabelled icons in a row: a padlock, a plug, a stop sign, a picture,
  // an envelope, a crossed-out microphone, an undo arrow and two more. It was
  // the widest column on the table, it read as a toolbar rather than as a set
  // of choices, and the only way to learn what any of them did was to rest the
  // pointer on it and wait for the operating system's tooltip.
  //
  // What is left here is the four things done often enough to be worth a click
  // from the row. The other five are labelled buttons in the drawer, under the
  // profile they act on -- see "Hesap İşlemleri" below.
  const columns = [
    {
      title: "Kullanıcı",
      key: "user",
      ellipsis: true,
      render: (_value: unknown, record: AdminUserDetail) => (
        <AdminPerson
          userId={record.id}
          name={record.displayName || record.username}
          handle={`@${record.username}`}
          avatarUrl={record.avatarUrl}
        />
      ),
    },
    {
      title: "E-posta",
      key: "email",
      ellipsis: true,
      responsive: ["lg" as const],
      render: (_value: unknown, record: AdminUserDetail) =>
        record.email ? (
          <span className="ct-admin-inline">
            <Tooltip title={record.emailVerified ? "Doğrulanmış" : "Doğrulanmamış"}>
              {record.emailVerified ? (
                <CheckCircleFilled className="ct-icon-success" />
              ) : (
                <ExclamationCircleOutlined className="ct-icon-warning" />
              )}
            </Tooltip>
            <span className="ct-admin-ellipsis">{record.email}</span>
          </span>
        ) : (
          <span className="ct-admin-muted">—</span>
        ),
    },
    {
      title: "Rol",
      dataIndex: "role",
      key: "role",
      width: 120,
      render: (role: UserRole) => (
        <AdminState tone={role === "member" ? "muted" : "info"}>
          {ROLE_LABELS[role] ?? role}
        </AdminState>
      ),
    },
    {
      title: "Durum",
      key: "status",
      width: 130,
      // A pending deletion used to be visible only as a tenth icon appearing
      // in the action row; it belongs in the column that answers "what is going
      // on with this account".
      render: (_value: unknown, record: AdminUserDetail) =>
        record.bannedAt ? (
          <AdminState tone="danger">Yasaklı</AdminState>
        ) : record.deletionScheduledAt ? (
          <AdminState tone="warn">Silinecek</AdminState>
        ) : (
          <AdminState tone="ok">Aktif</AdminState>
        ),
    },
    {
      title: "Kayıt",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 110,
      responsive: ["xl" as const],
      render: (date: string) => (
        <span className="ct-admin-muted">{new Date(date).toLocaleDateString("tr-TR")}</span>
      ),
    },
    {
      title: "",
      key: "actions",
      width: 152,
      align: "right" as const,
      render: (_value: unknown, record: AdminUserDetail) => {
        const isSelf = record.id === currentUserId;
        return (
          <div className="ct-admin-actions">
            <Tooltip
              title={
                isSelf
                  ? "Kendi hesabınızı düzenleyemezsiniz"
                  : "Düzenle ve hesap işlemleri"
              }
            >
              <Button
                type="text"
                icon={<EditOutlined />}
                onClick={() => handleEditClick(record)}
                disabled={isSelf}
                aria-label="Düzenle"
              />
            </Tooltip>
            <Tooltip
              title={
                isSelf
                  ? "Kendi şifrenizi buradan sıfırlayamazsınız"
                  : "Şifre sıfırla"
              }
            >
              <Button
                type="text"
                icon={<LockOutlined />}
                onClick={() => handleResetPasswordClick(record)}
                disabled={isSelf}
                aria-label="Şifre sıfırla"
              />
            </Tooltip>
            <Popconfirm
              title={`Kullanıcıyı ${record.bannedAt ? "aktif etmek" : "yasaklamak"} istediğinize emin misiniz?`}
              onConfirm={() => handleToggleBan(record)}
              okText="Evet"
              cancelText="Hayır"
              disabled={isSelf}
            >
              <Tooltip
                title={
                  isSelf
                    ? "Kendi hesabınızı yasaklayamazsınız"
                    : record.bannedAt
                      ? "Yasağı kaldır"
                      : "Yasakla"
                }
              >
                <Button
                  type="text"
                  icon={record.bannedAt ? <UndoOutlined /> : <StopOutlined />}
                  disabled={isSelf}
                  aria-label={record.bannedAt ? "Yasağı kaldır" : "Yasakla"}
                />
              </Tooltip>
            </Popconfirm>
            <Popconfirm
              title="Kullanıcıyı silmek istediğinize emin misiniz? Bu işlem geri alınamaz!"
              onConfirm={() => handleDeleteUser(record.id)}
              okText="Evet"
              cancelText="Hayır"
              disabled={record.role === "admin" || isSelf}
            >
              <Tooltip
                title={
                  isSelf
                    ? "Kendi hesabınızı silemezsiniz"
                    : record.role === "admin"
                      ? "Yönetici hesabı silinemez"
                      : "Sil"
                }
              >
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  disabled={record.role === "admin" || isSelf}
                  aria-label="Sil"
                />
              </Tooltip>
            </Popconfirm>
          </div>
        );
      },
    },
  ];

  return (
    <div className="ct-admin-page">
      <AdminPageHeader
        title="Kullanıcılar"
        description="Kullanıcı hesaplarını görüntüleyin, düzenleyin, şifrelerini sıfırlayın veya yasaklayın."
        actions={
          <Button
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => fetchUsers()}
          >
            Yenile
          </Button>
        }
      />

      {/* One card: the search and filters on its top band, the table under
          them. "Yenile" stays in the page header, in the same place as on every
          other screen. */}
      <AdminSection
        title="Hesaplar"
        icon={<UserOutlined />}
        hint={`${total} kullanıcı`}
        flush
        toolbar={
          <>
            <Input
              allowClear
              placeholder="İsim, kullanıcı adı veya e-posta ara..."
              prefix={<SearchOutlined className="ct-admin-muted" />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="ct-admin-toolbar-search"
            />

            {/* No dropdownStyle here or anywhere else on this screen: it
                hardcoded #1f1f1f, which is the one colour the theme cannot
                reach. The ConfigProvider already paints these. */}
            <Select
              value={roleFilter}
              onChange={setRoleFilter}
              className="ct-admin-toolbar-filter"
              options={[
                { value: "all", label: "Tüm roller" },
                { value: "admin", label: "Yöneticiler" },
                { value: "member", label: "Üyeler" },
              ]}
            />

            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              className="ct-admin-toolbar-filter"
              options={[
                { value: "all", label: "Tüm durumlar" },
                { value: "active", label: "Aktif" },
                { value: "banned", label: "Yasaklı" },
              ]}
            />
          </>
        }
      >
        <Table
          size="middle"
          dataSource={users}
          columns={columns}
          rowKey="id"
          loading={loading}
          onChange={handleTableChange}
          locale={{
            emptyText: searchText
              ? "Bu aramayla eşleşen kullanıcı yok."
              : "Henüz kullanıcı yok.",
          }}
          pagination={{
            current: currentPage,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: ["10", "20", "50", "100"],
            showTotal: (count) => `${count} kullanıcı`,
          }}
          // No scroll.y: a viewport height for a table inside the panel cut the
          // last row in half and pushed the pagination off the bottom. The page
          // scrolls instead; scroll.x keeps the columns from crushing.
          //
          // ponytail: no sticky header; pass antd's `sticky` a getContainer
          // pointing at .ct-admin-panel-content if the loss is felt.
          tableLayout="fixed"
          className="ct-admin-table-wrap"
        />
      </AdminSection>

      {/* Edit Drawer */}
      <Drawer
        rootClassName="ct-admin-drawer"
        title={
          editingUser ? (
            <div className="ct-admin-drawer-title">
              {/* A span, not antd's Avatar: the drawer mounts hidden, and Avatar
                  measures its initials at mount -- in a zero-width box it
                  scaled them down to a speck. */}
              <span
                className="ct-admin-face large ct-hued"
                style={hueStyle(editingUser.id)}
                aria-hidden="true"
              >
                {editingUser.avatarUrl ? (
                  <img src={editingUser.avatarUrl} alt="" />
                ) : (
                  getDisplayInitials(editingUser.displayName || editingUser.username)
                )}
              </span>
              <div>
                <strong>{editingUser.displayName}</strong>
                <span>@{editingUser.username}</span>
              </div>
            </div>
          ) : (
            "Kullanıcı"
          )
        }
        placement="right"
        onClose={() => setIsEditOpen(false)}
        open={isEditOpen}
        size={420}
        extra={
          <Space>
            <Button onClick={() => setIsEditOpen(false)}>Kapat</Button>
            <Button type="primary" onClick={() => editForm.submit()}>
              Kaydet
            </Button>
          </Space>
        }
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={handleEditSubmit}
          className="ct-admin-drawer-form"
        >
          <h4 className="ct-admin-form-heading">Profil</h4>
          <Form.Item
            name="username"
            label="Kullanıcı Adı"
            rules={[
              { required: true, message: "Kullanıcı adı girilmelidir" },
              {
                pattern: /^[a-z0-9._-]{3,32}$/,
                message: "3-32 karakter; küçük harf, rakam, _ - . olabilir",
              },
            ]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="displayName"
            label="Görünen Ad"
            rules={[{ required: true, message: "Görünen ad girilmelidir" }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="email"
            label="E-posta Adresi"
            rules={[{ type: "email", message: "Geçerli bir e-posta girin" }]}
          >
            <Input />
          </Form.Item>

          <Form.Item name="emailVerified" label="E-posta Doğrulanmış" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item name="bio" label="Biyografi">
            <Input.TextArea rows={3} />
          </Form.Item>

          <h4 className="ct-admin-form-heading">Yetki ve gizlilik</h4>
          <Form.Item name="role" label="Sistem Rolü" rules={[{ required: true }]}>
            <Select
              options={[
                { value: "owner", label: "Sahip (Owner)" },
                { value: "admin", label: "Yönetici (Admin)" },
                { value: "moderator", label: "Moderatör" },
                { value: "member", label: "Üye (Member)" },
              ]}
            />
          </Form.Item>

          <Form.Item name="allowDmFrom" label="Özel Mesaj İzni">
            <Select
              options={[
                { value: "everyone", label: "Herkes" },
                { value: "friends", label: "Yalnızca arkadaşlar" },
              ]}
            />
          </Form.Item>

          <Form.Item name="allowCallsFrom" label="Arama İzni">
            <Select
              options={[
                { value: "everyone", label: "Herkes" },
                { value: "friends", label: "Yalnızca arkadaşlar" },
              ]}
            />
          </Form.Item>

          <Form.Item name="allowFriendRequests" label="Arkadaşlık İsteği Alır" valuePropName="checked">
            <Switch />
          </Form.Item>

          {/* A ban was the only tool for "stop changing your name every ten
              minutes", and it is far too big for that. Each switch here closes
              one field on the account's own settings screen and nothing else. */}
          <h4 className="ct-admin-form-heading">Kısıtlamalar ve not</h4>
          <Form.Item
            name="restrictions"
            label="Kapatılan Düzenlemeler"
            extra="Seçilen alanları kullanıcı kendi ayarlarından değiştiremez. Yöneticiler yine değiştirebilir."
          >
            <Select
              mode="multiple"
              allowClear
              placeholder="Kısıtlama yok"
              options={USER_RESTRICTIONS.map((entry) => ({
                value: entry.id,
                label: entry.label,
              }))}
            />
          </Form.Item>

          <Form.Item name="adminNote" label="Yönetici Notu" extra="Yalnızca yöneticiler görür.">
            <Input.TextArea rows={2} maxLength={2000} />
          </Form.Item>

          <Form.Item name="reason" label="Gerekçe" className="!mb-0">
            <Input placeholder="Bu düzenlemenin gerekçesi (denetim kaydına yazılır)" maxLength={280} />
          </Form.Item>
        </Form>

        {editingUser && <AdminUserSessions user={editingUser} />}
        {editingUser && <AdminUserRelationsPanel user={editingUser} />}

        {/* The five operations that used to be unlabelled icons in the table
            row. Here each one says what it does, sits under the profile it acts
            on, and has room for the confirmation to explain itself. They apply
            immediately — none of them is part of the form above, so "Kaydet"
            has nothing to do with them. */}
        {editingUser ? (
          <section className="ct-admin-drawer-block">
            <header>
              <h4>
                <ThunderboltOutlined /> Hesap işlemleri
              </h4>
            </header>
            <div className="ct-admin-action-list">
              <Popconfirm
                title={`@${editingUser.username} kullanıcısının tüm oturumlarını kapatmak istediğinize emin misiniz?`}
                onConfirm={() => handleForceLogout(editingUser)}
                okText="Evet"
                cancelText="Hayır"
              >
                <Button icon={<DisconnectOutlined />}>Oturumları Kapat</Button>
              </Popconfirm>

              <Button
                icon={<MailOutlined />}
                className={editingUser.emailVerified ? "ct-icon-success" : undefined}
                onClick={() => void handleToggleEmailVerified(editingUser)}
                disabled={!editingUser.email && !editingUser.emailVerified}
              >
                {editingUser.emailVerified
                  ? "E-posta Doğrulamasını Geri Al"
                  : "E-postayı Doğrulanmış İşaretle"}
              </Button>

              <Popconfirm
                title="Bu kullanıcının profil resmi ve afişi kaldırılsın mı?"
                onConfirm={() => void handleClearMedia(editingUser)}
                okText="Evet"
                cancelText="Hayır"
              >
                <Button icon={<PictureOutlined />}>
                  Profil Görsellerini Kaldır
                </Button>
              </Popconfirm>

              <Popconfirm
                title={`@${editingUser.username} sunucu genelinde susturulsun mu? Birebir aramalar dışında hiçbir lobide konuşamaz.`}
                onConfirm={() => void handleServerMute(editingUser)}
                okText="Evet"
                cancelText="Hayır"
              >
                <Button icon={<AudioMutedOutlined />}>Sunucuda Sustur</Button>
              </Popconfirm>

              <Popconfirm
                title={
                  editingUser.lastIp
                    ? `${editingUser.lastIp} adresi yasaklansın ve oturumları kapatılsın mı?`
                    : "Bu hesabın kayıtlı bir adresi yok."
                }
                onConfirm={() => void handleBanUserIp(editingUser)}
                okText="Evet"
                cancelText="Hayır"
                disabled={!editingUser.lastIp}
              >
                <Button icon={<StopOutlined />} danger disabled={!editingUser.lastIp}>
                  {editingUser.lastIp
                    ? `IP'sini Yasakla (${editingUser.lastIp})`
                    : "IP'si Bilinmiyor"}
                </Button>
              </Popconfirm>

              {editingUser.deletionScheduledAt ? (
                <Popconfirm
                  title="Bu hesabın silinme talebi iptal edilsin mi?"
                  onConfirm={() => void handleCancelDeletion(editingUser)}
                  okText="Evet"
                  cancelText="Hayır"
                >
                  <Button icon={<UndoOutlined />} className="ct-icon-success">
                    Silme Talebini İptal Et
                  </Button>
                </Popconfirm>
              ) : null}
            </div>
          </section>
        ) : null}
      </Drawer>

      {/* Reset Password Modal */}
      <Modal
        rootClassName="ct-modal"
        title={
          <ModalHeading
            icon={<LockOutlined />}
            title="Şifre Sıfırla"
            description={
              resettingUser
                ? `@${resettingUser.username} kullanıcısı için yeni bir şifre tanımla.`
                : undefined
            }
          />
        }
        open={isResetOpen}
        onCancel={() => setIsResetOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setIsResetOpen(false)}>
            İptal
          </Button>,
          <Button key="submit" type="primary" onClick={() => resetForm.submit()}>
            Şifreyi Güncelle
          </Button>,
        ]}
      >
        <Form form={resetForm} layout="vertical" onFinish={handleResetPasswordSubmit}>
          <Form.Item
            name="password"
            label="Yeni Şifre"
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
