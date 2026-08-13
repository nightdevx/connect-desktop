import type { KeyboardEvent } from "react";
import { Input, Segmented, Badge, Select } from "antd";
import { SearchOutlined, PhoneOutlined } from "@ant-design/icons";
import type {
  SelectablePresenceStatus,
  UserDirectoryEntry,
} from "@shared/auth-contracts";
import type { UseWorkspaceUsersResult } from "../../hooks/user/use-workspace-users";
import type { CallSessionState } from "../../hooks/user/use-call-session";
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

const FILTER_OPTIONS = [
  { label: "Tümü", value: "all" },
  { label: "Çevrimiçi", value: "online" },
  { label: "Çevrimdışı", value: "offline" },
];

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
  callState,
  presenceStatus = "online",
  onPresenceStatusChange,
}: UsersSidebarPanelProps) {
  const isReady =
    !usersQuery.isPending && !usersQuery.isError && Boolean(usersQuery.data?.ok);

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
        value={userFilter}
        onChange={(value) =>
          onUserFilterChange(value as UseWorkspaceUsersResult["userFilter"])
        }
        options={FILTER_OPTIONS}
        className="ct-segmented-premium"
      />

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

        {isReady && filteredUsers.length === 0 && (
          <li className="ct-list-state">
            <SearchOutlined className="ct-list-state-icon" />
            <p>Aramaya uygun kullanıcı bulunamadı.</p>
            <span>Farklı bir isim deneyin veya filtreleri değiştirin.</span>
          </li>
        )}

        {filteredUsers.map((user) => {
          const unreadCount = unreadByUserId[user.userId] ?? 0;
          const isSelected = selectedUserId === user.userId;
          const isUnread = unreadCount > 0 && !isSelected;
          const isCalling =
            callState?.status === "incoming" &&
            callState.callerId === user.userId;

          return (
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
        })}
      </ul>
    </>
  );
}
