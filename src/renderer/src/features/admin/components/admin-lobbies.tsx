import { toErrorMessage } from "@shared/error-message";
import { useCallback, useEffect, useState } from "react";
import { Table, Button, Space, Tag, Modal, Input, Popconfirm, Segmented, Select, Switch, Tooltip } from "antd";
import type { TablePaginationConfig } from "antd";
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
  StopOutlined,
  LockOutlined,
  MessageOutlined,
  KeyOutlined,
  CustomerServiceOutlined,
  DisconnectOutlined,
} from "@ant-design/icons";
import adminService from "../services/admin-service";
import type {
  AdminLobbySnapshot,
  AdminUserDetail,
  LobbyDescriptor,
  LobbyTimeout,
} from "@shared/auth-contracts";
import type { LobbyFeatureId, LobbyStateMember } from "@shared/desktop-api-types";
import {
  AdminPageHeader,
  AdminPerson,
  AdminSection,
  AdminState,
  adminDateTime,
  useTableFit,
} from "./admin-primitives";
import { toast } from "@/services/toast";
import { MODAL_WIDTH, ModalHeading } from "@/ui/modal-heading";
import { ConfirmActionModal, RoomSettingsDialog } from "@/features/workspace";

// The main room cannot be deleted (it is where everyone lands); everything
// else about it is editable.
const isDefaultRoom = (lobby: LobbyDescriptor): boolean =>
  lobby.id === "main-lobby" || lobby.createdBy === "system";

// antd hands the pagination object back with every field optional; this is what
// a page-size reset falls back to.
const DEFAULT_PAGE_SIZE = 10;

// Somebody is publishing a picture: the camera or the screen. A microphone is
// not counted: nearly everyone in a voice room has one open.
const isLive = (member: LobbyStateMember): boolean =>
  Boolean(member.cameraEnabled || member.screenSharing);

// The three privacy flags are independent — a room can be locked and password
// protected at once — so they stack, and "Herkese açık" is the empty case
// rather than a fourth flag.
const privacyStates = (lobby: LobbyDescriptor) => {
  const states = [
    lobby.isLocked ? (
      <AdminState key="locked" tone="warn" icon={<LockOutlined />}>
        Kilitli
      </AdminState>
    ) : null,
    lobby.hasPassword ? (
      <AdminState key="password" tone="warn" icon={<KeyOutlined />}>
        Şifreli
      </AdminState>
    ) : null,
  ].filter(Boolean);

  return states.length > 0 ? (
    <span className="ct-admin-states">{states}</span>
  ) : (
    <AdminState tone="ok">Herkese açık</AdminState>
  );
};

export default function AdminLobbies({ currentUserId }: { currentUserId: string }) {
  const [lobbies, setLobbies] = useState<AdminLobbySnapshot[]>([]);
  // The lobby whose timeouts are open, and what they are. Held here rather than
  // fetched with the table: a timeout list is read when somebody asks to be let
  // back in, which is rare, and loading one per row on every refresh would be a
  // request per lobby for a panel nobody had opened.
  const [timeoutLobby, setTimeoutLobby] = useState<AdminLobbySnapshot | null>(null);
  const [pendingDeleteLobby, setPendingDeleteLobby] = useState<AdminLobbySnapshot | null>(null);
  const [isDeletingLobby, setIsDeletingLobby] = useState(false);
  const [timeouts, setTimeouts] = useState<LobbyTimeout[]>([]);
  const [timeoutsLoading, setTimeoutsLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [lockedFilter, setLockedFilter] = useState("all");
  // Voice rooms and text channels are different things to operate: one has a
  // live roster and an SFU room behind it, the other is a channel nobody joins,
  // so half this table's columns say nothing for the wrong kind. Filtered
  // server-side, because the table is paged there.
  const [kindFilter, setKindFilter] = useState<"voice" | "text">("voice");
  // Only the rooms where somebody is sharing a screen or a camera, which is
  // what the separate "Canlı Yayınlar" page was for. Applied to the page being
  // shown: a room count of a few dozen fits one page.
  const [liveOnly, setLiveOnly] = useState(false);
  const [debouncedSearchText, setDebouncedSearchText] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [tableRef, fitColumns] = useTableFit();

  // Edit State
  const [editingLobby, setEditingLobby] = useState<AdminLobbySnapshot | null>(null);
  const [isSavingRoom, setIsSavingRoom] = useState(false);
  const [allUsers, setAllUsers] = useState<AdminUserDetail[]>([]);

  const fetchLobbies = useCallback(
    async (page = currentPage, size = pageSize): Promise<void> => {
    try {
      setLoading(true);
      const offset = (page - 1) * size;
      const res = await adminService.listLobbies({
        // The debounced value, not the live one: the effect that calls this is
        // keyed on the debounced value, so reading the raw box made the two
        // disagree for one render on every keystroke.
        search: debouncedSearchText || undefined,
        locked: lockedFilter !== "all" ? lockedFilter : undefined,
        kind: kindFilter,
        limit: size,
        offset,
      });
      setLobbies(res.lobbies);
      setTotal(res.total || 0);
    } catch (err) {
      toast.error(toErrorMessage(err, "Lobiler alınamadı"));
    } finally {
      setLoading(false);
    }
    },
    [currentPage, pageSize, debouncedSearchText, lockedFilter, kindFilter],
  );

  // The allow-list picker's options. This is the whole user table — avatars
  // included — so it is fetched when the edit dialog first opens, not when the
  // page loads: most visits to this screen never open it at all.
  const loadAllowListOptions = async () => {
    if (allUsers.length > 0) {
      return;
    }

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
    setCurrentPage(1);
  }, [debouncedSearchText, lockedFilter, kindFilter]);

  // One effect owns the fetching. The filter effect used to fetch page 1 and
  // this one fetched again a render later, so every filter change issued two
  // requests and flashed the table's loading state twice.
  useEffect(() => {
    fetchLobbies(currentPage, pageSize);
    const interval = setInterval(() => fetchLobbies(currentPage, pageSize), 4000);
    return () => clearInterval(interval);
    // fetchLobbies is memoised on the debounced search and the lock filter, so
    // this re-runs on the same changes as before — and the 4s poll can no longer
    // keep firing a closure built from filters the user has already changed.
  }, [currentPage, pageSize, fetchLobbies]);

  const handleTableChange = (pagination: TablePaginationConfig): void => {
    setCurrentPage(pagination.current ?? 1);
    setPageSize(pagination.pageSize ?? DEFAULT_PAGE_SIZE);
  };

  const handleEditClick = (record: AdminLobbySnapshot) => {
    void loadAllowListOptions();
    setEditingLobby(record);
  };

  // The dialog's save, in the dialog's own terms: "" clears the password,
  // undefined keeps it, 0 hands the ceiling back to the server's default. The
  // dialog shows what was saved in place, so success needs no toast.
  const handleUpdateRoom = async (
    lobbyId: string,
    name: string,
    isLocked?: boolean,
    allowedUsers?: string[],
    password?: string | null,
    capacity?: number,
    disabledFeatures?: LobbyFeatureId[],
  ): Promise<boolean> => {
    setIsSavingRoom(true);
    try {
      const res = await window.desktopApi.updateLobby({
        lobbyId,
        name,
        isLocked,
        allowedUsers,
        password,
        capacity,
        disabledFeatures,
      });
      if (!res.ok) {
        toast.error(toErrorMessage(res.error, "Oda güncellenemedi"));
        return false;
      }
      void fetchLobbies();
      return true;
    } catch (err) {
      toast.error(toErrorMessage(err, "Oda güncellenemedi"));
      return false;
    } finally {
      setIsSavingRoom(false);
    }
  };

  const handleDeleteLobby = async (lobbyId: string) => {
    try {
      const res = await window.desktopApi.deleteLobby({ lobbyId });
      if (res.ok) {
        toast.success("Oda silindi");
        fetchLobbies();
      } else {
        throw new Error(toErrorMessage(res.error, "Silme işlemi başarısız"));
      }
    } catch (err) {
      toast.error(toErrorMessage(err, "İşlem başarısız"));
    }
  };

  // What the Canlı Yayınlar page did, now on the person's own row: close one of
  // their streams, or cut their media altogether, without removing them from
  // the room.
  const stopTrack = async (
    userId: string,
    kind: "camera" | "screen" | "microphone",
  ): Promise<void> => {
    try {
      await adminService.unwrap(adminService.ops.forceTrackOff({ userId, kind }), "Yayın durdurulamadı");
      toast.success("Yayın durduruldu");
      void fetchLobbies();
    } catch (error) {
      toast.error(toErrorMessage(error, "Yayın durdurulamadı"));
    }
  };

  const disconnectMedia = async (userId: string): Promise<void> => {
    try {
      await adminService.unwrap(adminService.ops.disconnectMedia({ userId }), "Yayından koparılamadı");
      toast.success("Yayından koparıldı");
      void fetchLobbies();
    } catch (error) {
      toast.error(toErrorMessage(error, "Yayından koparılamadı"));
    }
  };

  const handleKickUser = async (lobbyId: string, userId: string) => {
    try {
      await adminService.kickUser(lobbyId, userId);
      toast.success("Kullanıcı odadan atıldı");
      fetchLobbies();
    } catch (err) {
      toast.error(toErrorMessage(err, "Kullanıcı odadan atılamadı"));
    }
  };

  const openTimeouts = async (record: AdminLobbySnapshot): Promise<void> => {
    setTimeoutLobby(record);
    setTimeoutsLoading(true);
    try {
      setTimeouts(await adminService.listLobbyTimeouts(record.lobby.id));
    } catch (error) {
      toast.error(toErrorMessage(error, "Zaman aşımları yüklenemedi"));
      setTimeouts([]);
    } finally {
      setTimeoutsLoading(false);
    }
  };

  const handleClearTimeout = async (userId: string): Promise<void> => {
    if (!timeoutLobby) {
      return;
    }
    try {
      await adminService.clearLobbyTimeout(timeoutLobby.lobby.id, userId);
      // Refetched rather than filtered locally: the server also drops timeouts
      // that lapsed on their own, and a local splice would leave those on screen.
      setTimeouts(await adminService.listLobbyTimeouts(timeoutLobby.lobby.id));
      toast.success("Zaman aşımı kaldırıldı.");
    } catch (error) {
      toast.error(toErrorMessage(error, "Zaman aşımı kaldırılamadı"));
    }
  };

  const columns = [
    {
      title: "Oda",
      key: "lobby",
      ellipsis: true,
      render: (_value: unknown, record: AdminLobbySnapshot) => (
        <div className="ct-admin-table-user">
          <span className="ct-admin-row-icon" aria-hidden="true">
            {record.lobby.isTextOnly ? <MessageOutlined /> : <SoundOutlined />}
          </span>
          <div className="ct-admin-person-text">
            <strong>{record.lobby.name}</strong>
            <span className="ct-admin-mono">{record.lobby.id}</span>
          </div>
        </div>
      ),
    },
    {
      title: "Sahip",
      key: "createdBy",
      width: 110,
      ellipsis: true,
      hideBelow: 720,
      render: (_value: unknown, record: AdminLobbySnapshot) => (
        <span>@{record.lobby.createdByUsername || record.lobby.createdBy}</span>
      ),
    },
    {
      title: "Erişim",
      key: "privacy",
      width: 160,
      hideBelow: 600,
      render: (_value: unknown, record: AdminLobbySnapshot) => privacyStates(record.lobby),
    },
    // Voice only. A text channel has no roster, so this column would read
    // "0" on every row of it, forever.
    ...(kindFilter === "voice"
      ? [
          {
            title: "Üyeler",
            dataIndex: "size",
            key: "size",
            width: 110,
            hideBelow: 440,
            // The ceiling only shows when the server sent one; an older server
            // omits capacity and "3 / undefined" is worse than no ceiling.
            render: (size: number, record: AdminLobbySnapshot) => (
              <div className="ct-admin-fill-cell">
                <span className="ct-admin-fill-count">
                  {record.lobby.capacity ? `${size} / ${record.lobby.capacity}` : size}
                </span>
                {record.lobby.capacity ? (
                  <span className="ct-admin-fill" aria-hidden="true">
                    <span
                      style={{
                        width: `${Math.min(100, (size / record.lobby.capacity) * 100)}%`,
                      }}
                    />
                  </span>
                ) : null}
              </div>
            ),
          },
        ]
      : []),
    // Voice only, like the one before it: who in the room is on camera or
    // sharing a screen.
    ...(kindFilter === "voice"
      ? [
          {
            title: "Yayın",
            key: "live",
            width: 100,
            hideBelow: 860,
            render: (_value: unknown, record: AdminLobbySnapshot) => {
              const cameras = record.members.filter((member) => member.cameraEnabled).length;
              const screens = record.members.filter((member) => member.screenSharing).length;
              if (cameras === 0 && screens === 0) {
                return <span className="ct-admin-muted">—</span>;
              }
              return (
                <span className="ct-admin-states">
                  {screens > 0 && (
                    <AdminState tone="info" icon={<DesktopOutlined />}>
                      {screens}
                    </AdminState>
                  )}
                  {cameras > 0 && (
                    <AdminState tone="info" icon={<VideoCameraOutlined />}>
                      {cameras}
                    </AdminState>
                  )}
                </span>
              );
            },
          },
        ]
      : []),
    {
      title: "Kuruldu",
      dataIndex: ["lobby", "createdAt"],
      key: "createdAt",
      width: 140,
      hideBelow: 880,
      render: (date: string) => <span className="ct-admin-muted">{adminDateTime(date)}</span>,
    },
    {
      title: "",
      key: "actions",
      width: 116,
      align: "right" as const,
      render: (_value: unknown, record: AdminLobbySnapshot) => (
        <div className="ct-admin-actions">
          <Tooltip title="Düzenle">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => handleEditClick(record)}
              aria-label="Düzenle"
            />
          </Tooltip>
          <Tooltip title="Zaman aşımları">
            <Button
              type="text"
              icon={<StopOutlined />}
              onClick={() => void openTimeouts(record)}
              aria-label="Zaman aşımları"
            />
          </Tooltip>
          <Tooltip title="Odayı sil…">
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              aria-label="Odayı sil"
              onClick={() => setPendingDeleteLobby(record)}
            />
          </Tooltip>
        </div>
      ),
    },
  ];

  // Render sub table listing live participants in a lobby
  const expandedRowRender = (record: AdminLobbySnapshot) => {
    // Ids and usernames come as parallel arrays on the admin envelope; the CSV
    // of ids on the descriptor is the fallback for a server that has not
    // shipped them yet, and then the id is all a tag can show.
    const allowedIds =
      record.allowedUserIds ??
      record.lobby.allowedUsers?.split(",").filter(Boolean) ??
      [];
    const allowedUsers =
      record.allowedUsernames && record.allowedUsernames.length > 0
        ? record.allowedUsernames.map((username, index) => ({
            id: allowedIds[index] ?? username,
            username,
          }))
        : allowedIds.map((id) => ({ id, username: id }));

    const details = (
      <div className="ct-admin-kv-grid">
        <div className="ct-admin-kv">
          <span>Oda sahibi</span>
          <strong>@{record.lobby.createdByUsername || record.lobby.createdBy}</strong>
        </div>
        <div className="ct-admin-kv">
          <span>Oluşturulma tarihi</span>
          <strong>{adminDateTime(record.lobby.createdAt)}</strong>
        </div>
        <div className="ct-admin-kv">
          <span>Erişim listesi</span>
          <strong>
            {allowedUsers.length > 0 ? (
              <Space size={4} wrap>
                {allowedUsers.map((allowed) => (
                  <Tag key={allowed.id} className="ct-tag info" title={allowed.id}>
                    @{allowed.username}
                  </Tag>
                ))}
              </Space>
            ) : record.lobby.isLocked ? (
              "Liste boş — yalnızca odayı kuran kişi girebilir"
            ) : (
              "Herkes katılabilir"
            )}
          </strong>
        </div>
        {record.lobby.hasPassword ? (
          <div className="ct-admin-kv">
            <span>Şifre</span>
            <strong>Şifreyi bilen herkes de girebilir</strong>
          </div>
        ) : null}
      </div>
    );

    if (record.members.length === 0) {
      return (
        <div className="ct-admin-subtable">
          {details}
          <div className="ct-admin-empty">Odada şu anda kimse yok.</div>
        </div>
      );
    }

    const memberColumns = [
      {
        title: "Kişi",
        dataIndex: "username",
        key: "username",
        ellipsis: true,
        render: (username: string, member: LobbyStateMember) => (
          <AdminPerson userId={member.userId} name={username} handle={`@${username}`} />
        ),
      },
      {
        title: "Girdi",
        dataIndex: "joinedAt",
        key: "joinedAt",
        width: 80,
        hideBelow: 760,
        render: (date: string) => (
          <span className="ct-admin-muted">
            {new Date(date).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        ),
      },
      {
        title: "Ses",
        key: "audioStatus",
        width: 170,
        hideBelow: 500,
        render: (_value: unknown, member: LobbyStateMember) => (
          <span className="ct-admin-states">
            {member.serverMuted ? (
              // A moderator mute the user cannot lift themselves -- without
              // its own label it looked exactly like a self mute.
              <AdminState tone="danger" icon={<AudioMutedOutlined />}>
                Yönetici susturdu
              </AdminState>
            ) : member.muted ? (
              <AdminState tone="warn" icon={<AudioMutedOutlined />}>
                Sessiz
              </AdminState>
            ) : (
              <AdminState tone="ok" icon={<SoundOutlined />}>
                Açık
              </AdminState>
            )}
            {member.deafened ? (
              <AdminState tone="warn" icon={<CustomerServiceOutlined />}>
                Duymuyor
              </AdminState>
            ) : null}
          </span>
        ),
      },
      {
        title: "Görüntü",
        key: "mediaStatus",
        width: 170,
        hideBelow: 680,
        render: (_value: unknown, member: LobbyStateMember) =>
          member.cameraEnabled || member.screenSharing ? (
            <span className="ct-admin-states">
              {member.cameraEnabled ? (
                <AdminState tone="info" icon={<VideoCameraOutlined />}>
                  Kamera
                </AdminState>
              ) : null}
              {member.screenSharing ? (
                <AdminState tone="info" icon={<DesktopOutlined />}>
                  Ekran
                </AdminState>
              ) : null}
            </span>
          ) : (
            <span className="ct-admin-muted">—</span>
          ),
      },
      {
        title: "",
        key: "actions",
        width: 268,
        align: "right" as const,
        render: (_value: unknown, member: LobbyStateMember) => (
          <div className="ct-admin-actions">
            <Tooltip title="Mikrofonu kapat">
              <Button
                type="text"
                size="small"
                icon={<AudioMutedOutlined />}
                disabled={member.muted || member.serverMuted}
                aria-label="Mikrofonu kapat"
                onClick={() => void stopTrack(member.userId, "microphone")}
              />
            </Tooltip>
            <Tooltip title="Kamerayı kapat">
              <Button
                type="text"
                size="small"
                icon={<VideoCameraOutlined />}
                disabled={!member.cameraEnabled}
                aria-label="Kamerayı kapat"
                onClick={() => void stopTrack(member.userId, "camera")}
              />
            </Tooltip>
            <Tooltip title="Ekran paylaşımını kapat">
              <Button
                type="text"
                size="small"
                icon={<DesktopOutlined />}
                disabled={!member.screenSharing}
                aria-label="Ekran paylaşımını kapat"
                onClick={() => void stopTrack(member.userId, "screen")}
              />
            </Tooltip>
            <Popconfirm
              title="Yayından koparılsın mı?"
              description="Mikrofon, kamera ve ekranı kapanır; odada kalır."
              onConfirm={() => disconnectMedia(member.userId)}
              okText="Kopar"
              cancelText="Vazgeç"
            >
              <Tooltip title="Yayından kopar">
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DisconnectOutlined />}
                  aria-label="Yayından kopar"
                />
              </Tooltip>
            </Popconfirm>
            <Popconfirm
              title="Odadan atılsın mı?"
              description="Yeniden katılabilir."
              onConfirm={() => handleKickUser(record.lobby.id, member.userId)}
              okText="Odadan at"
              cancelText="Vazgeç"
            >
              <Button type="text" danger size="small">
                Odadan at
              </Button>
            </Popconfirm>
          </div>
        ),
      },
    ];

    // No nested ConfigProvider. It pinned theme.darkAlgorithm and a literal
    // header background, so the participant list stayed dark inside a light
    // page — and the wrapper was .ct-admin-empty, the "nobody is here" message,
    // which rendered a live table in muted text at that message's padding.
    return (
      <div className="ct-admin-subtable">
        {details}
        <Table
          // Fitted to the room table around it: the inset of the open row is
          // already in these thresholds.
          columns={fitColumns(memberColumns)}
          dataSource={record.members}
          rowKey="userId"
          pagination={false}
          size="small"
          tableLayout="fixed"
          className="ct-admin-table-wrap"
        />
      </div>
    );
  };

  return (
    <div className="ct-admin-page">
      <AdminPageHeader
        title="Odalar"
        description="Odaları, içindekileri ve kimin ses, kamera ya da ekran yayını yaptığını anlık izleyin; yayınları buradan kapatabilirsiniz. Liste 4 saniyede bir yenilenir."
        actions={
          <Button
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => fetchLobbies()}
          >
            Yenile
          </Button>
        }
      />

      <AdminSection
        title={kindFilter === "voice" ? "Sesli odalar" : "Yazılı sohbetler"}
        description={
          kindFilter === "voice"
            ? "Satırı açınca odadakileri, ses ve görüntü durumlarını görürsün."
            : "Sesli bağlantısı olmayan, yalnızca mesajlaşılan odalar."
        }
        icon={<HomeOutlined />}
        hint={`${total} oda`}
        flush
        toolbar={
          <>
            <Input
              allowClear
              placeholder="Oda adı, ID veya oluşturan ara..."
              prefix={<SearchOutlined className="ct-admin-muted" />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="ct-admin-toolbar-search"
            />

            <Segmented
              value={kindFilter}
              onChange={(value) => setKindFilter(value as "voice" | "text")}
              className="ct-segmented-premium"
              options={[
                { value: "voice", label: "Sesli", icon: <SoundOutlined /> },
                { value: "text", label: "Yazılı", icon: <MessageOutlined /> },
              ]}
            />

            {kindFilter === "voice" && (
              <label className="ct-admin-toolbar-switch">
                <Switch size="small" checked={liveOnly} onChange={setLiveOnly} />
                <span>Yalnız yayın olanlar</span>
              </label>
            )}

            <Select
              value={lockedFilter}
              onChange={setLockedFilter}
              className="ct-admin-toolbar-filter"
              options={[
                { value: "all", label: "Tüm odalar" },
                { value: "true", label: "Kilitli" },
                { value: "false", label: "Açık" },
              ]}
            />
          </>
        }
      >
        <Table
          size="middle"
          ref={tableRef}
          dataSource={
            liveOnly && kindFilter === "voice"
              ? lobbies.filter((room) => room.members.some(isLive))
              : lobbies
          }
          columns={fitColumns(columns)}
          rowKey={(record) => record.lobby.id}
          loading={loading}
          expandable={{
            expandedRowRender,
            defaultExpandAllRows: kindFilter === "voice",
          }}
          onChange={handleTableChange}
          locale={{
            emptyText: searchText
              ? "Bu aramayla eşleşen oda yok."
              : liveOnly && kindFilter === "voice"
                ? "Şu anda yayın yapan kimse yok."
                : kindFilter === "voice"
                ? "Şu anda açık sesli oda yok."
                : "Şu anda yazılı sohbet yok.",
          }}
          pagination={{
            current: currentPage,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: ["10", "20", "50", "100"],
            showTotal: (count) => `${count} oda`,
          }}
          // See admin-users: a viewport height for a table that is not the
          // viewport clipped the last row and hid the pagination. The page
          // scrolls instead.
          tableLayout="fixed"
          className="ct-admin-table-wrap"
        />
      </AdminSection>

      {/* The one place a timeout can be lifted. A moderator sets them from the
          lobby, where the person is in front of them; by the time one needs
          undoing they are not in the room to right-click. */}
      <Modal
        rootClassName="ct-modal"
        title={
          <ModalHeading
            icon={<StopOutlined />}
            title="Zaman aşımları"
            description={
              timeoutLobby
                ? `${timeoutLobby.lobby.name} odasına girişi geçici olarak engellenen kişiler.`
                : undefined
            }
          />
        }
        open={timeoutLobby !== null}
        onCancel={() => setTimeoutLobby(null)}
        footer={null}
        width={MODAL_WIDTH.m}
        destroyOnHidden
      >
        <Table
          tableLayout="fixed"
          dataSource={timeouts}
          loading={timeoutsLoading}
          rowKey={(row) => row.userId}
          pagination={false}
          size="small"
          locale={{ emptyText: "Bu odada zaman aşımı verilmiş kimse yok." }}
          className="ct-admin-table-wrap"
          columns={[
            {
              title: "Kullanıcı",
              dataIndex: "userId",
              key: "userId",
              render: (userId: string) => (
                <span className="ct-admin-mono">{userId}</span>
              ),
            },
            {
              title: "Bitiş",
              key: "expiresAt",
              render: (_value: unknown, row: LobbyTimeout) =>
                row.expiresAt ? (
                  <AdminState tone="warn">{adminDateTime(row.expiresAt)}</AdminState>
                ) : (
                  <AdminState tone="danger">Süresiz</AdminState>
                ),
            },
            {
              title: "İşlem",
              key: "actions",
              align: "right" as const,
              render: (_value: unknown, row: LobbyTimeout) => (
                <Button
                  type="text"
                  size="small"
                  onClick={() => void handleClearTimeout(row.userId)}
                >
                  Kaldır
                </Button>
              ),
            },
          ]}
        />
      </Modal>

      {/* The very dialog a room's owner gets from the lobby list: one set of
          tabs, rules and messages for editing a room, whoever opens it. The
          panel's own form here had drifted from it (its "remove password"
          sent null, which the server reads as "keep"). */}
      <RoomSettingsDialog
        lobby={editingLobby?.lobby ?? null}
        onClose={() => setEditingLobby(null)}
        onUpdateLobby={handleUpdateRoom}
        isSaving={isSavingRoom}
        onDelete={
          editingLobby && !isDefaultRoom(editingLobby.lobby)
            ? () => setPendingDeleteLobby(editingLobby)
            : undefined
        }
        currentUserId={currentUserId}
        allUsers={allUsers.map((user) => ({
          id: user.id,
          username: user.username,
          displayName: user.displayName,
        }))}
      />

      <ConfirmActionModal
        isOpen={pendingDeleteLobby !== null}
        title="Odayı sil"
        message={pendingDeleteLobby ? `“${pendingDeleteLobby.lobby.name}”` : undefined}
        consequences={[
          "Oda listeden herkes için kalkar.",
          "İçindeki herkesin bağlantısı kesilir.",
          "Geri alınamaz.",
        ]}
        confirmLabel="Odayı sil"
        isProcessing={isDeletingLobby}
        onCancel={() => setPendingDeleteLobby(null)}
        onConfirm={() => {
          if (!pendingDeleteLobby) {
            return;
          }
          setIsDeletingLobby(true);
          void handleDeleteLobby(pendingDeleteLobby.lobby.id).finally(() => {
            setIsDeletingLobby(false);
            setPendingDeleteLobby(null);
          });
        }}
      />
    </div>
  );
}
