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
  MessageOutlined,
} from "@ant-design/icons";
import type { FriendEntry, LobbyDescriptor } from "@shared/auth-contracts";
import type {
  DesktopResult,
  LobbyStateMember,
} from "@shared/desktop-api-types";
import type { UseQueryResult } from "@tanstack/react-query";
import { ConfirmActionModal } from "../common";
import { UserProfileCardPopover } from "../user/user-profile-card";
import type { FriendsController } from "../../hooks/user/use-friends";
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
  /** The open text room. It is read, not joined, so it is never activeLobbyId. */
  openTextRoomId: string | null;
  joiningLobbyId: string | null;
  /** Opens a room: joins it if it is a voice lobby, just displays it if not. */
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
  // A roster row is the one place a stranger's name appears with nothing behind
  // it; the profile card is what turns it into a person you can add.
  friends: FriendsController;
}

export function LobbiesSidebarPanel({
  lobbiesQuery,
  lobbies,
  lobbyMembersById,
  avatarByUserId,
  activeLobbyId,
  openTextRoomId,
  joiningLobbyId,
  onJoinLobby,
  onUpdateLobby,
  onDeleteLobby,
  renamingLobbyId,
  deletingLobbyId,
  currentUserId,
  currentUserRole,
  allUsers,
  friends,
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
  // allUsers is friends + self now, so the select alone can never reach a
  // stranger. These are the ones pulled in by exact username this session —
  // kept only so their tag renders a name instead of a bare id.
  const [lookedUpUsers, setLookedUpUsers] = useState<FriendEntry[]>([]);
  const [lookupUsername, setLookupUsername] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);

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
      setLookedUpUsers([]);
      setLookupUsername("");
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

  const handleLookupAdd = async (): Promise<void> => {
    // A pasted "@ali" is the same person as "ali"; the route matches exactly.
    const username = lookupUsername.trim().replace(/^@/, "");
    if (!username) {
      return;
    }

    setIsLookingUp(true);
    try {
      const result = await workspaceService.lookupUserByUsername({ username });
      if (!result.ok || !result.data) {
        message.error(
          result.error?.code === "USER_NOT_FOUND" ||
            result.error?.code === "VALIDATION_ERROR"
            ? "Kullanıcı bulunamadı."
            : getApiErrorMessage(result.error),
        );
        return;
      }

      const user = result.data.user;
      if (user.userId === currentUserId) {
        message.info("Lobi sahibi zaten erişebilir.");
        setLookupUsername("");
        return;
      }

      setLookedUpUsers((previous) =>
        previous.some((entry) => entry.userId === user.userId)
          ? previous
          : [...previous, user],
      );
      setEditAllowedUsers((previous) =>
        previous.includes(user.userId) ? previous : [...previous, user.userId],
      );
      setLookupUsername("");
    } finally {
      setIsLookingUp(false);
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
          // Two different kinds of "current": connected to a voice lobby, and
          // reading a text room. Both are where the user is, so both highlight —
          // and they can be true at the same time on two different rows.
          const isCurrent =
            activeLobbyId === lobby.id || openTextRoomId === lobby.id;
          // Only one of them is actually on screen, though. Clicking the voice
          // lobby you are already connected to while reading a text room has to
          // stay live: that click is how you get back to it.
          const isDisplayed = openTextRoomId
            ? openTextRoomId === lobby.id
            : activeLobbyId === lobby.id;
          const creatorPresent = members.some((m) => m.userId === lobby.createdBy);
          const isDisabled = isEditing || isDeleting || joiningLobbyId !== null;

          const handleLobbyClick = (): void => {
            if (isDisabled || isDisplayed) {
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
              className={`ct-list-item clickable ${isCurrent ? "active" : ""}`}
              role="option"
              aria-selected={isCurrent}
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
                    {lobby.isTextOnly && (
                      <MessageOutlined
                        className="ct-lobby-item-text"
                        title="Mesaj odası — sesli bağlantı yok"
                      />
                    )}
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
                  {!lobby.isTextOnly && members.length > 0 && (
                    <span className="ct-lobby-item-count">
                      <TeamOutlined />
                      {members.length}
                    </span>
                  )}
                </div>

                {/* A message room has no occupancy at all — nobody is ever "in"
                    one — so it gets neither a count nor "Lobide kimse yok.",
                    which would read as an empty voice lobby. */}
                {lobby.isTextOnly ? (
                  <span className="ct-lobby-item-empty">Sohbet kanalı</span>
                ) : members.length === 0 ? (
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
                            {/* The whole identity is the trigger, avatar
                                included — the row's own click joins the lobby,
                                so this stops the propagation itself. */}
                            <UserProfileCardPopover
                              userId={member.userId}
                              fallbackName={member.username}
                              currentUserId={currentUserId}
                              friends={friends}
                            >
                              <button
                                type="button"
                                className="ct-profile-trigger ct-lobby-member-identity"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <Avatar
                                  size={20}
                                  src={avatarByUserId[member.userId]}
                                  className="ct-lobby-member-avatar"
                                >
                                  {getDisplayInitials(member.username)}
                                </Avatar>

                                <span className="ct-lobby-member-name">
                                  {member.username}
                                </span>
                              </button>
                            </UserProfileCardPopover>

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
                            // This overlay is portalled into document.body, but a
                            // portal only moves the DOM node — React synthetic
                            // events still bubble along the React tree, and that
                            // tree runs Dropdown -> ul.ct-lobby-member-list ->
                            // li.ct-list-item, whose onClick is handleLobbyClick.
                            // So moderating a member of a lobby you are not in
                            // used to join you to it (mic on, leaving whatever
                            // room you were in) right before the kick landed.
                            // Neither rc-menu nor antd stops the click, so the
                            // guard has to live here. Menu-level rather than
                            // per-item so a future item cannot forget it, and it
                            // covers the keyboard path too: Enter on the item
                            // would otherwise reach the row's own onKeyDown.
                            onClick: ({ domEvent }) => domEvent.stopPropagation(),
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
              <span>
                {editingLobby?.isTextOnly
                  ? "Sadece davet edilen kullanıcılar görebilir."
                  : "Sadece davet edilen kullanıcılar katılabilir."}
              </span>
            </div>
            <Switch checked={editIsLocked} onChange={setEditIsLocked} />
          </div>

          {editIsLocked && (
            <label className="ct-field">
              <span>Erişimi Olan Kullanıcılar</span>
              <Select
                mode="multiple"
                placeholder="Arkadaşlarından seç..."
                value={editAllowedUsers}
                onChange={setEditAllowedUsers}
                options={[
                  ...allUsers
                    .filter(
                      (u) => u.id !== currentUserId && u.id !== SEED_ADMIN_ID,
                    )
                    .map((u) => ({
                      label: `@${u.username} (${u.displayName})`,
                      value: u.id,
                    })),
                  ...lookedUpUsers.map((u) => ({
                    label: `@${u.username} (${u.displayName})`,
                    value: u.userId,
                  })),
                ]}
              />
              {/* ponytail: an already-allowed non-friend from an earlier edit
                  still renders as a bare id — there is no lookup-by-id route,
                  only this by-username one. Add names to the descriptor's
                  allowedUsers if that reads badly. */}
              <Input.Search
                placeholder="Kullanıcı adıyla ekle"
                enterButton="Ekle"
                value={lookupUsername}
                onChange={(event) => setLookupUsername(event.target.value)}
                onSearch={() => void handleLookupAdd()}
                loading={isLookingUp}
                maxLength={32}
              />
            </label>
          )}

          {/* Sesli odalara özel: şifre yalnızca katılma sırasında sorulur, mesaj
              odasına katılım diye bir şey yok. Kilit (izinli kullanıcılar) mesaj
              odalarında da geçerlidir; sohbet erişimi onun üzerinden denetlenir. */}
          {!editingLobby?.isTextOnly && (
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
          )}
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


