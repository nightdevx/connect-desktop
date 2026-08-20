import { useMemo, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Button, Dropdown, Input, Segmented, Tooltip } from "antd";
import {
  CheckOutlined,
  CloseOutlined,
  InboxOutlined,
  PhoneOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
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

type FriendsTab = "friends" | "online" | "offline" | "requests";

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

// A tab label and the number behind it. Counts sit ON the tabs because that is
// the question the tabs are asked -- "is anyone online" used to be answerable
// only by switching to Çevrimiçi and reading an empty list.
function TabLabel({
  label,
  count,
  alert,
}: {
  label: string;
  count: number;
  alert?: boolean;
}) {
  return (
    <span className="ct-segmented-option">
      {label}
      <span className={`ct-segmented-count ${alert ? "alert" : ""}`}>
        {count}
      </span>
    </span>
  );
}

// Requests carry no avatar - FriendEntry deliberately omits it, since it rides
// the users-WS - so the initials branch is the only one a request row takes.
//
// Two halves, and only the left one is interactive: Enter on a focused row can
// then never mean "unfriend", and the action buttons need no stopPropagation to
// keep a click off the row underneath them. The row keeps its <li> semantics --
// the identity half carries role="button" rather than the list item itself.
function PersonRow({
  name,
  subtitle,
  avatarUrl,
  presenceDot,
  actions,
  onActivate,
  activateLabel,
}: {
  name: string;
  subtitle: string;
  avatarUrl?: string | null;
  presenceDot?: string;
  actions?: ReactNode;
  onActivate?: () => void;
  activateLabel?: string;
}) {
  const activateOnKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!onActivate || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }
    event.preventDefault();
    onActivate();
  };

  const identity = (
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
  );

  return (
    <li className={`ct-list-item ${onActivate ? "clickable" : ""}`}>
      {onActivate ? (
        <div
          className="ct-row-open"
          role="button"
          tabIndex={0}
          aria-label={activateLabel}
          onClick={onActivate}
          onKeyDown={activateOnKey}
        >
          {identity}
        </div>
      ) : (
        identity
      )}

      {actions && <div className="ct-list-item-actions">{actions}</div>}
    </li>
  );
}

// One icon button on a row. Always the same 32px square, muted until it is
// pointed at -- see .ct-row-action for why the colour waits for the hover.
function RowAction({
  title,
  icon,
  tone,
  ariaLabel,
  isLoading,
  onClick,
}: {
  title: string;
  icon: ReactNode;
  tone: "success" | "danger" | "neutral";
  ariaLabel: string;
  isLoading?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip title={title}>
      <Button
        type="text"
        className={`ct-row-action ${tone}`}
        icon={icon}
        loading={isLoading}
        aria-label={ariaLabel}
        onClick={onClick}
      />
    </Tooltip>
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

  const onlineCount = useMemo(
    () => friendUsers.filter((user) => user.appOnline).length,
    [friendUsers],
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

  // Off the unfiltered lists: the badge answers "is there anything waiting",
  // which the search box must not be able to talk you out of.
  const incomingCount = friends.incomingRequests.length;
  const requestTotal = incomingCount + friends.outgoingRequests.length;

  const tabOptions = [
    {
      value: "friends",
      label: <TabLabel label="Arkadaşlar" count={friendUsers.length} />,
    },
    { value: "online", label: <TabLabel label="Çevrimiçi" count={onlineCount} /> },
    {
      value: "offline",
      label: (
        <TabLabel label="Çevrimdışı" count={friendUsers.length - onlineCount} />
      ),
    },
    {
      value: "requests",
      label: (
        <TabLabel
          label="İstekler"
          count={incomingCount}
          alert={incomingCount > 0}
        />
      ),
    },
  ];

  const askUnfriend = (row: RequestRow): void => setPendingUnfriend(row);

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
      <Button
        size="small"
        icon={<ReloadOutlined />}
        loading={friends.isRefreshing}
        onClick={friends.refresh}
      >
        Tekrar dene
      </Button>
    </li>
  );

  const renderFriendEmpty = (): ReactNode => {
    if (query) {
      return (
        <li className="ct-list-state">
          <SearchOutlined className="ct-list-state-icon" />
          <p>Aramaya uygun arkadaş bulunamadı.</p>
          <span>Farklı bir isim deneyin.</span>
        </li>
      );
    }

    if (tab === "online") {
      return (
        <li className="ct-list-state">
          <TeamOutlined className="ct-list-state-icon" />
          <p>Şu anda çevrimiçi arkadaşınız yok.</p>
          <span>Biri bağlandığında burada görünür.</span>
        </li>
      );
    }

    if (tab === "offline") {
      return (
        <li className="ct-list-state">
          <TeamOutlined className="ct-list-state-icon" />
          <p>Bütün arkadaşlarınız çevrimiçi.</p>
        </li>
      );
    }

    return (
      <li className="ct-list-state">
        <TeamOutlined className="ct-list-state-icon" />
        <p>Henüz arkadaşınız yok.</p>
        <span>Kullanıcı adını bildiğiniz birine arkadaşlık isteği gönderin.</span>
        <Button icon={<UserAddOutlined />} onClick={onAddFriend}>
          Arkadaş Ekle
        </Button>
      </li>
    );
  };

  const renderFriendList = (): ReactNode => {
    if (friends.isLoading) {
      return <li className="ct-list-state">Arkadaşlar yükleniyor...</li>;
    }

    if (friends.loadError) {
      return renderLoadError();
    }

    if (visibleFriends.length === 0) {
      return renderFriendEmpty();
    }

    return visibleFriends.map((user) => {
      const name = user.displayName || user.username;
      const isPending = friends.pendingUserIds.includes(user.userId);
      const asRow: RequestRow = {
        userId: user.userId,
        username: user.username,
        displayName: user.displayName,
        name,
      };

      const row = (
        <PersonRow
          name={name}
          subtitle={getUserStatusLabel(user.appOnline, user.presence)}
          avatarUrl={user.avatarUrl}
          presenceDot={getPresenceColor(user.appOnline, user.presence)}
          onActivate={() => onOpenConversation(toPeer(user))}
          activateLabel={`${name} ile sohbeti aç`}
          actions={
            <>
              {/* Offline gets no button rather than a dead one: the call would
                  ring into nothing. */}
              {onInitiateCall && user.appOnline && (
                <RowAction
                  title="Sesli ara"
                  tone="success"
                  icon={<PhoneOutlined />}
                  ariaLabel={`${name} kişisini ara`}
                  onClick={() => onInitiateCall(user)}
                />
              )}

              <RowAction
                title="Arkadaşlıktan çıkar"
                tone="danger"
                icon={<UserDeleteOutlined />}
                ariaLabel={`${name} ile arkadaşlığı bitir`}
                isLoading={isPending}
                onClick={() => askUnfriend(asRow)}
              />
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
                onClick: () => askUnfriend(asRow),
              },
            ],
          }}
        >
          {row}
        </Dropdown>
      );
    });
  };

  // Both request lists render only when they have rows, under one heading that
  // carries its own count. Two permanent headings over two "nothing here" lines
  // was three quarters of the tab saying the same thing twice.
  const renderRequests = (): ReactNode => {
    if (friends.loadError) {
      return <ul className="ct-list">{renderLoadError()}</ul>;
    }

    if (incomingRows.length === 0 && outgoingRows.length === 0) {
      return (
        <ul className="ct-list">
          <li className="ct-list-state">
            <InboxOutlined className="ct-list-state-icon" />
            {query && requestTotal > 0 ? (
              <>
                <p>Aramaya uygun istek yok.</p>
                <span>Farklı bir isim deneyin.</span>
              </>
            ) : (
              <>
                <p>Bekleyen istek yok.</p>
                <span>
                  Gönderdiğiniz ve size gelen istekler burada listelenir.
                </span>
              </>
            )}
          </li>
        </ul>
      );
    }

    return (
      <>
        {incomingRows.length > 0 && (
          <section className="ct-friends-home-group">
            <p className="ct-list-group-title">
              Gelen istekler
              <span className="ct-segmented-count">{incomingRows.length}</span>
            </p>

            <ul className="ct-list" aria-label="Gelen istekler">
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
                        <RowAction
                          title="Kabul et"
                          tone="success"
                          icon={<CheckOutlined />}
                          ariaLabel={`${row.name} isteğini kabul et`}
                          isLoading={isPending}
                          onClick={() => void friends.acceptRequest(row.userId)}
                        />
                        <RowAction
                          title="Reddet"
                          tone="danger"
                          icon={<CloseOutlined />}
                          ariaLabel={`${row.name} isteğini reddet`}
                          isLoading={isPending}
                          onClick={() => void friends.removeFriend(row.userId)}
                        />
                      </>
                    }
                  />
                );
              })}
            </ul>
          </section>
        )}

        {outgoingRows.length > 0 && (
          <section className="ct-friends-home-group">
            <p className="ct-list-group-title">
              Gönderilen istekler
              <span className="ct-segmented-count">{outgoingRows.length}</span>
            </p>

            <ul className="ct-list" aria-label="Gönderilen istekler">
              {outgoingRows.map((row) => (
                <PersonRow
                  key={row.userId}
                  name={row.name}
                  subtitle="Yanıt bekleniyor"
                  actions={
                    <RowAction
                      title="İsteği iptal et"
                      tone="danger"
                      icon={<CloseOutlined />}
                      ariaLabel={`${row.name} isteğini iptal et`}
                      isLoading={friends.pendingUserIds.includes(row.userId)}
                      onClick={() => void friends.removeFriend(row.userId)}
                    />
                  }
                />
              ))}
            </ul>
          </section>
        )}
      </>
    );
  };

  return (
    <div className="ct-friends-home">
      <header className="ct-friends-home-header">
        <div>
          <h2>Arkadaşlar</h2>
          <p>
            Sohbeti açmak için bir arkadaşınıza tıklayın; sağ tık daha fazla
            seçenek gösterir.
          </p>
        </div>

        <Button type="primary" icon={<UserAddOutlined />} onClick={onAddFriend}>
          Arkadaş Ekle
        </Button>
      </header>

      <div className="ct-friends-home-toolbar">
        <Segmented
          value={tab}
          onChange={(value) => setTab(value as FriendsTab)}
          options={tabOptions}
          className="ct-segmented-premium"
        />

        <Input
          allowClear
          className="ct-friends-home-search"
          value={search}
          placeholder="Arkadaş ara..."
          prefix={<SearchOutlined />}
          aria-label="Arkadaş ara"
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {/* The label rides the <ul>, not this scroller: a bare div carries no
          role, so a name on it is announced by nothing. The requests tab labels
          its own two lists. */}
      <div className="ct-friends-home-body">
        {tab === "requests" ? (
          renderRequests()
        ) : (
          <ul className="ct-list" aria-label="Arkadaşlar">
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
