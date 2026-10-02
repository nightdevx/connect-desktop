import { useMemo, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Button, Dropdown, Input, Segmented, Tooltip } from "antd";
import type { MenuProps } from "antd";
import {
  CheckOutlined,
  CloseOutlined,
  CopyOutlined,
  DesktopOutlined,
  EllipsisOutlined,
  IdcardOutlined,
  InboxOutlined,
  MessageOutlined,
  PhoneOutlined,
  ReloadOutlined,
  RocketOutlined,
  SearchOutlined,
  SoundOutlined,
  TeamOutlined,
  UserAddOutlined,
  UserDeleteOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import type { FriendEntry, UserDirectoryEntry } from "@shared/auth-contracts";
import type { FriendsController } from "../../hooks/user/use-friends";
import type { OpenConversation } from "../../hooks/user/use-open-conversations";
import { ConfirmActionModal } from "../common";
import { ContextMenuPanel } from "../common/context-menu-panel";
import { UserProfileCardAnchor } from "./user-profile-card";
import { AuthLogoMark } from "@/features/auth";
import { PageHeader } from "@/ui/page-header";
import { gameActivityLabel, useGameActivityByUser } from "@/features/minigames";
import {
  getDisplayInitials,
  getPresenceColor,
  getUserStatusLabel,
  hueStyle,
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
  // Which voice room each person is in, off the live rosters: the page answers
  // "where is everybody" with it, and offers the way in.
  lobbyByUserId?: Record<string, { id: string; name: string }>;
  // The room this user is already in, so a friend beside them is not offered
  // a "Katıl" that would do nothing.
  currentLobbyId?: string | null;
  // Switches to Lobiler and joins through the same funnel as a click on the
  // room, password prompt and full-room handling included.
  onJoinLobby?: (lobbyId: string) => void;
  onCopyUsername?: (username: string) => Promise<void>;
}

type FriendsTab = "friends" | "online" | "offline" | "requests";

interface RequestRow extends FriendEntry {
  name: string;
}

// What somebody is doing right now, in the order it is worth saying: a room
// first, because it is the one activity that comes with a way to join them.
interface FriendActivity {
  kind: "lobby" | "minigame" | "game";
  label: string;
  lobby?: { id: string; name: string };
}

const ACTIVITY_ICON: Record<FriendActivity["kind"], ReactNode> = {
  lobby: <SoundOutlined />,
  minigame: <RocketOutlined />,
  game: <DesktopOutlined />,
};

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

function PersonAvatar({
  userId,
  name,
  avatarUrl,
  presenceDot,
}: {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  presenceDot?: string;
}) {
  return (
    <div
      className={`ct-user-avatar ${presenceDot ? "with-presence" : ""}`}
      aria-hidden="true"
      style={hueStyle(userId)}
    >
      <div className="ct-user-avatar-core ct-hued">
        {avatarUrl ? (
          <img className="ct-user-avatar-image" src={avatarUrl} alt="" />
        ) : (
          <span className="ct-user-avatar-fallback">{getDisplayInitials(name)}</span>
        )}
      </div>

      {presenceDot && (
        <span className="ct-presence-dot" style={{ background: presenceDot }} />
      )}
    </div>
  );
}

// The activity line: the icon says which kind, the text says what.
function ActivityText({ activity }: { activity: FriendActivity }) {
  return (
    <span className={`ct-friends-activity ${activity.kind}`}>
      {ACTIVITY_ICON[activity.kind]}
      {activity.label}
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
  userId,
  name,
  subtitle,
  avatarUrl,
  presenceDot,
  actions,
  onActivate,
  activateLabel,
  contextMenu,
}: {
  userId: string;
  name: string;
  subtitle: ReactNode;
  avatarUrl?: string | null;
  presenceDot?: string;
  actions?: ReactNode;
  onActivate?: () => void;
  activateLabel?: string;
  contextMenu?: { menu: MenuProps; popupRender?: (menu: ReactNode) => ReactNode };
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
      <PersonAvatar userId={userId} name={name} avatarUrl={avatarUrl} presenceDot={presenceDot} />

      <div className="ct-list-user-meta">
        <p>
          <span className="truncate">{name}</span>
        </p>
        <span>{subtitle}</span>
      </div>
    </div>
  );

  const item = (
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

  // Right-click, the same secondary-action gesture the sidebar and the lobby
  // member rows use. Wrapped around the <li> itself: Dropdown hangs its
  // listener and ref on its direct child, and with this component as the child
  // both were dropped as unknown props -- the menu never opened.
  return contextMenu ? (
    <Dropdown
      trigger={["contextMenu"]}
      menu={contextMenu.menu}
      popupRender={contextMenu.popupRender}
    >
      {item}
    </Dropdown>
  ) : (
    item
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
  currentUserId,
  onOpenConversation,
  onAddFriend,
  onInitiateCall,
  lobbyByUserId,
  currentLobbyId,
  onJoinLobby,
  onCopyUsername,
}: FriendsHomePanelProps) {
  const gameActivityByUser = useGameActivityByUser();
  // Çevrimiçi first, not the full list. Opening "Arkadaşlar" is almost always
  // about who is around right now — the full roster is one click away and does
  // not answer that question, it buries it under everyone who is asleep.
  const [tab, setTab] = useState<FriendsTab>("online");
  // Deliberately local. Feeding this back into use-workspace-users' userSearch
  // would narrow the directory that selectedUser resolves through, and blank the
  // open conversation the moment someone typed here.
  const [search, setSearch] = useState("");
  const [pendingUnfriend, setPendingUnfriend] = useState<RequestRow | null>(null);
  // The profile card, opened from a menu at the row it was asked about.
  const [profileTarget, setProfileTarget] = useState<{
    userId: string;
    name: string;
    x: number;
    y: number;
  } | null>(null);

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

  const activityOf = (user: UserDirectoryEntry): FriendActivity | null => {
    // Offline is a status, not an activity: anything still attached to an
    // offline row is a leftover from before they left.
    if (!user.appOnline) {
      return null;
    }

    const lobby = lobbyByUserId?.[user.userId];
    if (lobby) {
      return { kind: "lobby", label: `${lobby.name} odasında`, lobby };
    }

    const minigame = gameActivityByUser.get(user.userId);
    if (minigame) {
      return { kind: "minigame", label: gameActivityLabel(minigame) };
    }

    if (user.activity?.name) {
      return { kind: "game", label: `${user.activity.name} oynuyor` };
    }

    return null;
  };

  const activeFriends = friendUsers.flatMap((user) => {
    const activity = activityOf(user);
    return activity ? [{ user, activity }] : [];
  });

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

  // One menu behind both the ⋯ button and a right-click, so the two cannot
  // drift apart.
  const menuItemsFor = (
    user: UserDirectoryEntry,
    activity: FriendActivity | null,
    isPending: boolean,
    asRow: RequestRow,
  ): MenuProps["items"] => {
    const items: NonNullable<MenuProps["items"]> = [
      {
        key: "profile",
        label: "Profili Gör",
        icon: <IdcardOutlined />,
        onClick: ({ domEvent }) => {
          const rect = (domEvent.currentTarget as Element).getBoundingClientRect();
          setProfileTarget({
            userId: user.userId,
            name: user.displayName || user.username,
            x: rect.left,
            y: rect.top,
          });
        },
      },
      {
        key: "message",
        label: "Mesaj Gönder",
        icon: <MessageOutlined />,
        onClick: () => onOpenConversation(toPeer(user)),
      },
    ];

    if (onInitiateCall) {
      items.push({
        key: "call",
        label: "Sesli Ara",
        icon: <PhoneOutlined />,
        // Listed but closed while they are offline, with the reason beside it:
        // the call would ring into nothing.
        disabled: !user.appOnline,
        extra: user.appOnline ? undefined : "çevrimdışı",
        onClick: () => onInitiateCall(user),
      });
    }

    const lobby = activity?.lobby;
    if (lobby && onJoinLobby && lobby.id !== currentLobbyId) {
      items.push({
        key: "join",
        // The room's name beside the action, not inside it: rooms tend to be
        // called "… Odası", and "Oyun Odası Odasına Katıl" says it twice.
        label: "Odasına Katıl",
        extra: lobby.name,
        icon: <SoundOutlined />,
        onClick: () => onJoinLobby(lobby.id),
      });
    }

    if (onCopyUsername) {
      items.push(
        { type: "divider" },
        {
          key: "copy",
          label: "Kullanıcı Adını Kopyala",
          icon: <CopyOutlined />,
          onClick: () => void onCopyUsername(user.username),
        },
      );
    }

    items.push(
      { type: "divider" },
      {
        key: "unfriend",
        label: "Arkadaşlıktan Çıkar",
        icon: <UserDeleteOutlined />,
        danger: true,
        disabled: isPending,
        onClick: () => askUnfriend(asRow),
      },
    );

    return items;
  };

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

  const renderFriendRow = (user: UserDirectoryEntry): ReactNode => {
    const name = user.displayName || user.username;
    const activity = activityOf(user);
    const isPending = friends.pendingUserIds.includes(user.userId);
    const asRow: RequestRow = {
      userId: user.userId,
      username: user.username,
      displayName: user.displayName,
      name,
    };
    const menu: MenuProps = { items: menuItemsFor(user, activity, isPending, asRow) };
    // Whose menu this is, above it -- the same header the lobby menus carry.
    const popupRender = (origin: ReactNode): ReactNode => (
      <ContextMenuPanel
        identity={{
          userId: user.userId,
          name,
          avatarUrl: user.avatarUrl,
          detail: activity?.label ?? getUserStatusLabel(user.appOnline, user.presence),
        }}
        menu={origin}
      />
    );

    return (
      <PersonRow
        key={user.userId}
        contextMenu={{ menu, popupRender }}
        userId={user.userId}
        name={name}
        subtitle={
          activity ? (
            <ActivityText activity={activity} />
          ) : (
            getUserStatusLabel(user.appOnline, user.presence)
          )
        }
        avatarUrl={user.avatarUrl}
        presenceDot={getPresenceColor(user.appOnline, user.presence)}
        onActivate={() => onOpenConversation(toPeer(user))}
        activateLabel={`${name} ile sohbeti aç`}
        actions={
          <>
            <RowAction
              title="Mesaj gönder"
              tone="neutral"
              icon={<MessageOutlined />}
              ariaLabel={`${name} ile sohbeti aç`}
              onClick={() => onOpenConversation(toPeer(user))}
            />

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

            {/* Everything else, unfriend included, one click further in: a red
                bin on every row was one misclick from ending a friendship. It
                spins while that request is in flight, as the bin used to. */}
            <Dropdown trigger={["click"]} menu={menu} popupRender={popupRender}>
              <Button
                type="text"
                className="ct-row-action neutral"
                icon={<EllipsisOutlined />}
                loading={isPending}
                aria-label={`${name} için diğer seçenekler`}
              />
            </Dropdown>
          </>
        }
      />
    );
  };

  // The label rides each <ul>, not the scroller around them: a bare div carries
  // no role, so a name on it is announced by nothing.
  const renderFriends = (): ReactNode => {
    let state: ReactNode = null;
    if (friends.isLoading) {
      state = <li className="ct-list-state">Arkadaşlar yükleniyor...</li>;
    } else if (friends.loadError) {
      state = renderLoadError();
    } else if (visibleFriends.length === 0) {
      state = renderFriendEmpty();
    }

    if (state) {
      return (
        <ul className="ct-list" aria-label="Arkadaşlar">
          {state}
        </ul>
      );
    }

    // Who is around, then who is not, each under its own count: the full tab
    // answers "is anyone online" without a second click, and on Çevrimiçi the
    // heading is what separates the list from the Şu an aktif strip above it.
    const groups = [
      { label: "Çevrimiçi", users: visibleFriends.filter((user) => user.appOnline) },
      { label: "Çevrimdışı", users: visibleFriends.filter((user) => !user.appOnline) },
    ].filter((group) => group.users.length > 0);

    return groups.map((group) => (
      <section key={group.label} className="ct-friends-home-group">
        <p className="ct-list-group-title">
          {group.label}
          <span className="ct-segmented-count">{group.users.length}</span>
        </p>

        <ul className="ct-list" aria-label={`${group.label} arkadaşlar`}>
          {group.users.map(renderFriendRow)}
        </ul>
      </section>
    ));
  };

  // "Şu an aktif": who is in a room or in a game, above the list, each with the
  // one click that matters -- into their room, or into the conversation.
  const renderActive = (): ReactNode => {
    if (
      query ||
      friends.isLoading ||
      friends.loadError ||
      (tab !== "friends" && tab !== "online") ||
      activeFriends.length === 0
    ) {
      return null;
    }

    return (
      <section className="ct-friends-home-group">
        <p className="ct-list-group-title">
          Şu an aktif
          <span className="ct-segmented-count">{activeFriends.length}</span>
        </p>

        <ul className="ct-friends-active" aria-label="Şu an aktif">
          {activeFriends.map(({ user, activity }) => {
            const name = user.displayName || user.username;
            const lobby = activity.lobby;

            return (
              <li key={user.userId} className={`ct-friends-active-card ${activity.kind}`}>
                <PersonAvatar
                  userId={user.userId}
                  name={name}
                  avatarUrl={user.avatarUrl}
                  presenceDot={getPresenceColor(user.appOnline, user.presence)}
                />

                <div className="ct-friends-active-meta">
                  <strong title={name}>{name}</strong>
                  <ActivityText activity={activity} />
                </div>

                {lobby && onJoinLobby ? (
                  lobby.id === currentLobbyId ? (
                    <span className="ct-friends-active-here">Aynı odadasınız</span>
                  ) : (
                    <Button
                      size="small"
                      icon={<SoundOutlined />}
                      aria-label={`${lobby.name} odasına katıl`}
                      onClick={() => onJoinLobby(lobby.id)}
                    >
                      Katıl
                    </Button>
                  )
                ) : (
                  <Tooltip title="Mesaj gönder">
                    <Button
                      size="small"
                      shape="circle"
                      icon={<MessageOutlined />}
                      aria-label={`${name} ile sohbeti aç`}
                      onClick={() => onOpenConversation(toPeer(user))}
                    />
                  </Tooltip>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    );
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
                    userId={row.userId}
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
                  userId={row.userId}
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
      <AuthLogoMark className="ct-brand-mural" />

      <PageHeader
        className="ct-friends-home-header"
        title="Arkadaşlar"
        description="Kimin ne yaptığını görün, sohbet açın ya da sesli arayın; sağ tık daha fazla seçenek gösterir."
        actions={
          <>
            {friendUsers.length > 0 && (
              <span className="ct-stat-chip">
                <span className="ct-online-dot" aria-hidden="true" />
                {onlineCount} çevrimiçi
              </span>
            )}
            <Button type="primary" icon={<UserAddOutlined />} onClick={onAddFriend}>
              Arkadaş Ekle
            </Button>
          </>
        }
      />

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

      <div className="ct-friends-home-body">
        {tab === "requests" ? (
          renderRequests()
        ) : (
          <>
            {renderActive()}
            {renderFriends()}
          </>
        )}
      </div>

      {profileTarget && (
        <UserProfileCardAnchor
          key={`profile-card-${profileTarget.userId}`}
          x={profileTarget.x}
          y={profileTarget.y}
          userId={profileTarget.userId}
          fallbackName={profileTarget.name}
          currentUserId={currentUserId}
          friends={friends}
          onClose={() => setProfileTarget(null)}
        />
      )}

      <ConfirmActionModal
        isOpen={pendingUnfriend !== null}
        title="Arkadaşlıktan Çıkar"
        icon={<UserDeleteOutlined />}
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
