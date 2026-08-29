import { LOBBY_FEATURES, type LobbyFeatureId } from "@shared/desktop-api-types";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dropdown,
  Modal,
  Input,
  InputNumber,
  Switch,
  Select,
  Tag,
  message,
} from "antd";
import {
  EditOutlined,
  DeleteOutlined,
  AudioOutlined,
  AudioMutedOutlined,
  CustomerServiceOutlined,
  VideoCameraOutlined,
  DesktopOutlined,
  TeamOutlined,
  KeyOutlined,
  LockOutlined,
  CrownOutlined,
  MessageOutlined,
  SoundOutlined,
  RightOutlined,
} from "@ant-design/icons";
import type { FriendEntry, LobbyDescriptor } from "@shared/auth-contracts";
import type {
  DesktopResult,
  LobbyStateMember,
} from "@shared/desktop-api-types";
import type { UseQueryResult } from "@tanstack/react-query";
import { ConfirmActionModal } from "../common";
import {
  UserProfileCardAnchor,
  UserProfileCardPopover,
} from "../user/user-profile-card";
import { LobbyMemberContextMenu } from "./parts/LobbyMemberContextMenu";
import { LobbyMemberAvatar } from "./parts/LobbyMemberAvatar";
import { fetchUserCard, useUserCards } from "../../hooks/user/use-user-cards";
import {
  DEFAULT_REMOTE_PARTICIPANT_AUDIO_PREFERENCE,
  isRemoteParticipantMuted,
} from "../../hooks/media/use-remote-participant-audio";
import type { RemoteParticipantAudioPreference } from "@/features/livekit";
import type { FriendsController } from "../../hooks/user/use-friends";
import { getApiErrorMessage } from "../../workspace-utils";
import { canManageLobby, SEED_ADMIN_ID } from "@/features/auth";
import { useUiStore } from "@/store/ui-store";
import { GameActivityBadge, useGameActivityByUser } from "@/features/minigames";
import type { ViewPreferences } from "@/store/view-preferences";
import workspaceService from "../../services";
import { describeDuration } from "./parts/moderation-durations";
import {
  MEMBER_DRAG_TYPE,
  buildMoveTargets,
  canDropMemberOn,
  decodeMemberDrag,
  encodeMemberDrag,
  type MemberDragPayload,
} from "./parts/member-move";

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
  /** Unread chat messages per lobby, for rooms not currently being read. */
  unreadByLobbyId?: Record<string, number>;
  /** Opens a room: joins it if it is a voice lobby, just displays it if not. */
  onJoinLobby: (lobbyId: string) => void;
  onUpdateLobby: (
    lobbyId: string,
    name: string,
    isLocked?: boolean,
    allowedUsers?: string[],
    password?: string | null,
    capacity?: number,
    disabledFeatures?: LobbyFeatureId[],
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
  /** Opens the DM thread with this person. Undefined disables the menu item. */
  onOpenConversation?: (userId: string) => void;
  /** Per-participant playback, for members of the room this client is in. */
  participantAudio?: {
    preferences: Record<string, RemoteParticipantAudioPreference>;
    setMuted: (userId: string, muted: boolean) => void;
    setVolume: (userId: string, volumePercent: number) => void;
    setEmoteMuted: (userId: string, muted: boolean) => void;
  };
}

export function LobbiesSidebarPanel({
  lobbiesQuery,
  lobbies,
  lobbyMembersById,
  avatarByUserId,
  activeLobbyId,
  openTextRoomId,
  joiningLobbyId,
  unreadByLobbyId = {},
  onJoinLobby,
  onUpdateLobby,
  onDeleteLobby,
  renamingLobbyId,
  deletingLobbyId,
  currentUserId,
  currentUserRole,
  allUsers,
  friends,
  onOpenConversation,
  participantAudio,
}: LobbiesSidebarPanelProps) {
  const queryClient = useQueryClient();
  const gameActivityByUser = useGameActivityByUser();
  // Persisted, like every other fold in this app: the panel is unmounted the
  // moment the workspace switches section, so a useState here would forget which
  // categories were closed on the way back from Ayarlar.
  const isVoiceCategoryOpen = useUiStore(
    (state) => state.viewPreferences.lobbyVoiceCategoryOpen,
  );
  const isTextCategoryOpen = useUiStore(
    (state) => state.viewPreferences.lobbyTextCategoryOpen,
  );
  const setViewPreference = useUiStore((state) => state.setViewPreference);
  // Where the last right-click landed, so "Profili Gör" opens the card there.
  const lastContextPointRef = useRef({ x: 0, y: 0 });
  // The member currently being dragged, and the row under the cursor.
  //
  // State rather than dataTransfer, because dragover is not allowed to READ the
  // payload — the browser only hands it over on drop. Without a local copy a
  // row cannot tell whether it is a legal destination, so it would have to
  // light up for every drag, including a file dropped in from the desktop.
  const [draggedMember, setDraggedMember] = useState<MemberDragPayload | null>(
    null,
  );
  const [dropTargetLobbyId, setDropTargetLobbyId] = useState<string | null>(
    null,
  );
  const [profileCardTarget, setProfileCardTarget] = useState<{
    userId: string;
    name: string;
    x: number;
    y: number;
  } | null>(null);

  const friendStateOf = (userId: string): "friend" | "requested" | "none" => {
    if (friends.friendIds.includes(userId)) {
      return "friend";
    }
    if (friends.outgoingRequests.some((entry) => entry.userId === userId)) {
      return "requested";
    }
    return "none";
  };

  // The roster carries a DISPLAY name, and sendRequest is keyed by handle, so
  // the handle is read from the profile card first — usually a cache hit,
  // because the same card feeds this row's avatar.
  const handleAddFriend = async (userId: string): Promise<void> => {
    const card = await fetchUserCard(queryClient, userId);
    if (!card?.username) {
      message.error("Kullanıcı bulunamadı");
      return;
    }

    const result = await friends.sendRequest(card.username);
    if (result.ok) {
      message.success(result.message);
    } else {
      message.error(result.message);
    }
  };

  const handleRemoveFriend = async (userId: string): Promise<void> => {
    const removed = await friends.removeFriend(userId);
    if (removed) {
      message.success("Arkadaşlıktan çıkarıldı");
    }
  };
  const [editingLobby, setEditingLobby] = useState<LobbyDescriptor | null>(
    null,
  );
  const [editLobbyName, setEditLobbyName] = useState("");
  const [editIsLocked, setEditIsLocked] = useState(false);
  const [editAllowedUsers, setEditAllowedUsers] = useState<string[]>([]);
  const [editPassword, setEditPassword] = useState("");
  // null means "follow the server default", which is what a room that never
  // chose a limit does.
  const [editCapacity, setEditCapacity] = useState<number | null>(null);
  const [editDisabledFeatures, setEditDisabledFeatures] = useState<LobbyFeatureId[]>([]);
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
      // The room reports its live ceiling, so the field opens on what is
      // actually enforced rather than on an empty box.
      setEditCapacity(editingLobby.capacity ?? null);
      setEditDisabledFeatures((editingLobby.disabledFeatures ?? []) as LobbyFeatureId[]);
      setLookedUpUsers([]);
      setLookupUsername("");
    }
  }, [editingLobby]);

  // The allow-list as it is STORED, for the read-only block at the top of the
  // settings modal — not editAllowedUsers, which moves while you edit. Empty
  // whenever the modal is shut, so the card queries cost nothing until it opens.
  const allowedUserIds = useMemo(
    () =>
      editingLobby?.allowedUsers
        ?.split(",")
        .map((id) => id.trim())
        .filter(Boolean) ?? [],
    [editingLobby],
  );
  const allowedUserCards = useUserCards(allowedUserIds);

  const isDefaultLobby = (lobby: LobbyDescriptor): boolean => {
    return lobby.id === "main-lobby" || lobby.createdBy === "system";
  };

  // Moving somebody is the same decision from two directions: this menu item,
  // and dropping their row on a lobby. Both land here so a failed move reads
  // the same either way — and it does fail, on purpose, whenever the
  // destination's own rules would have refused the person being moved.
  const handleMoveMember = async (
    sourceLobbyId: string,
    userId: string,
    username: string,
    targetLobbyId: string,
  ): Promise<void> => {
    const targetName =
      lobbies.find((lobby) => lobby.id === targetLobbyId)?.name ?? "odaya";

    const result = await workspaceService.moveLobbyMember({
      lobbyId: sourceLobbyId,
      userId,
      targetLobbyId,
    });

    if (result.ok) {
      message.success(`${username} → ${targetName}`);
    } else {
      message.error(getApiErrorMessage(result.error));
    }
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

  const handleTimeoutMember = async (
    lobbyId: string,
    userId: string,
    username: string,
    durationSeconds?: number,
  ): Promise<void> => {
    const result = await workspaceService.timeoutLobbyMember({
      lobbyId,
      userId,
      durationSeconds,
    });
    if (result.ok) {
      message.success(
        `${username} lobiye giremeyecek (${describeDuration(durationSeconds)})`,
      );
    } else {
      message.error(getApiErrorMessage(result.error));
    }
  };

  const handleMuteMember = async (
    lobbyId: string,
    userId: string,
    username: string,
    muted: boolean,
    durationSeconds?: number,
  ): Promise<void> => {
    const result = await workspaceService.muteLobbyMember({
      lobbyId,
      userId,
      muted,
      durationSeconds,
    });
    if (result.ok) {
      message.success(
        muted
          ? `${username} susturuldu (${describeDuration(durationSeconds)})`
          : `${username} sesi açıldı`,
      );
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
      // 0 rather than undefined when the field is cleared: undefined would keep
      // whatever the room has, and clearing it means "go back to the default".
      editingLobby.isTextOnly ? undefined : (editCapacity ?? 0),
      editDisabledFeatures,
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
    setEditCapacity(null);
    setEditDisabledFeatures([]);
  };

  // The room on screen — the same answer `isDisplayed` computes per row, hoisted
  // because a collapsed category needs it to decide what it may not hide.
  const displayedLobbyId = openTextRoomId ?? activeLobbyId;

  // Two kinds of room, two groups. Voice and text used to be interleaved in one
  // flat column with only their glyph telling them apart, which in a 280px
  // sidebar with a dozen rooms read as one undifferentiated list.
  const categories: Array<{
    key: string;
    label: string;
    icon: ReactNode;
    lobbies: LobbyDescriptor[];
    open: boolean;
    preferenceKey: keyof ViewPreferences;
  }> = [
    {
      key: "voice",
      label: "Sesli Odalar",
      icon: <SoundOutlined />,
      lobbies: lobbies.filter((lobby) => !lobby.isTextOnly),
      open: isVoiceCategoryOpen,
      preferenceKey: "lobbyVoiceCategoryOpen",
    },
    {
      key: "text",
      label: "Mesaj Odaları",
      icon: <MessageOutlined />,
      lobbies: lobbies.filter((lobby) => lobby.isTextOnly),
      open: isTextCategoryOpen,
      preferenceKey: "lobbyTextCategoryOpen",
    },
  ];

  // One room's row, drawn the same way in either category. It used to be the
  // body of `lobbies.map(...)` inline; it is a function now because the list is
  // no longer one flat column — the same markup is rendered under "Sesli Odalar"
  // and under "Mesaj Odaları".
  const renderLobby = (lobby: LobbyDescriptor) => {
          const isEditing = renamingLobbyId === lobby.id;
          const isDeleting = deletingLobbyId === lobby.id;
          const members = lobbyMembersById[lobby.id] ?? [];
          // Two different kinds of "current", and they used to be drawn with
          // the same highlight: connected to a voice lobby, and reading a room.
          // They can be true of two different rows at once — sitting in voice
          // while reading a text channel — so each gets its own mark: the
          // selected row is the one on screen, the live dot is the room your
          // microphone is in.
          const isJoined = activeLobbyId === lobby.id;
          // Clicking the voice lobby you are already connected to while reading
          // a text room has to stay live: that click is how you get back to it.
          const isDisplayed = openTextRoomId
            ? openTextRoomId === lobby.id
            : activeLobbyId === lobby.id;
          const creatorPresent = members.some((m) => m.userId === lobby.createdBy);
          const isDisabled = isEditing || isDeleting || joiningLobbyId !== null;
          const unreadCount = unreadByLobbyId[lobby.id] ?? 0;
          // A drop is a moderation action on BOTH rooms: you may not deposit
          // somebody in a room you have no say over, so the destination is
          // checked here as well as on the server.
          const acceptsDrop =
            canDropMemberOn(draggedMember, lobby) &&
            canManageLobby(lobby.createdBy, currentUserId, currentUserRole);
          const isDropTarget = acceptsDrop && dropTargetLobbyId === lobby.id;

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

          // The row itself is a real button now. It used to be a <li
          // role="option"> with a tabIndex and a hand-written Enter/Space
          // handler, wrapped around the profile buttons and the member list —
          // an option is not allowed to contain either.
          const lobbyRow = (
            <button
              type="button"
              className={[
                "ct-lobby-row",
                // A channel, not a room with the sound off: the modifier is what
                // lets the stylesheet drop the room affordances (the occupancy
                // slot, the heavier hover) for something nobody joins.
                lobby.isTextOnly ? "text-room" : "",
                isDisplayed ? "active" : "",
                isJoined ? "joined" : "",
                isDisabled ? "busy" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              // aria-disabled, not disabled: a disabled button swallows
              // contextmenu as well, and the settings menu hanging off this row
              // has to stay reachable while some other room is being joined.
              aria-disabled={isDisabled || undefined}
              aria-current={isDisplayed ? "true" : undefined}
              onClick={handleLobbyClick}
            >
              {/* The room's KIND, in the slot the "#" used to occupy: a
                  speaker for a voice lobby, a chat bubble for a message room.
                  The hash said the same thing about both, so the one glyph on
                  the row carried no information at all. */}
              <span
                className="ct-lobby-row-icon"
                title={
                  lobby.isTextOnly
                    ? "Yazılı sohbet — sesli bağlantı yok"
                    : "Sesli lobi"
                }
              >
                {/* "#" for a channel, a speaker for a room. The hash used to be
                    on both, which made it decoration; on one of them it is the
                    thing that says which is which. */}
                {lobby.isTextOnly ? (
                  <span className="ct-lobby-row-hash" aria-hidden="true">
                    #
                  </span>
                ) : (
                  <SoundOutlined />
                )}
              </span>

              <span className="ct-lobby-row-name">{lobby.name}</span>

              {lobby.isLocked && (
                <LockOutlined
                  className="ct-lobby-row-flag warn"
                  title="Bu lobi kilitlidir"
                />
              )}

              {/* The password used to be readable only from inside the
                  settings modal, so the row said nothing about the prompt
                  waiting behind the click. */}
              {lobby.hasPassword && (
                <KeyOutlined
                  className="ct-lobby-row-flag warn"
                  title="Şifre korumalı oda"
                />
              )}

              {creatorPresent && (
                <CrownOutlined
                  className="ct-lobby-row-flag ok"
                  title="Kurucu şu an lobide"
                />
              )}

              {unreadCount > 0 && (
                <span
                  className="ct-lobby-unread"
                  title={`${unreadCount} okunmamış mesaj`}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}

              {!lobby.isTextOnly && members.length > 0 && (
                <span
                  className="ct-lobby-row-count"
                  title={
                    lobby.capacity ? "Üye sayısı / kapasite" : "Üye sayısı"
                  }
                >
                  <TeamOutlined />
                  {lobby.capacity
                    ? `${members.length} / ${lobby.capacity}`
                    : members.length}
                </span>
              )}
            </button>
          );

          const isOwner = canManageLobby(
            lobby.createdBy,
            currentUserId,
            currentUserRole,
          );
          const hasLobbyMenu = !isDefaultLobby(lobby) && isOwner;

          return (
            <li
              key={lobby.id}
              className={`ct-lobby-group ${isDropTarget ? "drop-target" : ""}`}
              // preventDefault is what MAKES this a drop target; without it the
              // browser refuses the drop and the drag snaps back with no clue
              // as to why. Only called when the room can actually take them,
              // so an illegal destination stays visibly inert.
              onDragOver={(event) => {
                if (!acceptsDrop) {
                  return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDropTargetLobbyId(lobby.id);
              }}
              onDragLeave={() => {
                setDropTargetLobbyId((previous) =>
                  previous === lobby.id ? null : previous,
                );
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDropTargetLobbyId(null);
                // The payload is read back from the drag rather than trusted
                // from state: state is this window's guess, dataTransfer is
                // what was actually dropped.
                const payload =
                  decodeMemberDrag(event.dataTransfer.getData(MEMBER_DRAG_TYPE)) ??
                  draggedMember;
                if (!payload || !canDropMemberOn(payload, lobby)) {
                  return;
                }
                void handleMoveMember(
                  payload.sourceLobbyId,
                  payload.userId,
                  payload.username,
                  lobby.id,
                );
              }}
            >
              {hasLobbyMenu ? (
                <Dropdown
                  menu={{ items: contextMenuItems }}
                  trigger={["contextMenu"]}
                >
                  {lobbyRow}
                </Dropdown>
              ) : (
                lobbyRow
              )}

              {/* A message room has no occupancy at all — nobody is ever "in"
                  one — and an empty voice lobby says so only on the row being
                  looked at. Ten rooms each repeating "Lobide kimse yok." was
                  ten lines of noise in a 280px column; the absent count already
                  says the same thing. */}
              {isDisplayed && !lobby.isTextOnly && members.length === 0 && (
                <p className="ct-lobby-empty">Lobide kimse yok.</p>
              )}

              {members.length > 0 && (
                  <ul
                    className="ct-lobby-members"
                    aria-label={`${lobby.name} üyeleri`}
                  >
                    {members.map((member) => {
                      const micOpen = !member.muted && !member.serverMuted;
                      const headphoneOpen = !member.deafened;
                      const isSelf = member.userId === currentUserId;
                      // Read for every row, not just the active room's: the
                      // preference is keyed by person and survives lobbies, so
                      // a row that does not show it is hiding the reason this
                      // person will be silent when you next sit with them.
                      const locallyMuted =
                        !isSelf &&
                        isRemoteParticipantMuted(
                          participantAudio?.preferences[member.userId],
                        );
                      const canModerate =
                        canManageLobby(lobby.createdBy, currentUserId, currentUserRole) &&
                        member.userId !== currentUserId;

                      const memberRow = (
                        <li
                          key={member.userId}
                          className={`ct-lobby-member ${
                            canModerate ? "draggable" : ""
                          }`}
                          // Only a moderator can drag: for everybody else the
                          // row would pick up, follow the cursor and drop into
                          // a refusal. The menu makes the same offer, and both
                          // are gated on the same answer.
                          draggable={canModerate}
                          onDragStart={(event) => {
                            if (!canModerate) {
                              return;
                            }
                            const payload = {
                              userId: member.userId,
                              username: member.username,
                              sourceLobbyId: lobby.id,
                            };
                            event.dataTransfer.setData(
                              MEMBER_DRAG_TYPE,
                              encodeMemberDrag(payload),
                            );
                            // text/plain as well, so dropping the drag outside
                            // the app pastes a name rather than nothing.
                            event.dataTransfer.setData(
                              "text/plain",
                              member.username,
                            );
                            event.dataTransfer.effectAllowed = "move";
                            setDraggedMember(payload);
                          }}
                          onDragEnd={() => {
                            setDraggedMember(null);
                            setDropTargetLobbyId(null);
                          }}
                          // The position is kept because "Profili Gör" opens the
                          // card where the right-click landed.
                          //
                          // Nothing has to be stopped from bubbling here any
                          // more: the lobby's own row is a SIBLING button now,
                          // not this row's ancestor, so a click aimed at a
                          // person can no longer fall through and join the room
                          // they happen to be standing in.
                          onContextMenu={(event) => {
                            lastContextPointRef.current = {
                              x: event.clientX,
                              y: event.clientY,
                            };
                          }}
                        >
                          {/* The trigger stretches across the row — avatar,
                              name and the empty space after it — rather than
                              hugging the text. A 60px-wide target inside a
                              240px row meant most clicks aimed at a person
                              missed and hit the lobby underneath. */}
                          <UserProfileCardPopover
                            userId={member.userId}
                            fallbackName={member.username}
                            currentUserId={currentUserId}
                            friends={friends}
                          >
                            <button
                              type="button"
                              className="ct-profile-trigger ct-lobby-member-identity"
                              aria-label={`${member.username} profilini aç`}
                            >
                              <LobbyMemberAvatar
                                userId={member.userId}
                                username={member.username}
                                avatarUrl={avatarByUserId[member.userId]}
                              />

                              <span className="ct-lobby-member-name">
                                {member.username}
                              </span>

                              {member.userId === lobby.createdBy && (
                                <CrownOutlined
                                  title="Lobi sahibi"
                                  className="ct-lobby-member-flag on"
                                />
                              )}
                            </button>
                          </UserProfileCardPopover>

                          <div className="ct-lobby-member-icons">
                            <GameActivityBadge
                              activity={gameActivityByUser.get(member.userId)}
                            />

                            {/* Your own mute wins the icon: it is the only one
                                of the three states you can act on, and it holds
                                whether or not their microphone is open. Amber
                                rather than the red a moderator mute uses —
                                different act, different consequence. */}
                            {locallyMuted ? (
                              <AudioMutedOutlined
                                className="ct-lobby-member-flag self-muted"
                                title="Siz susturdunuz (sağ tık: sesi aç)"
                              />
                            ) : micOpen ? (
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

                            {/* Same glyph in both states, struck through when
                                off. It used to become MutedOutlined, which is a
                                crossed-out speaker -- a different device. */}
                            <CustomerServiceOutlined
                              className={`ct-lobby-member-flag ${
                                headphoneOpen ? "on" : "off ct-icon-slashed"
                              }`}
                              title={
                                headphoneOpen ? "Kulaklık açık" : "Kulaklık kapalı"
                              }
                            />

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

                      // Offered from any row, not only the active room's. The
                      // preference is keyed by person and persisted, so muting
                      // somebody two lobbies over is a real choice that holds
                      // when they walk into yours — and a row drawn as muted
                      // has to carry the way back out of it.
                      const audio =
                        !isSelf && participantAudio
                          ? {
                              preference:
                                participantAudio.preferences[member.userId] ??
                                DEFAULT_REMOTE_PARTICIPANT_AUDIO_PREFERENCE,
                              onMute: (muted: boolean) =>
                                participantAudio.setMuted(member.userId, muted),
                              onVolume: (volumePercent: number) =>
                                participantAudio.setVolume(
                                  member.userId,
                                  volumePercent,
                                ),
                              onEmoteMute: (muted: boolean) =>
                                participantAudio.setEmoteMuted(
                                  member.userId,
                                  muted,
                                ),
                            }
                          : undefined;

                      return (
                        <LobbyMemberContextMenu
                          key={member.userId}
                          username={member.username}
                          isSelf={isSelf}
                          onShowProfile={() =>
                            setProfileCardTarget({
                              userId: member.userId,
                              name: member.username,
                              ...lastContextPointRef.current,
                            })
                          }
                          onSendMessage={() => onOpenConversation?.(member.userId)}
                          friendState={friendStateOf(member.userId)}
                          isFriendActionPending={friends.pendingUserIds.includes(
                            member.userId,
                          )}
                          onAddFriend={() => void handleAddFriend(member.userId)}
                          onRemoveFriend={() =>
                            void handleRemoveFriend(member.userId)
                          }
                          audio={audio}
                          canModerate={canModerate}
                          isServerMuted={Boolean(member.serverMuted)}
                          onServerMute={(muted, durationSeconds) =>
                            void handleMuteMember(
                              lobby.id,
                              member.userId,
                              member.username,
                              muted,
                              durationSeconds,
                            )
                          }
                          // Only rooms this moderator may also moderate: a
                          // destination they have no say over answers 403, and
                          // offering it is offering a click that cannot work.
                          moveTargets={buildMoveTargets(
                            lobbies.filter((candidate) =>
                              canManageLobby(
                                candidate.createdBy,
                                currentUserId,
                                currentUserRole,
                              ),
                            ),
                            lobby.id,
                          )}
                          onMove={(targetLobbyId) =>
                            void handleMoveMember(
                              lobby.id,
                              member.userId,
                              member.username,
                              targetLobbyId,
                            )
                          }
                          onKick={() =>
                            void handleKickMember(
                              lobby.id,
                              member.userId,
                              member.username,
                            )
                          }
                          onTimeout={(durationSeconds) =>
                            void handleTimeoutMember(
                              lobby.id,
                              member.userId,
                              member.username,
                              durationSeconds,
                            )
                          }
                        >
                          {memberRow}
                        </LobbyMemberContextMenu>
                      );
                    })}
                  </ul>
              )}
            </li>
          );
  };

  return (
    <>
      {/* Not role="listbox" any more: every row carries a button, a nested
          member list and its own menus, and an option is not allowed to hold
          interactive content — a screen reader read the whole column as one
          broken select. A list of rooms is a list. */}
      <div className="ct-lobby-list">
        {lobbiesQuery.isPending && (
          <div className="ct-list-state">Lobiler yükleniyor...</div>
        )}

        {!lobbiesQuery.isPending && lobbiesQuery.isError && (
          <div className="ct-list-state error">
            Lobiler alınamadı: {lobbiesQuery.error.message}
          </div>
        )}

        {!lobbiesQuery.isPending &&
          !lobbiesQuery.isError &&
          !lobbiesQuery.data?.ok && (
            <div className="ct-list-state error">
              Lobiler alınamadı: {getApiErrorMessage(lobbiesQuery.data?.error)}
            </div>
          )}

        {!lobbiesQuery.isPending &&
          !lobbiesQuery.isError &&
          lobbiesQuery.data?.ok &&
          lobbies.length === 0 && (
            <div className="ct-list-state">
              <TeamOutlined className="ct-list-state-icon" />
              <p>Aktif lobi bulunamadı.</p>
            </div>
          )}

        {categories.map((category) => {
          if (category.lobbies.length === 0) {
            return null;
          }

          // A collapsed category still shows the room you are standing in.
          // Folding "Sesli Odalar" away while connected otherwise hid the one
          // row that says where your microphone is — and the roster with it.
          const visible = category.open
            ? category.lobbies
            : category.lobbies.filter(
                (lobby) =>
                  lobby.id === activeLobbyId || lobby.id === displayedLobbyId,
              );
          const hiddenUnread = category.open
            ? 0
            : category.lobbies.reduce(
                (total, lobby) =>
                  visible.some((shown) => shown.id === lobby.id)
                    ? total
                    : total + (unreadByLobbyId[lobby.id] ?? 0),
                0,
              );

          return (
            <section
              key={category.key}
              className={`ct-lobby-category ${category.open ? "open" : ""}`}
            >
              <button
                type="button"
                className="ct-lobby-category-header"
                aria-expanded={category.open}
                onClick={() =>
                  setViewPreference(category.preferenceKey, !category.open)
                }
                title={category.open ? "Kategoriyi kapat" : "Kategoriyi aç"}
              >
                <RightOutlined className="ct-lobby-category-chevron" />
                <span className="ct-lobby-category-icon">{category.icon}</span>
                <span className="ct-lobby-category-label">
                  {category.label}
                </span>
                <span className="ct-lobby-category-count">
                  {category.lobbies.length}
                </span>
                {hiddenUnread > 0 && (
                  <span
                    className="ct-lobby-unread"
                    title={`${hiddenUnread} okunmamış mesaj`}
                  >
                    {hiddenUnread > 99 ? "99+" : hiddenUnread}
                  </span>
                )}
              </button>

              {visible.length > 0 && (
                <ul
                  className="ct-lobby-category-items"
                  aria-label={category.label}
                >
                  {visible.map(renderLobby)}
                </ul>
              )}
            </section>
          );
        })}
      </div>

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
          {/* Read-only, above the knobs: who made the room, when, how full it
              is and who its rules actually let in. An admin sees every room in
              this list, and none of this was rendered anywhere in the
              workspace before — the owner's name least of all. */}
          {editingLobby && (
            <section className="ct-lobby-info">
              <div className="ct-lobby-info-head">
                <strong>{editingLobby.name}</strong>
                <code className="ct-lobby-info-id">{editingLobby.id}</code>
              </div>

              <div className="ct-lobby-info-row">
                <span>Sahibi</span>
                <span>
                  {editingLobby.createdByUsername
                    ? `@${editingLobby.createdByUsername}`
                    : editingLobby.createdBy}
                </span>
              </div>

              <div className="ct-lobby-info-row">
                <span>Oluşturulma</span>
                <span>
                  {new Date(editingLobby.createdAt).toLocaleString("tr-TR")}
                </span>
              </div>

              <div className="ct-lobby-info-row">
                <span>Kapasite</span>
                <span>
                  {editingLobby.capacity
                    ? `${editingLobby.memberCount} / ${editingLobby.capacity}`
                    : // No ceiling reported: an occupancy count under a
                      // "Kapasite" label reads as one.
                      "—"}
                </span>
              </div>

              <div className="ct-lobby-info-row">
                <span>Gizlilik</span>
                <span>
                  {editingLobby.isLocked ? (
                    <Tag color="orange" icon={<LockOutlined />}>
                      Kilitli
                    </Tag>
                  ) : (
                    <Tag color="green">Herkese açık</Tag>
                  )}
                  {editingLobby.hasPassword && (
                    <Tag color="gold" icon={<KeyOutlined />}>
                      Şifre korumalı
                    </Tag>
                  )}
                  {editingLobby.isTextOnly && (
                    <Tag color="blue" icon={<MessageOutlined />}>
                      Metin odası
                    </Tag>
                  )}
                </span>
              </div>

              <div className="ct-lobby-info-row">
                <span>Erişimi olanlar</span>
                <span>
                  {allowedUserIds.length === 0 ? (
                    <Tag color="default">Liste boş</Tag>
                  ) : (
                    // The raw id until its card lands, and permanently for an
                    // account the server will not name.
                    allowedUserIds.map((userId) => (
                      <Tag color="blue" key={userId}>
                        {allowedUserCards[userId]
                          ? `@${allowedUserCards[userId].username}`
                          : userId}
                      </Tag>
                    ))
                  )}
                </span>
              </div>

              {/* A text room refuses every voice join before any privilege
                  check, so the "always gets in" line only holds for voice
                  rooms; access to the room itself still follows the list. */}
              <p className="ct-field-hint">
                {editingLobby.isTextOnly
                  ? "Bu bir metin odası: kimse sesli katılamaz, yöneticiler dahil. Listenin dışında oda sahibi ve yöneticiler odayı yine de açabilir."
                  : "Bu listenin dışında oda sahibi ve tüm yöneticiler her zaman girebilir; oda şifreliyse doğru şifreyi bilen herkes de girer."}
              </p>
            </section>
          )}

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

          {/* A <div>, not a <label>: there are two controls in here, and a
              label that points at two things points at neither. */}
          {editIsLocked && (
            <div className="ct-field">
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
              <Input.Search
                placeholder="Kullanıcı adıyla ekle"
                enterButton="Ekle"
                value={lookupUsername}
                onChange={(event) => setLookupUsername(event.target.value)}
                onSearch={() => void handleLookupAdd()}
                loading={isLookingUp}
                maxLength={32}
              />

              <p className="ct-field-hint">
                Listede olmayan birini tam kullanıcı adıyla ekleyebilirsin.
              </p>
            </div>
          )}

          {/* Sesli odalara özel, aynı sebeple: mesaj odasının rosteri yok, bir
              kişi sınırı orada hiçbir şeye uygulanmaz. */}
          {!editingLobby?.isTextOnly && (
            <label className="ct-field">
              <span>Kişi Sınırı</span>
              <InputNumber
                className="ct-input-number"
                min={2}
                max={100}
                value={editCapacity}
                onChange={(value) => setEditCapacity(value ?? null)}
                placeholder="Sunucu varsayılanı"
              />
              <small className="ct-field-hint">
                Boş bırakırsan sunucunun varsayılan sınırı geçerli olur. Sınırı
                düşürmek kimseyi odadan çıkarmaz, yalnızca yeni katılımları
                durdurur.
              </small>
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

          <div className="ct-field">
            <span>Oda Özellikleri</span>
            <small className="ct-field-hint">
              Kapattığın özellik bu odada kimse tarafından kullanılamaz. Diğer
              odalar etkilenmez.
            </small>
            <div className="ct-lobby-feature-grid">
              {LOBBY_FEATURES.filter(
                (feature) =>
                  !editingLobby?.isTextOnly ||
                  feature.id === "chat" ||
                  feature.id === "attachments",
              ).map((feature) => {
                const enabled = !editDisabledFeatures.includes(feature.id);
                return (
                  <label key={feature.id} className="ct-lobby-feature-row">
                    <Switch
                      size="small"
                      checked={enabled}
                      onChange={(next) =>
                        setEditDisabledFeatures((previous) =>
                          next
                            ? previous.filter((id) => id !== feature.id)
                            : [...previous, feature.id],
                        )
                      }
                    />
                    <span>{feature.label}</span>
                  </label>
                );
              })}
            </div>
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

      {/* Anchored at the cursor rather than at the row: the sidebar scrolls and
          the row is 24px tall, so a popover hung off it lands half off-screen
          for anyone near the bottom of a long list. */}
      {profileCardTarget && (
        <UserProfileCardAnchor
          x={profileCardTarget.x}
          y={profileCardTarget.y}
          userId={profileCardTarget.userId}
          fallbackName={profileCardTarget.name}
          currentUserId={currentUserId}
          friends={friends}
          onClose={() => setProfileCardTarget(null)}
        />
      )}
    </>
  );
}


