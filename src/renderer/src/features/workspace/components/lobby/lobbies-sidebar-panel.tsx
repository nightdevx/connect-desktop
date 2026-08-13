import { useEffect, useState } from "react";
import { Dropdown, Modal, Input, Avatar, Switch, Select, message } from "antd";
import {
  EditOutlined,
  DeleteOutlined,
  AudioOutlined,
  AudioMutedOutlined,
  CustomerServiceOutlined,
  MutedOutlined,
  VideoCameraOutlined,
  DesktopOutlined,
  TeamOutlined,
  LockOutlined,
  LogoutOutlined,
  CrownOutlined,
} from "@ant-design/icons";
import type { LobbyDescriptor } from "@shared/auth-contracts";
import type {
  DesktopResult,
  LobbyStateMember,
} from "@shared/desktop-api-types";
import type { UseQueryResult } from "@tanstack/react-query";
import { ConfirmActionModal } from "../common";
import { getApiErrorMessage, getDisplayInitials } from "../../workspace-utils";
import { canManageLobby, SEED_ADMIN_ID } from "@/features/auth/permissions";
import workspaceService from "../../services";

interface LobbiesSidebarPanelProps {
  lobbiesQuery: UseQueryResult<
    DesktopResult<{ lobbies: LobbyDescriptor[] }>,
    Error
  >;
  lobbies: LobbyDescriptor[];
  lobbyMembersById: Record<string, LobbyStateMember[]>;
  avatarByUserId: Record<string, string | null | undefined>;
  activeLobbyId: string | null;
  joiningLobbyId: string | null;
  onJoinLobby: (lobbyId: string) => void;
  onUpdateLobby: (
    lobbyId: string,
    name: string,
    isLocked?: boolean,
    allowedUsers?: string[],
    password?: string | null,
  ) => Promise<boolean>;
  onDeleteLobby: (lobbyId: string) => Promise<boolean>;
  renamingLobbyId: string | null;
  deletingLobbyId: string | null;
  currentUserId: string;
  currentUserRole: string;
  allUsers: Array<{ id: string; username: string; displayName: string }>;
}

export function LobbiesSidebarPanel({
  lobbiesQuery,
  lobbies,
  lobbyMembersById,
  avatarByUserId,
  activeLobbyId,
  joiningLobbyId,
  onJoinLobby,
  onUpdateLobby,
  onDeleteLobby,
  renamingLobbyId,
  deletingLobbyId,
  currentUserId,
  currentUserRole,
  allUsers,
}: LobbiesSidebarPanelProps) {
  const [editingLobby, setEditingLobby] = useState<LobbyDescriptor | null>(
    null,
  );
  const [editLobbyName, setEditLobbyName] = useState("");
  const [editIsLocked, setEditIsLocked] = useState(false);
  const [editAllowedUsers, setEditAllowedUsers] = useState<string[]>([]);
  const [editPassword, setEditPassword] = useState("");
  const [editRemovePassword, setEditRemovePassword] = useState(false);
  const [pendingDeleteLobby, setPendingDeleteLobby] =
    useState<LobbyDescriptor | null>(null);

  useEffect(() => {
    if (editingLobby) {
      setEditLobbyName(editingLobby.name);
      setEditIsLocked(!!editingLobby.isLocked);
      const users = editingLobby.allowedUsers
        ? editingLobby.allowedUsers.split(",").map((u) => u.trim()).filter(Boolean)
        : [];
      setEditAllowedUsers(users);
      setEditPassword("");
      setEditRemovePassword(false);
    }
  }, [editingLobby]);

  const isDefaultLobby = (lobby: LobbyDescriptor): boolean => {
    return lobby.id === "main-lobby" || lobby.createdBy === "system";
  };

  const handleKickMember = async (
    lobbyId: string,
    userId: string,
    username: string,
  ): Promise<void> => {
    const result = await workspaceService.kickLobbyMember({ lobbyId, userId });
    if (result.ok) {
      message.success(`${username} odadan atıldı`);
    } else {
      message.error(getApiErrorMessage(result.error));
    }
  };

  const handleMuteMember = async (
    lobbyId: string,
    userId: string,
    username: string,
    muted: boolean,
  ): Promise<void> => {
    const result = await workspaceService.muteLobbyMember({ lobbyId, userId, muted });
    if (result.ok) {
      message.success(muted ? `${username} susturuldu` : `${username} sesi açıldı`);
    } else {
      message.error(getApiErrorMessage(result.error));
    }
  };

  const handleDeleteConfirm = async (): Promise<void> => {
    if (!pendingDeleteLobby) {
      return;
    }

    const deleted = await onDeleteLobby(pendingDeleteLobby.id);
    if (deleted) {
      setPendingDeleteLobby(null);
    }
  };

  const handleUpdateSubmit = async (): Promise<void> => {
    if (!editingLobby) {
      return;
    }

    // password: remove -> "" (clear), a new value -> set, empty -> undefined (keep).
    const passwordArg = editRemovePassword
      ? ""
      : editPassword.trim()
        ? editPassword.trim()
        : undefined;

    const updated = await onUpdateLobby(
      editingLobby.id,
      editLobbyName,
      editIsLocked,
      editAllowedUsers,
      passwordArg,
    );
    if (!updated) {
      return;
    }

    setEditingLobby(null);
    setEditLobbyName("");
    setEditIsLocked(false);
    setEditAllowedUsers([]);
    setEditPassword("");
    setEditRemovePassword(false);
  };

  return (
    <>
      <ul className="ct-list" role="listbox" aria-label="Lobiler">
        {lobbiesQuery.isPending && (
          <li className="ct-list-state">Lobiler yükleniyor...</li>
        )}

        {!lobbiesQuery.isPending && lobbiesQuery.isError && (
          <li className="ct-list-state error">
            Lobiler alınamadı: {lobbiesQuery.error.message}
          </li>
        )}

        {!lobbiesQuery.isPending &&
          !lobbiesQuery.isError &&
          !lobbiesQuery.data?.ok && (
            <li className="ct-list-state error">
              Lobiler alınamadı: {getApiErrorMessage(lobbiesQuery.data?.error)}
            </li>
          )}

        {!lobbiesQuery.isPending &&
          !lobbiesQuery.isError &&
          lobbiesQuery.data?.ok &&
          lobbies.length === 0 && (
            <li className="ct-list-state">
              <TeamOutlined className="ct-list-state-icon" />
              <p>Aktif lobi bulunamadı.</p>
            </li>
          )}

        {lobbies.map((lobby) => {
          const isEditing = renamingLobbyId === lobby.id;
          const isDeleting = deletingLobbyId === lobby.id;
          const members = lobbyMembersById[lobby.id] ?? [];
          const isActive = activeLobbyId === lobby.id;
          const creatorPresent = members.some((m) => m.userId === lobby.createdBy);
          const isDisabled = isEditing || isDeleting || joiningLobbyId !== null;

          const handleLobbyClick = (): void => {
            if (isDisabled || isActive) {
              return;
            }

            onJoinLobby(lobby.id);
          };

          const contextMenuItems = [
            {
              key: "settings",
              label: "Lobi Ayarları",
              icon: <EditOutlined />,
              onClick: () => {
                setEditingLobby(lobby);
              },
            },
            {
              key: "delete",
              label: "Lobiyi Sil",
              icon: <DeleteOutlined />,
              danger: true,
              onClick: () => {
                setPendingDeleteLobby(lobby);
              },
            },
          ];

          const lobbyElement = (
            <li
              key={lobby.id}
              className={`ct-list-item clickable ${isActive ? "active" : ""}`}
              role="option"
              aria-selected={isActive}
              tabIndex={0}
              onClick={handleLobbyClick}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") {
                  return;
                }
                event.preventDefault();
                handleLobbyClick();
              }}
            >
              <div className="ct-lobby-item">
                <div className="ct-lobby-item-head">
                  <p className="ct-lobby-item-title">
                    <span className="truncate">#&nbsp;{lobby.name}</span>
                    {lobby.isLocked && (
                      <LockOutlined
                        className="ct-lobby-item-lock"
                        title="Bu lobi kilitlidir"
                      />
                    )}
                    {creatorPresent && (
                      <CrownOutlined
                        className="ct-lobby-item-crown"
                        title="Kurucu şu an lobide"
                      />
                    )}
                  </p>
                  {members.length > 0 && (
                    <span className="ct-lobby-item-count">
                      <TeamOutlined />
                      {members.length}
                    </span>
                  )}
                </div>

                {members.length === 0 ? (
                  <span className="ct-lobby-item-empty">Lobide kimse yok.</span>
                ) : (
                  <ul className="ct-lobby-member-list" aria-label="Lobi üyeleri">
                    {members.map((member) => {
                      const micOpen = !member.muted && !member.serverMuted;
                      const headphoneOpen = !member.deafened;
                      const canModerate =
                        canManageLobby(lobby.createdBy, currentUserId, currentUserRole) &&
                        member.userId !== currentUserId;

                      const memberRow = (
                        <li
                          key={member.userId}
                          className="ct-lobby-member-item"
                          onContextMenu={(e) => e.stopPropagation()}
                        >
                          <div className="ct-lobby-member-main">
                            <Avatar
                              size={20}
                              src={avatarByUserId[member.userId]}
                              className="ct-lobby-member-avatar"
                            >
                              {getDisplayInitials(member.username)}
                            </Avatar>

                            <p className="ct-lobby-member-name">
                              {member.username}
                            </p>

                            {member.userId === lobby.createdBy && (
                              <CrownOutlined
                                title="Lobi sahibi"
                                className="ct-lobby-member-flag on"
                              />
                            )}
                          </div>

                          <div className="ct-lobby-member-icons">
                            {micOpen ? (
                              <AudioOutlined
                                className="ct-lobby-member-flag on"
                                title="Mikrofon açık"
                              />
                            ) : (
                              <AudioMutedOutlined
                                className={`ct-lobby-member-flag ${member.serverMuted ? "forced" : "off"}`}
                                title={
                                  member.serverMuted
                                    ? "Yönetici tarafından susturuldu"
                                    : "Mikrofon kapalı"
                                }
                              />
                            )}

                            {headphoneOpen ? (
                              <CustomerServiceOutlined
                                className="ct-lobby-member-flag on"
                                title="Kulaklık açık"
                              />
                            ) : (
                              <MutedOutlined
                                className="ct-lobby-member-flag off"
                                title="Kulaklık kapalı"
                              />
                            )}

                            {member.cameraEnabled && (
                              <VideoCameraOutlined
                                className="ct-lobby-member-flag neutral"
                                title="Kamera açık"
                              />
                            )}

                            {member.screenSharing && (
                              <DesktopOutlined
                                className="ct-lobby-member-flag neutral"
                                title="Ekran paylaşımı açık"
                              />
                            )}
                          </div>
                        </li>
                      );

                      if (!canModerate) {
                        return memberRow;
                      }

                      return (
                        <Dropdown
                          key={member.userId}
                          trigger={["contextMenu"]}
                          menu={{
                            items: [
                              {
                                key: "mute",
                                label: member.serverMuted ? "Susturmayı Kaldır" : "Sustur",
                                icon: member.serverMuted ? <AudioOutlined /> : <AudioMutedOutlined />,
                                onClick: () =>
                                  void handleMuteMember(lobby.id, member.userId, member.username, !member.serverMuted),
                              },
                              {
                                key: "kick",
                                label: "Odadan At",
                                icon: <LogoutOutlined />,
                                danger: true,
                                onClick: () =>
                                  void handleKickMember(lobby.id, member.userId, member.username),
                              },
                            ],
                          }}
                        >
                          {memberRow}
                        </Dropdown>
                      );
                    })}
                  </ul>
                )}
              </div>
            </li>
          );

          const isOwner = canManageLobby(lobby.createdBy, currentUserId, currentUserRole);
          if (isDefaultLobby(lobby) || !isOwner) {
            return lobbyElement;
          }

          return (
            <Dropdown
              key={lobby.id}
              menu={{ items: contextMenuItems }}
              trigger={["contextMenu"]}
            >
              {lobbyElement}
            </Dropdown>
          );
        })}
      </ul>

      <Modal
        rootClassName="ct-modal"
        title="Lobi Ayarları"
        open={editingLobby !== null}
        onOk={handleUpdateSubmit}
        onCancel={() => setEditingLobby(null)}
        okText="Kaydet"
        cancelText="İptal"
        destroyOnHidden
        okButtonProps={{
          disabled: editLobbyName.trim().length < 2,
          loading:
            renamingLobbyId !== null &&
            editingLobby !== null &&
            renamingLobbyId === editingLobby.id,
        }}
      >
        <div className="ct-modal-form">
          <label className="ct-field" htmlFor="edit-lobby-name">
            <span>Lobi Adı</span>
            <Input
              id="edit-lobby-name"
              value={editLobbyName}
              onChange={(event) => setEditLobbyName(event.target.value)}
              minLength={2}
              maxLength={64}
              disabled={
                editingLobby !== null && renamingLobbyId === editingLobby.id
              }
              autoFocus
            />
          </label>

          <div className="ct-field-row">
            <div className="ct-field-row-text">
              <strong>Özel Lobi (Kilitli)</strong>
              <span>Sadece davet edilen kullanıcılar katılabilir.</span>
            </div>
            <Switch checked={editIsLocked} onChange={setEditIsLocked} />
          </div>

          {editIsLocked && (
            <label className="ct-field">
              <span>Erişimi Olan Kullanıcılar</span>
              <Select
                mode="multiple"
                placeholder="Kullanıcı seçin..."
                value={editAllowedUsers}
                onChange={setEditAllowedUsers}
                options={allUsers
                  .filter(
                    (u) => u.id !== currentUserId && u.id !== SEED_ADMIN_ID,
                  )
                  .map((u) => ({
                    label: `@${u.username} (${u.displayName})`,
                    value: u.id,
                  }))}
              />
            </label>
          )}

          <label className="ct-field">
            <span>Oda Şifresi</span>
            <Input.Password
              placeholder={
                editingLobby?.hasPassword
                  ? "Değiştirmek için yeni şifre girin (boş = değişmez)"
                  : "Şifre belirleyin (boş = şifresiz)"
              }
              value={editPassword}
              onChange={(event) => setEditPassword(event.target.value)}
              disabled={editRemovePassword}
              maxLength={128}
            />
            {editingLobby?.hasPassword && (
              <span className="ct-field-inline-toggle">
                <Switch
                  size="small"
                  checked={editRemovePassword}
                  onChange={setEditRemovePassword}
                />
                Şifreyi kaldır
              </span>
            )}
          </label>
        </div>
      </Modal>

      <ConfirmActionModal
        isOpen={pendingDeleteLobby !== null}
        title="Lobiyi Sil"
        message={
          pendingDeleteLobby
            ? `"${pendingDeleteLobby.name}" lobisini kalıcı olarak silmek istediğine emin misin?`
            : ""
        }
        confirmLabel="Lobiyi Sil"
        isProcessing={
          pendingDeleteLobby !== null &&
          deletingLobbyId === pendingDeleteLobby.id
        }
        onCancel={() => setPendingDeleteLobby(null)}
        onConfirm={handleDeleteConfirm}
      />
    </>
  );
}


