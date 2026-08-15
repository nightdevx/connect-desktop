import { useMemo, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Button, Dropdown, Input, Segmented, Tooltip } from "antd";
import {
  CheckOutlined,
  CloseOutlined,
  PhoneOutlined,
  SearchOutlined,
  UserAddOutlined,
  UserDeleteOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import type { FriendEntry, UserDirectoryEntry } from "@shared/auth-contracts";
import type { FriendsController } from "../../hooks/user/use-friends";
import type { OpenConversation } from "../../hooks/user/use-open-conversations";
import { ConfirmActionModal } from "../common";
import {
  getDisplayInitials,
  getPresenceColor,
  getUserStatusLabel,
} from "../../workspace-utils";

export interface FriendsHomePanelProps {
  friends: FriendsController;
  directoryUsers: UserDirectoryEntry[];
  currentUserId: string;
  onOpenConversation: (peer: OpenConversation) => void;
  // Opens the Arkadaş Ekle modal the shell owns. With a friends-only directory
  // this is the only route to someone you are not already friends with.
  onAddFriend: () => void;
  // This list is exactly the set of people you may call, so the phone belongs
  // on the row: reaching it used to mean opening the DM thread first.
  onInitiateCall?: (targetUser: UserDirectoryEntry) => void;
}

type FriendsTab = "friends" | "requests" | "online" | "offline";

interface RequestRow extends FriendEntry {
  name: string;
}

const normalize = (value: string): string => value.toLocaleLowerCase("tr-TR");

// `query` arrives already trimmed and normalized; an empty one matches
// everything so the callers need no second branch.
const matches = (query: string, ...fields: string[]): boolean =>
  !query || fields.some((field) => normalize(field).includes(query));

const toPeer = (user: UserDirectoryEntry): OpenConversation => ({
  userId: user.userId,
  username: user.username,
  displayName: user.displayName,
  avatarUrl: user.avatarUrl ?? null,
});

// Requests carry no avatar - FriendEntry deliberately omits it, since it rides
// the users-WS - so the initials branch is the only one a request row takes.
function PersonRow({
  name,
  subtitle,
  avatarUrl,
  presenceDot,
  actions,
  onActivate,
}: {
  name: string;
  subtitle: string;
  avatarUrl?: string | null;
  presenceDot?: string;
  actions?: ReactNode;
  onActivate?: () => void;
}) {
  const activateOnKey = (event: KeyboardEvent<HTMLLIElement>): void => {
    // Only the row itself: Enter on one of the action buttons bubbles up here,
    // and unfriending someone must not also open their conversation.
    if (event.target !== event.currentTarget) {
      return;
    }

    if (!onActivate || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }
    event.preventDefault();
    onActivate();
  };

  return (
    <li
      className={`ct-list-item ${onActivate ? "clickable" : ""}`}
      role={onActivate ? "option" : undefined}
      aria-selected={onActivate ? false : undefined}
      tabIndex={onActivate ? 0 : undefined}
      onClick={onActivate}
      onKeyDown={activateOnKey}
    >
      <div className="ct-list-user">
        <div
          className={`ct-user-avatar ${presenceDot ? "with-presence" : ""}`}
          aria-hidden="true"
        >
          <div className="ct-user-avatar-core">
            {avatarUrl ? (
              <img className="ct-user-avatar-image" src={avatarUrl} alt="" />
            ) : (
              <span className="ct-user-avatar-fallback">
                {getDisplayInitials(name)}
              </span>
            )}
          </div>

          {presenceDot && (
            <span className="ct-presence-dot" style={{ background: presenceDot }} />
          )}
        </div>

        <div className="ct-list-user-meta">
          <p>
            <span className="truncate">{name}</span>
          </p>
          <span>{subtitle}</span>
        </div>
      </div>

      {actions && <div className="ct-list-item-actions">{actions}</div>}
    </li>
  );
}

// The Discord-shaped home for the Arkadaşlar section: what the main panel shows
// while no conversation is selected. Every list here is friends-only, which is
// the whole point - a stranger is now reachable only by exact username through
// the Arkadaş Ekle modal.
export function FriendsHomePanel({
  friends,
  directoryUsers,
  onOpenConversation,
  onAddFriend,
  onInitiateCall,
}: FriendsHomePanelProps) {
  const [tab, setTab] = useState<FriendsTab>("friends");
  // Deliberately local. Feeding this back into use-workspace-users' userSearch
  // would narrow the directory that selectedUser resolves through, and blank the
  // open conversation the moment someone typed here.
  const [search, setSearch] = useState("");
  const [pendingUnfriend, setPendingUnfriend] = useState<RequestRow | null>(null);

  const query = normalize(search.trim());

  const friendIdSet = useMemo(
    () => new Set(friends.friendIds),
    [friends.friendIds],
  );

  // The backend already returns friends only. Intersecting anyway costs one
  // Set lookup per row and closes the window where a cached directory response
  // - or one still in flight across an unfriend - would list a stranger here.
  const friendUsers = useMemo(
    () =>
      directoryUsers
        .filter((user) => friendIdSet.has(user.userId))
        .sort((a, b) =>
          (a.displayName || a.username).localeCompare(
            b.displayName || b.username,
            "tr",
          ),
        ),
    [directoryUsers, friendIdSet],
  );

  const visibleFriends = useMemo(
    () =>
      friendUsers.filter((user) => {
        if (tab === "online" && !user.appOnline) {
          return false;
        }
        if (tab === "offline" && user.appOnline) {
          return false;
        }
        return matches(query, user.displayName, user.username);
      }),
    [friendUsers, tab, query],
  );

  // No directory lookup: a requester is by definition not a friend, so the
  // friends-only directory has no row for them. The entry names itself.
  const toRequestRows = (entries: FriendEntry[]): RequestRow[] =>
    entries
      .map((entry) => ({
        ...entry,
        name: entry.displayName || entry.username || "Bilinmeyen kullanıcı",
      }))
      .filter((row) => matches(query, row.name, row.username))
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));

  const incomingRows = toRequestRows(friends.incomingRequests);
  const outgoingRows = toRequestRows(friends.outgoingRequests);

  // Off the unfiltered list: the badge answers "is there anything waiting",
  // which the search box must not be able to talk you out of.
  const incomingCount = friends.incomingRequests.length;

  const tabOptions = [
    { value: "friends", label: "Arkadaşlar" },
    {
      value: "requests",
      label: incomingCount > 0 ? `İstekler (${incomingCount})` : "İstekler",
    },
    { value: "online", label: "Çevrimiçi" },
    { value: "offline", label: "Çevrimdışı" },
  ];

  // Above every empty state, because "no friends" and "the call failed" used to
  // render identically — which is how a broken list stayed unreported.
  const renderLoadError = (): ReactNode => (
    <li className="ct-list-state error">
      <WarningOutlined className="ct-list-state-icon" />
      <p>Arkadaş listesi yüklenemedi.</p>
      <span>
        {friends.loadError?.code === "REQUEST_FAILED" &&
        friends.loadError?.statusCode === 404
          ? "Sunucu bu özelliği tanımıyor; güncellenmesi gerekiyor."
          : "Bağlantınızı kontrol edip tekrar deneyin."}
      </span>
      <span className="ct-list-state-detail">
        {friends.loadError?.code ?? "UNKNOWN"}
        {friends.loadError?.statusCode ? ` · ${friends.loadError.statusCode}` : ""}
      </span>
    </li>
  );

  const renderFriendList = (): ReactNode => {
    if (friends.isLoading) {
      return <li className="ct-list-state">Arkadaşlar yükleniyor...</li>;
    }

    if (friends.loadError) {
      return renderLoadError();
    }

    if (visibleFriends.length === 0) {
      return (
        <li className="ct-list-state">
          <SearchOutlined className="ct-list-state-icon" />
          {query ? (
            <>
              <p>Aramaya uygun arkadaş bulunamadı.</p>
              <span>Farklı bir isim deneyin.</span>
            </>
          ) : tab === "online" ? (
            <p>Şu anda çevrimiçi arkadaşınız yok.</p>
          ) : tab === "offline" ? (
            <p>Bütün arkadaşlarınız çevrimiçi.</p>
          ) : (
            <>
              <p>Henüz arkadaşınız yok.</p>
              <span>
                Kullanıcı adını bildiğiniz birine arkadaşlık isteği gönderin.
              </span>
            </>
          )}
        </li>
      );
    }

    return visibleFriends.map((user) => {
      const name = user.displayName || user.username;
      const isPending = friends.pendingUserIds.includes(user.userId);
      const row = (
        <PersonRow
          name={name}
          subtitle={getUserStatusLabel(user.appOnline, user.presence)}
          avatarUrl={user.avatarUrl}
          presenceDot={getPresenceColor(user.appOnline, user.presence)}
          onActivate={() => onOpenConversation(toPeer(user))}
          actions={
            <>
              {/* Offline gets no button rather than a dead one: the call would
                  ring into nothing. */}
              {onInitiateCall && user.appOnline && (
                <Tooltip title="Ara">
                  <Button
                    type="text"
                    size="small"
                    icon={<PhoneOutlined className="ct-icon-success" />}
                    aria-label={`${name} kişisini ara`}
                    onClick={(event) => {
                      // The row itself opens the conversation.
                      event.stopPropagation();
                      onInitiateCall(user);
                    }}
                  />
                </Tooltip>
              )}

              <Tooltip title="Arkadaşlıktan Çıkar">
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<UserDeleteOutlined />}
                  loading={isPending}
                  aria-label={`${name} ile arkadaşlığı bitir`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setPendingUnfriend({
                      userId: user.userId,
                      username: user.username,
                      displayName: user.displayName,
                      name,
                    });
                  }}
                />
              </Tooltip>
            </>
          }
        />
      );

      // Right-click, the same secondary-action gesture the sidebar and the
      // lobby member rows use: the row's own job is to open the conversation.
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
                disabled: isPending,
                onClick: () =>
                  setPendingUnfriend({
                    userId: user.userId,
                    username: user.username,
                    displayName: user.displayName,
                    name,
                  }),
              },
            ],
          }}
        >
          {row}
        </Dropdown>
      );
    });
  };

  return (
    <div className="ct-friends-home">
      <header className="ct-friends-home-header">
        <div>
          <h3>Arkadaşlar</h3>
          <p>
            Bir sohbeti açmak için arkadaşınıza tıklayın, kapatmak için soldaki
            listede sağ tıklayın.
          </p>
        </div>

        <Button
          type="primary"
          icon={<UserAddOutlined />}
          onClick={onAddFriend}
          className="ct-friends-home-add"
        >
          Arkadaş Ekle
        </Button>
      </header>

      <Segmented
        block
        value={tab}
        onChange={(value) => setTab(value as FriendsTab)}
        options={tabOptions}
        className="ct-segmented-premium"
      />

      <Input
        allowClear
        value={search}
        placeholder="İsim veya kullanıcı adı ara..."
        prefix={<SearchOutlined />}
        onChange={(event) => setSearch(event.target.value)}
      />

      <div className="ct-friends-home-body">
        {tab === "requests" ? (
          <>
            <p className="ct-list-group-title">
              Gelen istekler ({incomingRows.length})
            </p>

            <ul className="ct-list" role="list" aria-label="Gelen istekler">
              {friends.loadError
                ? renderLoadError()
                : incomingRows.length === 0 && (
                    <li className="ct-list-state">Bekleyen istek yok.</li>
                  )}

              {incomingRows.map((row) => {
                // Both buttons carry the row's pending flag: it is keyed by user
                // id, not by which of the two was clicked.
                const isPending = friends.pendingUserIds.includes(row.userId);

                return (
                  <PersonRow
                    key={row.userId}
                    name={row.name}
                    subtitle="Arkadaş olmak istiyor"
                    actions={
                      <>
                        <Tooltip title="Kabul et">
                          <Button
                            type="text"
                            size="small"
                            icon={<CheckOutlined />}
                            loading={isPending}
                            aria-label={`${row.name} isteğini kabul et`}
                            onClick={() => void friends.acceptRequest(row.userId)}
                          />
                        </Tooltip>
                        <Tooltip title="Reddet">
                          <Button
                            type="text"
                            size="small"
                            danger
                            icon={<CloseOutlined />}
                            loading={isPending}
                            aria-label={`${row.name} isteğini reddet`}
                            onClick={() => void friends.removeFriend(row.userId)}
                          />
                        </Tooltip>
                      </>
                    }
                  />
                );
              })}
            </ul>

            <p className="ct-list-group-title">
              Gönderilen istekler ({outgoingRows.length})
            </p>

            <ul className="ct-list" role="list" aria-label="Gönderilen istekler">
              {outgoingRows.length === 0 && (
                <li className="ct-list-state">Bekleyen isteğiniz yok.</li>
              )}

              {outgoingRows.map((row) => (
                <PersonRow
                  key={row.userId}
                  name={row.name}
                  subtitle="Yanıt bekleniyor"
                  actions={
                    <Tooltip title="İptal et">
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<CloseOutlined />}
                        loading={friends.pendingUserIds.includes(row.userId)}
                        aria-label={`${row.name} isteğini iptal et`}
                        onClick={() => void friends.removeFriend(row.userId)}
                      />
                    </Tooltip>
                  }
                />
              ))}
            </ul>
          </>
        ) : (
          <ul className="ct-list" role="listbox" aria-label="Arkadaşlar">
            {renderFriendList()}
          </ul>
        )}
      </div>

      <ConfirmActionModal
        isOpen={pendingUnfriend !== null}
        title="Arkadaşlıktan Çıkar"
        message={`${pendingUnfriend?.name ?? ""} arkadaş listenizden kaldırılacak. Geri almak için karşı tarafın yeni isteğinizi kabul etmesi gerekir.`}
        confirmLabel="Arkadaşlıktan Çıkar"
        isProcessing={
          pendingUnfriend !== null &&
          friends.pendingUserIds.includes(pendingUnfriend.userId)
        }
        onConfirm={() => {
          if (!pendingUnfriend) {
            return;
          }
          void friends.removeFriend(pendingUnfriend.userId).then(() => {
            setPendingUnfriend(null);
          });
        }}
        onCancel={() => setPendingUnfriend(null)}
      />
    </div>
  );
}
