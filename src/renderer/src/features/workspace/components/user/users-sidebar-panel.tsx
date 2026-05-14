import { Input, Segmented, Badge } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import type { UserDirectoryEntry } from "../../../../../shared/auth-contracts";
import type { UseWorkspaceUsersResult } from "../../hooks/use-workspace-users";
import {
  getApiErrorMessage,
  getDisplayInitials,
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
      <div className="ct-users-toolbar" style={{ padding: "12px 16px 8px 16px" }}>
        <Input
          placeholder="İsim veya kullanıcı adı ara..."
          value={userSearch}
          onChange={(event) => onUserSearchChange(event.target.value)}
          prefix={<SearchOutlined style={{ color: "rgba(255, 255, 255, 0.3)" }} />}
          allowClear
          className="ct-search-premium"
          style={{
            background: "rgba(10, 10, 10, 0.6)",
            borderColor: "rgba(255, 255, 255, 0.08)",
            color: "#f5f5f5",
            borderRadius: "8px",
          }}
        />
      </div>

      <div className="px-4 py-2">
        <Segmented
          block
          value={userFilter}
          onChange={(value) => onUserFilterChange(value as any)}
          options={[
            { label: "Tümü", value: "all" },
            { label: "Çevrimiçi", value: "online" },
            { label: "Çevrimdışı", value: "offline" },
          ]}
          className="ct-segmented-premium"
        />
      </div>

      <ul className="ct-list" style={{ marginTop: "8px" }}>
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
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 16px",
                margin: "2px 8px",
                borderRadius: "8px",
                transition: "all 0.2s ease",
              }}
            >
              <div className="ct-list-user" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div
                  className="ct-user-avatar with-presence"
                  style={{ position: "relative", display: "inline-block" }}
                  aria-hidden="true"
                >
                  <div className="ct-user-avatar-core" style={{ width: "36px", height: "36px", borderRadius: "50%", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "#1f1f1f" }}>
                    {user.avatarUrl ? (
                      <img
                        className="ct-user-avatar-image"
                        src={user.avatarUrl}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <span className="ct-user-avatar-fallback" style={{ fontSize: "12px", color: "#f5f5f5", fontWeight: "600" }}>
                        {getDisplayInitials(user.displayName || user.username)}
                      </span>
                    )}
                  </div>

                  <span
                    className={`ct-presence-dot ${user.appOnline ? "online" : "offline"}`}
                    style={{
                      position: "absolute",
                      bottom: "-1px",
                      right: "-1px",
                      width: "10px",
                      height: "10px",
                      borderRadius: "50%",
                      border: "2px solid #0d0d0d",
                      background: user.appOnline ? "#10b981" : "#6b7280",
                    }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column" }}>
                  <p style={{ margin: 0, fontSize: "13px", fontWeight: "500", color: selectedUserId === user.userId ? "#000000" : "#f5f5f5" }}>
                    {user.displayName || user.username}
                  </p>
                  <span style={{ fontSize: "11px", color: selectedUserId === user.userId ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.4)" }}>
                    {getUserStatusLabel(user.appOnline)}
                  </span>
                </div>
              </div>

              {unreadCount > 0 && (
                <Badge
                  count={unreadCount}
                  overflowCount={99}
                  style={{
                    backgroundColor: selectedUserId === user.userId ? "#000000" : "#ffffff",
                    color: selectedUserId === user.userId ? "#ffffff" : "#000000",
                    fontWeight: "700",
                    fontSize: "10px",
                    boxShadow: "none",
                  }}
                />
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}


