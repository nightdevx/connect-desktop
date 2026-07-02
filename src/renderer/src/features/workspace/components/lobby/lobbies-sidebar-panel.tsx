import { useEffect, useState } from "react";
import { Dropdown, Modal, Input, Button, Avatar, Switch, Select, message } from "antd";
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
  ): Promise<void> => {
    const result = await workspaceService.muteLobbyMember({ lobbyId, userId });
    if (result.ok) {
      message.success(`${username} susturuldu`);
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
      <ul className="ct-list" style={{ marginTop: "8px" }}>
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
              <div style={{ marginBottom: "12px", opacity: 0.3 }}>
                <TeamOutlined style={{ fontSize: "24px" }} />
              </div>
              <p style={{ margin: 0 }}>Aktif lobi bulunamadı.</p>
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
              onClick={handleLobbyClick}
              style={{
                padding: "12px 16px",
                margin: "4px 8px",
                borderRadius: "8px",
                transition: "all 0.2s ease",
                cursor: "pointer",
                listStyleType: "none",
              }}
            >
              <div className="w-full flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p
                    style={{
                      margin: 0,
                      fontSize: "13.5px",
                      fontWeight: "600",
                      color: isActive ? "#000000" : "#ffffff",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px"
                    }}
                  >
                    # {lobby.name}
                    {lobby.isLocked && (
                      <LockOutlined
                        style={{
                          fontSize: "11px",
                          color: isActive ? "rgba(0, 0, 0, 0.6)" : "#fbbf24",
                        }}
                        title="Bu lobi kilitlidir"
                      />
                    )}
                    {creatorPresent && (
                      <CrownOutlined
                        style={{
                          fontSize: "11px",
                          color: isActive ? "rgba(0, 0, 0, 0.6)" : "#10b981",
                        }}
                        title="Kurucu şu an lobide"
                      />
                    )}
                  </p>
                  {members.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "11px",
                        color: isActive ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.4)",
                      }}
                    >
                      <TeamOutlined style={{ fontSize: "11px" }} />
                      <span>{members.length}</span>
                    </div>
                  )}
                </div>

                {members.length === 0 ? (
                  <span
                    style={{
                      fontSize: "11px",
                      color: isActive ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.35)",
                    }}
                  >
                    Lobide kimse yok.
                  </span>
                ) : (
                  <ul
                    className="ct-lobby-member-list"
                    aria-label="Lobi üyeleri"
                    style={{
                      margin: 0,
                      padding: "4px 0 0 0",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                    }}
                  >
                    {members.map((member) => {
                      const micOpen = !member.muted;
                      const headphoneOpen = !member.deafened;
                      const canModerate =
                        canManageLobby(lobby.createdBy, currentUserId, currentUserRole) &&
                        member.userId !== currentUserId;

                      const memberRow = (
                        <li
                          key={member.userId}
                          className="ct-lobby-member-item"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "6px 8px",
                            borderRadius: "6px",
                            background: isActive
                              ? "rgba(0, 0, 0, 0.04)"
                              : "rgba(255, 255, 255, 0.03)",
                            border: isActive
                              ? "1px solid rgba(0,0,0,0.06)"
                              : "1px solid rgba(255,255,255,0.04)",
                          }}
                        >
                          <div
                            className="ct-lobby-member-main"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            <Avatar
                              size={20}
                              src={avatarByUserId[member.userId]}
                              style={{
                                border: isActive
                                  ? "1px solid rgba(0, 0, 0, 0.1)"
                                  : "1px solid rgba(255, 255, 255, 0.1)",
                                background: isActive ? "#ffffff" : "#1a1a1a",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: isActive ? "#000000" : "#ffffff",
                                fontSize: "8px",
                                fontWeight: "bold",
                              }}
                            >
                              {getDisplayInitials(member.username)}
                            </Avatar>

                            <p
                              className="ct-lobby-member-name"
                              style={{
                                margin: 0,
                                fontSize: "11.5px",
                                fontWeight: "500",
                                color: isActive ? "#000000" : "rgba(255,255,255,0.75)",
                              }}
                            >
                              {member.username}
                            </p>

                            {member.userId === lobby.createdBy && (
                              <CrownOutlined
                                title="Lobi sahibi"
                                style={{
                                  fontSize: "10px",
                                  color: isActive ? "rgba(0, 0, 0, 0.6)" : "#10b981",
                                }}
                              />
                            )}
                          </div>

                          <div
                            className="ct-lobby-member-icons"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            <div
                              title={`Mikrofon ${micOpen ? "açık" : "kapalı"}`}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                opacity: micOpen ? 1 : 0.4,
                              }}
                            >
                              {micOpen ? (
                                <AudioOutlined
                                  style={{
                                    fontSize: "11px",
                                    color: isActive ? "#000000" : "#10b981",
                                  }}
                                />
                              ) : (
                                <AudioMutedOutlined
                                  style={{
                                    fontSize: "11px",
                                    color: isActive ? "rgba(0,0,0,0.5)" : "#6b7280",
                                  }}
                                />
                              )}
                            </div>

                            <div
                              title={`Kulaklık ${headphoneOpen ? "açık" : "kapalı"}`}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                opacity: headphoneOpen ? 1 : 0.4,
                              }}
                            >
                              {headphoneOpen ? (
                                <CustomerServiceOutlined
                                  style={{
                                    fontSize: "11px",
                                    color: isActive ? "#000000" : "#10b981",
                                  }}
                                />
                              ) : (
                                <MutedOutlined
                                  style={{
                                    fontSize: "11px",
                                    color: isActive ? "rgba(0,0,0,0.5)" : "#6b7280",
                                  }}
                                />
                              )}
                            </div>

                            {member.cameraEnabled && (
                              <div
                                title="Kamera açık"
                                style={{ display: "flex", alignItems: "center" }}
                              >
                                <VideoCameraOutlined
                                  style={{
                                    fontSize: "11px",
                                    color: isActive ? "#000000" : "#ffffff",
                                  }}
                                />
                              </div>
                            )}

                            {member.screenSharing && (
                              <div
                                title="Ekran paylaşımı açık"
                                style={{ display: "flex", alignItems: "center" }}
                              >
                                <DesktopOutlined
                                  style={{
                                    fontSize: "11px",
                                    color: isActive ? "#000000" : "#ffffff",
                                  }}
                                />
                              </div>
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
                                label: "Sustur",
                                icon: <AudioMutedOutlined />,
                                onClick: () =>
                                  void handleMuteMember(lobby.id, member.userId, member.username),
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
        title={
          <span style={{ color: "#ffffff", fontWeight: "bold" }}>
            Lobi Ayarları
          </span>
        }
        open={editingLobby !== null}
        onOk={handleUpdateSubmit}
        onCancel={() => setEditingLobby(null)}
        okText="Kaydet"
        cancelText="İptal"
        okButtonProps={{
          disabled: editLobbyName.trim().length < 2,
          loading: renamingLobbyId !== null && editingLobby !== null && renamingLobbyId === editingLobby.id,
          style: { background: "#ffffff", color: "#000000", fontWeight: "600" },
        }}
        cancelButtonProps={{
          style: {
            background: "transparent",
            borderColor: "rgba(255,255,255,0.15)",
            color: "#ffffff",
          },
        }}
        styles={{
          mask: {
            backdropFilter: "blur(6px)",
            background: "rgba(0, 0, 0, 0.6)",
          },
          body: {
            background: "transparent",
            color: "#f5f5f5",
          },
          header: {
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            paddingBottom: "12px",
          },
        }}
      >
        <div style={{ padding: "20px 0" }}>
          <div style={{ marginBottom: "16px" }}>
            <label
              className="ct-label"
              htmlFor="edit-lobby-name"
              style={{
                display: "block",
                fontSize: "12px",
                color: "rgba(255,255,255,0.45)",
                marginBottom: "8px",
              }}
            >
              Lobi Adı
            </label>
            <Input
              id="edit-lobby-name"
              value={editLobbyName}
              onChange={(event) => setEditLobbyName(event.target.value)}
              minLength={2}
              maxLength={64}
              disabled={editingLobby !== null && renamingLobbyId === editingLobby.id}
              autoFocus
              style={{
                background: "rgba(20, 20, 20, 0.8)",
                borderColor: "rgba(255, 255, 255, 0.08)",
                color: "#f5f5f5",
                borderRadius: "6px",
                height: "40px",
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#ffffff" }}>Özel Lobi (Kilitli)</label>
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)" }}>Sadece davet edilen kullanıcılar katılabilir.</span>
            </div>
            <Switch
              checked={editIsLocked}
              onChange={(checked) => setEditIsLocked(checked)}
              style={{
                background: editIsLocked ? "#a855f7" : "rgba(255,255,255,0.15)"
              }}
            />
          </div>

          {editIsLocked && (
            <div style={{ marginBottom: "16px" }}>
              <label
                className="ct-label"
                style={{
                  display: "block",
                  fontSize: "12px",
                  color: "rgba(255,255,255,0.45)",
                  marginBottom: "8px",
                }}
              >
                Erişimi Olan Kullanıcılar (Katılabilecekler)
              </label>
              <Select
                mode="multiple"
                placeholder="Kullanıcı seçin..."
                value={editAllowedUsers}
                onChange={(value) => setEditAllowedUsers(value)}
                style={{ width: "100%" }}
                dropdownStyle={{ background: "#1f1f1f", border: "1px solid rgba(255,255,255,0.08)" }}
                options={allUsers
                  .filter(u => u.id !== currentUserId && u.id !== SEED_ADMIN_ID)
                  .map(u => ({ label: `@${u.username} (${u.displayName})`, value: u.id }))
                }
              />
            </div>
          )}

          <div style={{ marginTop: "16px" }}>
            <label
              className="ct-label"
              style={{
                display: "block",
                fontSize: "12px",
                color: "rgba(255,255,255,0.45)",
                marginBottom: "8px",
              }}
            >
              Oda Şifresi
            </label>
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
              style={{
                background: "rgba(20, 20, 20, 0.8)",
                borderColor: "rgba(255, 255, 255, 0.08)",
              }}
            />
            {editingLobby?.hasPassword && (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginTop: "10px",
                  fontSize: "12px",
                  color: "rgba(255,255,255,0.6)",
                }}
              >
                <Switch
                  size="small"
                  checked={editRemovePassword}
                  onChange={(checked) => setEditRemovePassword(checked)}
                />
                Şifreyi kaldır
              </label>
            )}
          </div>
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


