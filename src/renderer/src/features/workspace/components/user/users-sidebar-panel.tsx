import { useCallback, useMemo, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Input, Segmented, Badge, Select, Button, Tooltip, Dropdown } from "antd";
import {
  SearchOutlined,
  PhoneOutlined,
  CheckOutlined,
  CloseOutlined,
  UserDeleteOutlined,
} from "@ant-design/icons";
import type {
  SelectablePresenceStatus,
  UserDirectoryEntry,
} from "@shared/auth-contracts";
import type { UseWorkspaceUsersResult } from "../../hooks/user/use-workspace-users";
import type { FriendsController } from "../../hooks/user/use-friends";
import type { CallSessionState } from "../../hooks/user/use-call-session";
import { ConfirmActionModal } from "../common";
import {
  getApiErrorMessage,
  getDisplayInitials,
  getPresenceColor,
  getUserStatusLabel,
} from "../../workspace-utils";

interface UsersSidebarPanelProps {
  usersQuery: UseWorkspaceUsersResult["usersQuery"];
  userSearch: string;
  onUserSearchChange: (value: string) => void;
  userFilter: UseWorkspaceUsersResult["userFilter"];
  onUserFilterChange: (value: UseWorkspaceUsersResult["userFilter"]) => void;
  filteredUsers: UserDirectoryEntry[];
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

const FRIENDS_FILTER = "friends";

const FILTER_OPTIONS = [
  { label: "Tümü", value: "all" },
  { label: "Arkadaşlar", value: FRIENDS_FILTER },
  { label: "Çevrimiçi", value: "online" },
  { label: "Çevrimdışı", value: "offline" },
];

interface RequestRow {
  userId: string;
  user: UserDirectoryEntry | null;
  name: string;
}

// Incoming and outgoing rows differ only in their subtitle and their buttons —
// the avatar/name half is identical, so it lives here instead of twice.
function FriendRequestRow({
  row,
  subtitle,
  children,
}: {
  row: RequestRow;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <li className="ct-list-item">
      <div className="ct-list-user">
        <div className="ct-user-avatar" aria-hidden="true">
          <div className="ct-user-avatar-core">
            {row.user?.avatarUrl ? (
              <img
                className="ct-user-avatar-image"
                src={row.user.avatarUrl}
                alt=""
              />
            ) : (
              <span className="ct-user-avatar-fallback">
                {getDisplayInitials(row.name)}
              </span>
            )}
          </div>
        </div>

        <div className="ct-list-user-meta">
          <p>
            <span className="truncate">{row.name}</span>
          </p>
          <span>{subtitle}</span>
        </div>
      </div>

      <div className="ct-list-item-actions">{children}</div>
    </li>
  );
}

export function UsersSidebarPanel({
  usersQuery,
  userSearch,
  onUserSearchChange,
  userFilter,
  onUserFilterChange,
  filteredUsers,
  selectedUserId,
  onUserSelect,
  unreadByUserId,
  friends,
  callState,
  presenceStatus = "online",
  onPresenceStatusChange,
}: UsersSidebarPanelProps) {
  // "friends" is not part of UserFilter, which lives in workspace-utils and is
  // shared with the directory hook. Keeping the extra segment local avoids
  // widening that type for a narrowing the sidebar can do by itself; the cost
  // is that it resets when the section unmounts.
  const [friendsOnly, setFriendsOnly] = useState(false);

  const isReady =
    !usersQuery.isPending && !usersQuery.isError && Boolean(usersQuery.data?.ok);

  const friendIdSet = useMemo(
    () => new Set(friends.friendIds),
    [friends.friendIds],
  );

  const visibleUsers = useMemo(
    () =>
      friendsOnly
        ? filteredUsers.filter((user) => friendIdSet.has(user.userId))
        : filteredUsers,
    [filteredUsers, friendIdSet, friendsOnly],
  );

  // Requests arrive as bare ids; the names come from the unfiltered directory,
  // not from filteredUsers, or a search would hide the row that needs answering.
  const toRequestRows = useCallback(
    (userIds: string[]): RequestRow[] => {
      const directory = new Map<string, UserDirectoryEntry>(
        (usersQuery.data?.ok ? (usersQuery.data.data?.users ?? []) : []).map(
          (user) => [user.userId, user],
        ),
      );

      return userIds
        .map((userId) => {
          const user = directory.get(userId);
          return {
            userId,
            user: user ?? null,
            name: user?.displayName || user?.username || "Bilinmeyen kullanıcı",
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, "tr"));
    },
    [usersQuery.data],
  );

  const incomingRequestRows = useMemo(
    () => toRequestRows(friends.incomingRequests),
    [toRequestRows, friends.incomingRequests],
  );

  const outgoingRequestRows = useMemo(
    () => toRequestRows(friends.outgoingRequests),
    [toRequestRows, friends.outgoingRequests],
  );

  // Unfriending cannot be undone by the person doing it — the other side has to
  // accept a fresh request — so it goes through a confirmation.
  const [pendingUnfriend, setPendingUnfriend] = useState<RequestRow | null>(null);

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

  const handleFilterChange = (value: string): void => {
    if (value === FRIENDS_FILTER) {
      setFriendsOnly(true);
      // Otherwise a leftover "Çevrimdışı" would silently compound with the
      // friend narrowing and show offline friends only.
      onUserFilterChange("all");
      return;
    }

    setFriendsOnly(false);
    onUserFilterChange(value as UseWorkspaceUsersResult["userFilter"]);
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

      <Input
        className="ct-sidebar-search"
        placeholder="İsim veya kullanıcı adı ara..."
        value={userSearch}
        onChange={(event) => onUserSearchChange(event.target.value)}
        prefix={<SearchOutlined />}
        allowClear
      />

      <Segmented
        block
        value={friendsOnly ? FRIENDS_FILTER : userFilter}
        onChange={(value) => handleFilterChange(value as string)}
        options={FILTER_OPTIONS}
        className="ct-segmented-premium"
      />

      {incomingRequestRows.length > 0 && (
        <>
          <p className="ct-list-group-title">
            Gelen istekler ({incomingRequestRows.length})
          </p>

          <ul className="ct-list" role="list" aria-label="Arkadaşlık istekleri">
            {incomingRequestRows.map((request) => {
              const isPending = friends.pendingUserIds.includes(request.userId);

              return (
                // Both buttons carry the row's pending flag: it is keyed by
                // user id, not by which of the two was clicked, so putting the
                // spinner on one of them would point at the wrong action half
                // the time.
                <FriendRequestRow
                  key={request.userId}
                  row={request}
                  subtitle="Arkadaş olmak istiyor"
                >
                  <Tooltip title="Kabul et">
                    <Button
                      type="text"
                      size="small"
                      icon={<CheckOutlined />}
                      loading={isPending}
                      aria-label={`${request.name} isteğini kabul et`}
                      onClick={() => void friends.acceptRequest(request.userId)}
                    />
                  </Tooltip>
                  <Tooltip title="Reddet">
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<CloseOutlined />}
                      loading={isPending}
                      aria-label={`${request.name} isteğini reddet`}
                      onClick={() => void friends.removeFriend(request.userId)}
                    />
                  </Tooltip>
                </FriendRequestRow>
              );
            })}
          </ul>
        </>
      )}

      {/* A sent request was populated but rendered nowhere, so the sender could
          neither see it nor withdraw it. removeFriend is the cancel path. */}
      {outgoingRequestRows.length > 0 && (
        <>
          <p className="ct-list-group-title">
            Gönderilen istekler ({outgoingRequestRows.length})
          </p>

          <ul
            className="ct-list"
            role="list"
            aria-label="Gönderilen arkadaşlık istekleri"
          >
            {outgoingRequestRows.map((request) => (
              <FriendRequestRow
                key={request.userId}
                row={request}
                subtitle="Yanıt bekleniyor"
              >
                <Tooltip title="İptal et">
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<CloseOutlined />}
                    loading={friends.pendingUserIds.includes(request.userId)}
                    aria-label={`${request.name} isteğini iptal et`}
                    onClick={() => void friends.removeFriend(request.userId)}
                  />
                </Tooltip>
              </FriendRequestRow>
            ))}
          </ul>
        </>
      )}

      <ul className="ct-list" role="listbox" aria-label="Kullanıcılar">
        {usersQuery.isPending && (
          <li className="ct-list-state">Kullanıcılar yükleniyor...</li>
        )}

        {!usersQuery.isPending && usersQuery.isError && (
          <li className="ct-list-state error">
            Kullanıcılar alınamadı: {usersQuery.error.message}
          </li>
        )}

        {!usersQuery.isPending &&
          !usersQuery.isError &&
          !usersQuery.data?.ok && (
            <li className="ct-list-state error">
              Kullanıcılar alınamadı:{" "}
              {getApiErrorMessage(usersQuery.data?.error)}
            </li>
          )}

        {isReady && visibleUsers.length === 0 && (
          <li className="ct-list-state">
            <SearchOutlined className="ct-list-state-icon" />
            {friendsOnly ? (
              <>
                <p>Henüz arkadaşınız yok.</p>
                <span>Kullanıcı adıyla arkadaşlık isteği gönderin.</span>
              </>
            ) : (
              <>
                <p>Aramaya uygun kullanıcı bulunamadı.</p>
                <span>Farklı bir isim deneyin veya filtreleri değiştirin.</span>
              </>
            )}
          </li>
        )}

        {visibleUsers.map((user) => {
          const unreadCount = unreadByUserId[user.userId] ?? 0;
          const isSelected = selectedUserId === user.userId;
          const isUnread = unreadCount > 0 && !isSelected;
          const isCalling =
            callState?.status === "incoming" &&
            callState.callerId === user.userId;

          const row = (
            <li
              key={user.userId}
              className={`ct-list-item clickable ${isSelected ? "active" : ""} ${isUnread ? "unread" : ""}`}
              role="option"
              aria-selected={isSelected}
              tabIndex={0}
              onClick={() => onUserSelect(user.userId)}
              onKeyDown={(event) => activateOnKey(event, user.userId)}
            >
              <div className="ct-list-user">
                <div className="ct-user-avatar with-presence" aria-hidden="true">
                  <div className="ct-user-avatar-core">
                    {user.avatarUrl ? (
                      <img
                        className="ct-user-avatar-image"
                        src={user.avatarUrl}
                        alt=""
                      />
                    ) : (
                      <span className="ct-user-avatar-fallback">
                        {getDisplayInitials(user.displayName || user.username)}
                      </span>
                    )}
                  </div>

                  <span
                    className="ct-presence-dot"
                    style={{
                      background: getPresenceColor(user.appOnline, user.presence),
                    }}
                  />
                </div>

                <div className="ct-list-user-meta">
                  <p>
                    <span className="truncate">
                      {user.displayName || user.username}
                    </span>
                    {isCalling && (
                      <PhoneOutlined
                        className="ct-calling-icon"
                        aria-label="Sizi arıyor"
                      />
                    )}
                  </p>
                  <span>
                    {getUserStatusLabel(user.appOnline, user.presence)}
                  </span>
                </div>
              </div>

              {unreadCount > 0 && (
                <Badge count={unreadCount} overflowCount={99} />
              )}
            </li>
          );

          if (!friendIdSet.has(user.userId)) {
            return row;
          }

          // Right-click, the same secondary-action gesture the lobby list and
          // its member rows already use. A visible danger button would sit on a
          // listbox option whose whole job is to open the conversation.
          return (
            <Dropdown
              key={user.userId}
              trigger={["contextMenu"]}
              menu={{
                items: [
                  {
                    key: "unfriend",
                    label: "Arkadaşlıktan Çıkar",
                    icon: <UserDeleteOutlined />,
                    danger: true,
                    disabled: friends.pendingUserIds.includes(user.userId),
                    onClick: () =>
                      setPendingUnfriend({
                        userId: user.userId,
                        user,
                        name: user.displayName || user.username,
                      }),
                  },
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
