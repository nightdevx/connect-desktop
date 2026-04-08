import { Search } from "lucide-react";
import type { UserDirectoryEntry } from "../../../../../shared/auth-contracts";
import type { UseWorkspaceUsersResult } from "../hooks/use-workspace-users";
import {
  getApiErrorMessage,
  getDisplayInitials,
  getUserStatusLabel,
} from "../workspace-utils";

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
}: UsersSidebarPanelProps) {
  return (
    <>
      <div className="ct-users-toolbar">
        <label className="ct-users-search" aria-label="Kullanıcı ara">
          <Search size={15} aria-hidden="true" />
          <input
            type="text"
            value={userSearch}
            onChange={(event) => onUserSearchChange(event.target.value)}
            placeholder="İsim veya kullanıcı adı ara"
          />
        </label>
      </div>

      <div
        className="ct-users-filters"
        role="tablist"
        aria-label="Kullanıcı filtreleri"
      >
        <button
          type="button"
          className={`ct-filter-chip ${userFilter === "all" ? "active" : ""}`}
          onClick={() => onUserFilterChange("all")}
        >
          Tümü
        </button>
        <button
          type="button"
          className={`ct-filter-chip ${userFilter === "online" ? "active" : ""}`}
          onClick={() => onUserFilterChange("online")}
        >
          Çevrimiçi
        </button>
        <button
          type="button"
          className={`ct-filter-chip ${userFilter === "offline" ? "active" : ""}`}
          onClick={() => onUserFilterChange("offline")}
        >
          Çevrimdışı
        </button>
      </div>

      <ul className="ct-list">
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

        {!usersQuery.isPending &&
          !usersQuery.isError &&
          usersQuery.data?.ok &&
          filteredUsers.length === 0 && (
            <li className="ct-list-state">
              Aramaya uygun kullanıcı bulunamadı.
            </li>
          )}

        {filteredUsers.map((user) => {
          const unreadCount = unreadByUserId[user.userId] ?? 0;

          return (
            <li
              key={user.userId}
              className={`ct-list-item clickable ${selectedUserId === user.userId ? "active" : ""}`}
              onClick={() => onUserSelect(user.userId)}
            >
              <div className="ct-list-user">
                <div
                  className="ct-user-avatar with-presence"
                  aria-hidden="true"
                >
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
                    className={`ct-presence-dot ${user.appOnline ? "online" : "offline"}`}
                  />
                </div>

                <div>
                  <p>{user.displayName || user.username}</p>
                  <span>{getUserStatusLabel(user.appOnline)}</span>
                </div>
              </div>

              {unreadCount > 0 && (
                <span
                  className="ct-unread-badge"
                  aria-label={`${unreadCount} okunmamış mesaj`}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
