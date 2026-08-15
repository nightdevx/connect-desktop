import { useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { Badge, Select, Dropdown, Tooltip } from "antd";
import {
  MessageOutlined,
  PhoneOutlined,
  CloseCircleOutlined,
  CloseOutlined,
  HomeOutlined,
  UserDeleteOutlined,
} from "@ant-design/icons";
import type {
  SelectablePresenceStatus,
  UserDirectoryEntry,
} from "@shared/auth-contracts";
import type { FriendsController } from "../../hooks/user/use-friends";
import type { OpenConversation } from "../../hooks/user/use-open-conversations";
import type { CallSessionState } from "../../hooks/user/use-call-session";
import { ConfirmActionModal } from "../common";
import {
  getDisplayInitials,
  getPresenceColor,
  getUserStatusLabel,
} from "../../workspace-utils";

interface UsersSidebarPanelProps {
  conversations: OpenConversation[];
  onCloseConversation: (userId: string) => void;
  // Clears the selection so the friends home renders. Distinct from
  // onCloseConversation: this leaves every open conversation open.
  onOpenHome: () => void;
  directoryUsers: UserDirectoryEntry[];
  selectedUserId: string | null;
  onUserSelect: (userId: string) => void;
  unreadByUserId: Record<string, number>;
  friends: FriendsController;
  callState?: CallSessionState;
  presenceStatus?: SelectablePresenceStatus;
  onPresenceStatusChange?: (status: SelectablePresenceStatus) => void;
}

const PRESENCE_OPTIONS: Array<{
  value: SelectablePresenceStatus;
  label: string;
}> = [
  { value: "online", label: "Çevrimiçi" },
  { value: "idle", label: "Boşta" },
  { value: "dnd", label: "Rahatsız etmeyin" },
];

export function UsersSidebarPanel({
  conversations,
  onCloseConversation,
  onOpenHome,
  directoryUsers,
  selectedUserId,
  onUserSelect,
  unreadByUserId,
  friends,
  callState,
  presenceStatus = "online",
  onPresenceStatusChange,
}: UsersSidebarPanelProps) {
  const friendIdSet = useMemo(
    () => new Set(friends.friendIds),
    [friends.friendIds],
  );

  // Presence rides the directory, which is friends + self. A conversation with
  // a non-friend therefore has no status to show and reads as offline — the
  // same degradation the lobby member rows accept for avatars.
  const presenceByUserId = useMemo(
    () => new Map(directoryUsers.map((user) => [user.userId, user] as const)),
    [directoryUsers],
  );

  // Unfriending cannot be undone by the person doing it — the other side has to
  // accept a fresh request — so it goes through a confirmation.
  const [pendingUnfriend, setPendingUnfriend] = useState<{
    userId: string;
    name: string;
  } | null>(null);

  const confirmUnfriend = (): void => {
    if (!pendingUnfriend) {
      return;
    }
    void friends.removeFriend(pendingUnfriend.userId).then(() => {
      setPendingUnfriend(null);
    });
  };

  // A div with an onClick is invisible to the keyboard. Rows are options in a
  // listbox and answer to Enter and Space like every other list control.
  const activateOnKey = (
    event: KeyboardEvent<HTMLLIElement>,
    userId: string,
  ): void => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    onUserSelect(userId);
  };

  return (
    <>
      {onPresenceStatusChange && (
        <div className="ct-presence-picker">
          <span
            className="ct-presence-swatch"
            style={{ background: getPresenceColor(true, presenceStatus) }}
            aria-hidden="true"
          />
          <Select
            size="small"
            variant="borderless"
            value={presenceStatus}
            onChange={onPresenceStatusChange}
            options={PRESENCE_OPTIONS}
            aria-label="Durumunuz"
          />
        </div>
      )}

      {/* Sits outside the listbox on purpose: a listbox may only own options,
          and this is navigation, not a conversation. Before it existed the only
          way back to the friends home was to right-click your open conversation
          and close it — which also removed it from this list. */}
      <button
        type="button"
        className={`ct-list-home ${selectedUserId === null ? "active" : ""}`}
        onClick={onOpenHome}
        aria-current={selectedUserId === null ? "page" : undefined}
      >
        <HomeOutlined />
        <span>Ana Sayfa</span>
      </button>

      <ul className="ct-list" role="listbox" aria-label="Sohbetler">
        {conversations.length === 0 && (
          <li className="ct-list-state">
            <MessageOutlined className="ct-list-state-icon" />
            <p>Açık sohbetiniz yok.</p>
            <span>
              Arkadaşlar sekmesinden bir arkadaşınıza yazarak başlayın.
            </span>
          </li>
        )}

        {conversations.map((conversation) => {
          const { userId } = conversation;
          const directoryUser = presenceByUserId.get(userId);
          const name =
            conversation.displayName ||
            conversation.username ||
            "Bilinmeyen kullanıcı";
          const unreadCount = unreadByUserId[userId] ?? 0;
          const isSelected = selectedUserId === userId;
          const isUnread = unreadCount > 0 && !isSelected;
          const isCalling =
            callState?.status === "incoming" && callState.callerId === userId;
          const isFriend = friendIdSet.has(userId);

          const row = (
            <li
              className={`ct-list-item clickable ${isSelected ? "active" : ""} ${isUnread ? "unread" : ""}`}
              role="option"
              aria-selected={isSelected}
              tabIndex={0}
              onClick={() => onUserSelect(userId)}
              onKeyDown={(event) => activateOnKey(event, userId)}
            >
              <div className="ct-list-user">
                <div className="ct-user-avatar with-presence" aria-hidden="true">
                  <div className="ct-user-avatar-core">
                    {conversation.avatarUrl ? (
                      <img
                        className="ct-user-avatar-image"
                        src={conversation.avatarUrl}
                        alt=""
                      />
                    ) : (
                      <span className="ct-user-avatar-fallback">
                        {getDisplayInitials(name)}
                      </span>
                    )}
                  </div>

                  <span
                    className="ct-presence-dot"
                    style={{
                      background: getPresenceColor(
                        directoryUser?.appOnline,
                        directoryUser?.presence,
                      ),
                    }}
                  />
                </div>

                <div className="ct-list-user-meta">
                  <p>
                    <span className="truncate">{name}</span>
                    {isCalling && (
                      <PhoneOutlined
                        className="ct-calling-icon"
                        aria-label="Sizi arıyor"
                      />
                    )}
                  </p>
                  <span>
                    {getUserStatusLabel(
                      directoryUser?.appOnline,
                      directoryUser?.presence,
                    )}
                  </span>
                </div>
              </div>

              <div className="ct-list-item-actions">
                {unreadCount > 0 && (
                  <Badge count={unreadCount} overflowCount={99} />
                )}

                {/* Revealed on hover, next to the unread badge. The right-click
                    menu below still offers the same thing — this is the
                    discoverable version of it. stopPropagation because the row
                    itself selects the conversation. */}
                <Tooltip title="Sohbeti Kapat">
                  <button
                    type="button"
                    className="ct-list-item-close"
                    aria-label={`${name} sohbetini kapat`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onCloseConversation(userId);
                    }}
                    // Enter/Space on the button would otherwise bubble to the
                    // row's own key handler and reopen what was just closed.
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <CloseOutlined />
                  </button>
                </Tooltip>
              </div>
            </li>
          );

          // Right-click, the same secondary-action gesture the lobby list and
          // its member rows already use. Closing destroys nothing — the history
          // stays on the server and the person is one click away in the
          // friends home — so it needs no confirmation.
          return (
            <Dropdown
              key={userId}
              trigger={["contextMenu"]}
              menu={{
                items: [
                  {
                    key: "close",
                    label: "Sohbeti Kapat",
                    icon: <CloseCircleOutlined />,
                    onClick: () => onCloseConversation(userId),
                  },
                  ...(isFriend
                    ? [
                        {
                          key: "unfriend",
                          label: "Arkadaşlıktan Çıkar",
                          icon: <UserDeleteOutlined />,
                          danger: true,
                          disabled: friends.pendingUserIds.includes(userId),
                          onClick: () => setPendingUnfriend({ userId, name }),
                        },
                      ]
                    : []),
                ],
              }}
            >
              {row}
            </Dropdown>
          );
        })}
      </ul>

      <ConfirmActionModal
        isOpen={pendingUnfriend !== null}
        title="Arkadaşlıktan Çıkar"
        message={`${pendingUnfriend?.name ?? ""} arkadaş listenizden kaldırılacak. Geri almak için karşı tarafın yeni isteğinizi kabul etmesi gerekir.`}
        confirmLabel="Arkadaşlıktan Çıkar"
        isProcessing={
          pendingUnfriend !== null &&
          friends.pendingUserIds.includes(pendingUnfriend.userId)
        }
        onConfirm={confirmUnfriend}
        onCancel={() => setPendingUnfriend(null)}
      />
    </>
  );
}
