import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Dropdown } from "antd";
import type { MenuProps } from "antd";
import {
  CopyOutlined,
  IdcardOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MessageOutlined,
  PhoneOutlined,
  SoundOutlined,
  UserDeleteOutlined,
} from "@ant-design/icons";
import type { FriendEntry, UserDirectoryEntry } from "@shared/auth-contracts";
import { gameActivityLabel, useGameActivityByUser } from "@/features/minigames";
import type { FriendsController } from "../../hooks/user/use-friends";
import type { OpenConversation } from "../../hooks/user/use-open-conversations";
import { UserProfileCardAnchor } from "../user/user-profile-card";
import { GameArt } from "../user/game-art";
import { ConfirmActionModal } from "../common";
import { ContextMenuPanel } from "../common/context-menu-panel";
import { getPresenceColor, getUserStatusLabel } from "../../workspace-utils";
import { Avatar, GamepadIcon, Icon, SpeakerIcon, UsersIcon, staggerStyle } from "./odak-parts";
import { OdakRail } from "./odak-rail";
import type { OdakRailProps } from "./odak-rail";

/**
 * The Arkadaşlar section in the "Odak" design: the section rail, the strip of
 * open conversations, and the friends home.
 *
 * With a conversation open it docks to the rail and the strip, and the shell's
 * own conversation panel shows beside it.
 */

/** The friends home's lists and actions; the conversation header reads the room ones too. */
export interface FriendsHomeProps {
  friends: FriendsController;
  directoryUsers: UserDirectoryEntry[];
  onOpenConversation: (peer: OpenConversation) => void;
  // Opens the Arkadaş Ekle modal the shell owns. With a friends-only directory
  // this is the only route to someone you are not already friends with.
  onAddFriend: () => void;
  // This list is exactly the set of people you may call, so the phone belongs
  // on the card: reaching it used to mean opening the DM thread first.
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

const SearchIcon = () => (
  <Icon size={15}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </Icon>
);

const PlusIcon = () => (
  <Icon size={15}>
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </Icon>
);

const MessageIcon = () => (
  <Icon size={16}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </Icon>
);

const PhoneIcon = () => (
  <Icon size={16}>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </Icon>
);

const MoreIcon = () => (
  <Icon size={16}>
    <circle cx="5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
  </Icon>
);

const CheckIcon = () => (
  <Icon size={16}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
);

const CloseIcon = () => (
  <Icon size={15}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Icon>
);

type Tab = "online" | "all" | "requests";

interface FriendActivity {
  kind: "lobby" | "minigame" | "game";
  label: string;
  lobby?: { id: string; name: string };
  game?: string;
}

interface Person {
  userId: string;
  username: string;
  name: string;
}

const normalize = (value: string): string => value.toLocaleLowerCase("tr-TR");

const toPeer = (user: UserDirectoryEntry): OpenConversation => ({
  userId: user.userId,
  username: user.username,
  displayName: user.displayName,
  avatarUrl: user.avatarUrl ?? null,
});

const nameOf = (entry: { displayName?: string; username?: string }): string =>
  entry.displayName || entry.username || "Bilinmeyen kullanıcı";

export interface OdakFriendsPageProps extends Omit<OdakRailProps, "activeSection"> {
  conversations: OpenConversation[];
  unreadByUserId: Record<string, number>;
  selectedUserId: string | null;
  onUserSelect: (userId: string) => void;
  onOpenHome: () => void;
  onCloseConversation: (userId: string) => void;
  stripCollapsed: boolean;
  onToggleStrip: () => void;
  home: FriendsHomeProps;
  /** The shell's quick-controls dock: microphone, output, the call row, a live share. */
  dock?: ReactNode;
}

export function OdakFriendsPage({
  conversations,
  unreadByUserId,
  selectedUserId,
  onUserSelect,
  onOpenHome,
  onCloseConversation,
  stripCollapsed,
  onToggleStrip,
  home,
  dock,
  ...rail
}: OdakFriendsPageProps) {
  const { currentUserId } = rail;
  const {
    friends,
    directoryUsers,
    onOpenConversation,
    onAddFriend,
    onInitiateCall,
    lobbyByUserId,
    currentLobbyId,
    onJoinLobby,
    onCopyUsername,
  } = home;
  const gameActivityByUser = useGameActivityByUser();
  const [tab, setTab] = useState<Tab>("online");
  // The page's first entrance, once: the cards and the side column step in
  // when the list first has something to show, and are left alone after it,
  // so a refresh or a friend coming online never replays it. While it lasts,
  // strip rows and counts that were already there do not animate either.
  const [intro, setIntro] = useState(true);
  const ready = !friends.isLoading;
  useEffect(() => {
    if (!ready) {
      return;
    }
    const timer = window.setTimeout(() => setIntro(false), 600);
    return () => window.clearTimeout(timer);
  }, [ready]);
  const [search, setSearch] = useState("");
  const [pendingUnfriend, setPendingUnfriend] = useState<Person | null>(null);
  const [profileTarget, setProfileTarget] = useState<{
    userId: string;
    name: string;
    x: number;
    y: number;
  } | null>(null);

  const query = normalize(search.trim());
  const matches = (...fields: string[]): boolean =>
    !query || fields.some((field) => normalize(field).includes(query));

  const directoryById = useMemo(
    () => new Map(directoryUsers.map((user) => [user.userId, user])),
    [directoryUsers],
  );

  // Friends only, as on the old page: the directory is already friends-only,
  // and the intersection closes the window an unfriend leaves in a cached list.
  const friendUsers = useMemo(() => {
    const ids = new Set(friends.friendIds);
    return directoryUsers
      .filter((user) => ids.has(user.userId))
      .sort((a, b) => nameOf(a).localeCompare(nameOf(b), "tr"));
  }, [directoryUsers, friends.friendIds]);

  const onlineCount = friendUsers.filter((user) => user.appOnline).length;
  const incomingCount = friends.incomingRequests.length;

  const activityOf = (user: UserDirectoryEntry): FriendActivity | null => {
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
      return { kind: "game", label: `${user.activity.name} oynuyor`, game: user.activity.name };
    }
    return null;
  };

  const visibleFriends = friendUsers.filter(
    (user) => (tab !== "online" || user.appOnline) && matches(user.displayName, user.username),
  );

  const toPeople = (entries: FriendEntry[]): Person[] =>
    entries
      .map((entry) => ({ userId: entry.userId, username: entry.username, name: nameOf(entry) }))
      .filter((person) => matches(person.name, person.username))
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));

  // Who is in which room, gathered per room, so a room with three friends in it
  // is one card with one "Katıl", not three.
  const activeRooms = new Map<string, { lobby: { id: string; name: string }; users: UserDirectoryEntry[] }>();
  const activeOthers: Array<{ user: UserDirectoryEntry; activity: FriendActivity }> = [];
  for (const user of friendUsers) {
    const activity = activityOf(user);
    if (!activity) {
      continue;
    }
    if (activity.kind === "lobby" && activity.lobby) {
      const room = activeRooms.get(activity.lobby.id) ?? { lobby: activity.lobby, users: [] };
      room.users.push(user);
      activeRooms.set(activity.lobby.id, room);
    } else {
      activeOthers.push({ user, activity });
    }
  }

  const openProfileAt = (user: UserDirectoryEntry, element: Element): void => {
    const rect = element.getBoundingClientRect();
    setProfileTarget({ userId: user.userId, name: nameOf(user), x: rect.left, y: rect.top });
  };

  const menuFor = (user: UserDirectoryEntry, activity: FriendActivity | null): MenuProps => {
    const items: NonNullable<MenuProps["items"]> = [
      {
        key: "profile",
        label: "Profili Gör",
        icon: <IdcardOutlined />,
        onClick: ({ domEvent }) => openProfileAt(user, domEvent.currentTarget as Element),
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
        disabled: !user.appOnline,
        extra: user.appOnline ? undefined : "çevrimdışı",
        onClick: () => onInitiateCall(user),
      });
    }
    if (activity?.lobby && onJoinLobby && activity.lobby.id !== currentLobbyId) {
      const lobbyId = activity.lobby.id;
      items.push({
        key: "join",
        label: "Odasına Katıl",
        extra: activity.lobby.name,
        icon: <SoundOutlined />,
        onClick: () => onJoinLobby(lobbyId),
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
        disabled: friends.pendingUserIds.includes(user.userId),
        onClick: () =>
          setPendingUnfriend({ userId: user.userId, username: user.username, name: nameOf(user) }),
      },
    );
    return { items };
  };

  const menuHeader = (user: UserDirectoryEntry, activity: FriendActivity | null) =>
    function renderMenu(origin: ReactNode): ReactNode {
      return (
        <ContextMenuPanel
          identity={{
            userId: user.userId,
            name: nameOf(user),
            avatarUrl: user.avatarUrl,
            detail: activity?.label ?? getUserStatusLabel(user.appOnline, user.presence),
          }}
          menu={origin}
        />
      );
    };

  // ponytail: one antd Dropdown per card; a few hundred friends would want a
  // virtualised list (@tanstack/react-virtual, as the chat threads use).
  const renderFriendCard = (user: UserDirectoryEntry, order = 0): ReactNode => {
    const name = nameOf(user);
    const activity = activityOf(user);
    const menu = menuFor(user, activity);
    const popupRender = menuHeader(user, activity);
    return (
      <Dropdown key={user.userId} trigger={["contextMenu"]} menu={menu} popupRender={popupRender}>
        <article
          className={`ct-odak-card ct-odak-friend ${user.appOnline ? "" : "offline"}`}
          style={staggerStyle(order)}
        >
          <button
            type="button"
            className="ct-odak-friend-open"
            onClick={() => onOpenConversation(toPeer(user))}
            aria-label={`${name} ile sohbeti aç`}
          >
            <Avatar
              userId={user.userId}
              name={name}
              avatarUrl={user.avatarUrl}
              presence={getPresenceColor(user.appOnline, user.presence)}
              className="card"
            />
            <span className="ct-odak-friend-meta">
              <span className="ct-odak-friend-name">{name}</span>
              <span className="ct-odak-friend-status">
                {activity?.label ?? getUserStatusLabel(user.appOnline, user.presence)}
              </span>
            </span>
          </button>
          <button
            type="button"
            className="ct-odak-icon-button"
            title="Mesaj gönder"
            aria-label={`${name} ile mesajlaş`}
            onClick={() => onOpenConversation(toPeer(user))}
          >
            <MessageIcon />
          </button>
          {onInitiateCall && user.appOnline && (
            <button
              type="button"
              className="ct-odak-icon-button"
              title="Sesli ara"
              aria-label={`${name} kişisini ara`}
              onClick={() => onInitiateCall(user)}
            >
              <PhoneIcon />
            </button>
          )}
          <Dropdown trigger={["click"]} menu={menu} popupRender={popupRender}>
            <button
              type="button"
              className="ct-odak-icon-button"
              title="Diğer seçenekler"
              aria-label={`${name} için diğer seçenekler`}
            >
              <MoreIcon />
            </button>
          </Dropdown>
        </article>
      </Dropdown>
    );
  };

  const renderRequestCard = (person: Person, incoming: boolean, order = 0): ReactNode => {
    const isPending = friends.pendingUserIds.includes(person.userId);
    return (
      <article key={person.userId} className="ct-odak-card ct-odak-request" style={staggerStyle(order)}>
        <Avatar userId={person.userId} name={person.name} className="request" />
        <span className="ct-odak-friend-meta">
          <span className="ct-odak-friend-name">{person.name}</span>
          <span className="ct-odak-friend-status">
            {incoming ? "Seni eklemek istiyor" : "İsteğin yanıt bekliyor"}
          </span>
        </span>
        {incoming && (
          <button
            type="button"
            className="ct-odak-accept"
            title="Kabul et"
            aria-label={`${person.name} isteğini kabul et`}
            disabled={isPending}
            onClick={() => void friends.acceptRequest(person.userId)}
          >
            <CheckIcon />
          </button>
        )}
        <button
          type="button"
          className="ct-odak-decline"
          title={incoming ? "Reddet" : "İsteği geri çek"}
          aria-label={incoming ? `${person.name} isteğini reddet` : `${person.name} isteğini geri çek`}
          disabled={isPending}
          onClick={() => void friends.removeFriend(person.userId)}
        >
          <CloseIcon />
        </button>
      </article>
    );
  };

  const renderState = (title: string, detail?: string, action?: ReactNode): ReactNode => (
    <div className="ct-odak-state">
      <strong>{title}</strong>
      {detail && <span>{detail}</span>}
      {action}
    </div>
  );

  const renderList = (): ReactNode => {
    if (friends.isLoading) {
      // Placeholders in the cards' shape, a soft sheen across them.
      return (
        <>
          <p className="ct-odak-sr" role="status">Arkadaşlar yükleniyor…</p>
          {[0, 1, 2, 3, 4, 5].map((slot) => (
            <div key={slot} className="ct-odak-card ct-odak-skeleton" aria-hidden="true" />
          ))}
        </>
      );
    }
    if (friends.loadError) {
      return renderState(
        "Arkadaş listesi yüklenemedi.",
        "Bağlantını kontrol edip tekrar dene.",
        <button type="button" className="ct-odak-secondary small" onClick={friends.refresh} disabled={friends.isRefreshing}>
          Tekrar dene
        </button>,
      );
    }

    if (tab === "requests") {
      const incoming = toPeople(friends.incomingRequests);
      const outgoing = toPeople(friends.outgoingRequests);
      if (incoming.length === 0 && outgoing.length === 0) {
        return renderState(query ? "Aramaya uygun istek yok." : "Bekleyen istek yok.");
      }
      return (
        <>
          {incoming.length > 0 && <h2 className="ct-odak-list-title">GELEN · {incoming.length}</h2>}
          {incoming.map((person, index) => renderRequestCard(person, true, index))}
          {outgoing.length > 0 && <h2 className="ct-odak-list-title">GÖNDERİLEN · {outgoing.length}</h2>}
          {outgoing.map((person, index) =>
            renderRequestCard(person, false, incoming.length + index),
          )}
        </>
      );
    }

    if (visibleFriends.length === 0) {
      if (query) {
        return renderState("Aramaya uygun arkadaş bulunamadı.", "Farklı bir isim dene.");
      }
      if (tab === "online" && friendUsers.length > 0) {
        return renderState("Şu anda çevrimiçi arkadaşın yok.", "Biri bağlandığında burada görünür.");
      }
      return renderState(
        "Henüz arkadaşın yok.",
        "Kullanıcı adını bildiğin birine arkadaşlık isteği gönder.",
        <button type="button" className="ct-odak-primary small" onClick={onAddFriend}>
          <PlusIcon />
          Arkadaş ekle
        </button>,
      );
    }
    return visibleFriends.map((user, index) => renderFriendCard(user, index));
  };

  const docked = selectedUserId !== null;
  // The side column's stagger order, in the order its cards are drawn.
  let sideOrder = 0;

  return (
    <div
      className={`ct-odak ${docked ? "docked" : ""} ${stripCollapsed ? "" : "strip-open"} ${intro ? "intro" : ""}`}
    >
      <OdakRail activeSection="users" {...rail} />

      {/* Open: the conversations as a list with names and status. Folded: the
          strip of avatars the mock-up draws. One preference with the rest of
          the app's sidebars (viewPreferences.sidebarOpen). */}
      <nav className={`ct-odak-strip ${stripCollapsed ? "" : "open"}`} aria-label="Sohbetler">
        <div className="ct-odak-strip-head">
          <button
            type="button"
            className={`ct-odak-strip-home ${docked ? "" : "active"}`}
            aria-label="Arkadaşlar ana sayfası"
            aria-current={docked ? undefined : "page"}
            title="Arkadaşlar"
            onClick={onOpenHome}
          >
            <UsersIcon size={20} />
            <span className="ct-odak-strip-text">Arkadaşlar</span>
            {!docked && incomingCount > 0 && <span className="ct-odak-count">{incomingCount}</span>}
          </button>
          <button
            type="button"
            className="ct-odak-strip-toggle"
            title={stripCollapsed ? "Kenar çubuğunu genişlet" : "Kenar çubuğunu daralt"}
            aria-label={stripCollapsed ? "Kenar çubuğunu genişlet" : "Kenar çubuğunu daralt"}
            aria-expanded={!stripCollapsed}
            onClick={onToggleStrip}
          >
            {stripCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </button>
        </div>
        <div className="ct-odak-strip-divider" />
        <p className="ct-odak-strip-title ct-odak-strip-text">SOHBETLER</p>
        <div className="ct-odak-strip-list">
          {conversations.length === 0 && (
            <p className="ct-odak-strip-empty ct-odak-strip-text">
              Bir arkadaşına mesaj gönderdiğinde sohbet burada görünür.
            </p>
          )}
          {conversations.map((conversation) => {
            const name = nameOf(conversation);
            const directory = directoryById.get(conversation.userId);
            const unread = unreadByUserId[conversation.userId] ?? 0;
            const selected = selectedUserId === conversation.userId;
            return (
              <Dropdown
                key={conversation.userId}
                trigger={["contextMenu"]}
                menu={{
                  items: [
                    {
                      key: "close",
                      label: "Sohbeti Kapat",
                      onClick: () => onCloseConversation(conversation.userId),
                    },
                  ],
                }}
              >
                <div className={`ct-odak-strip-row ${selected ? "active" : ""}`}>
                  <button
                    type="button"
                    className="ct-odak-strip-dm"
                    title={name}
                    aria-current={selected ? "page" : undefined}
                    aria-label={`${name} ile sohbet${unread ? `, ${unread} okunmamış` : ""}`}
                    onClick={() => onUserSelect(conversation.userId)}
                  >
                    <Avatar
                      userId={conversation.userId}
                      name={name}
                      avatarUrl={conversation.avatarUrl ?? directory?.avatarUrl}
                      presence={getPresenceColor(directory?.appOnline, directory?.presence)}
                      className="strip"
                    />
                    <span className="ct-odak-strip-text ct-odak-strip-meta">
                      <span className="ct-odak-friend-name">{name}</span>
                      <span className="ct-odak-friend-status">
                        {getUserStatusLabel(directory?.appOnline, directory?.presence)}
                      </span>
                    </span>
                    {unread > 0 && !selected && (
                      <span className="ct-odak-count">{unread > 99 ? "99+" : unread}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    className="ct-odak-strip-close ct-odak-strip-text"
                    title="Sohbeti kapat"
                    aria-label={`${name} sohbetini kapat`}
                    onClick={() => onCloseConversation(conversation.userId)}
                  >
                    <CloseIcon />
                  </button>
                </div>
              </Dropdown>
            );
          })}
        </div>
        {dock}
      </nav>

      {!docked && (
        <main className="ct-odak-main">
          <header className="ct-odak-header">
            <div className="ct-odak-pill">
              <h1>Arkadaşlar</h1>
            </div>
            <div className="ct-odak-tabs" role="tablist" aria-label="Arkadaş listesi">
              {(
                [
                  ["online", `Çevrimiçi · ${onlineCount}`],
                  ["all", `Tümü · ${friendUsers.length}`],
                  ["requests", `İstekler · ${incomingCount}`],
                ] as Array<[Tab, string]>
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={tab === value}
                  className={`${tab === value ? "active" : ""} ${value === "requests" && incomingCount > 0 ? "alert" : ""}`}
                  onClick={() => setTab(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="ct-odak-fill" />
            <label className="ct-odak-search">
              <SearchIcon />
              <span className="ct-odak-sr">Arkadaş ara</span>
              <input
                placeholder="Arkadaş ara"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <button type="button" className="ct-odak-primary" onClick={onAddFriend}>
              <PlusIcon />
              Arkadaş ekle
            </button>
          </header>

          <div className="ct-odak-body">
            {/* Keyed by tab: switching tabs fades the new list in. */}
            <section
              key={tab}
              className={`ct-odak-friends ${tab === "requests" ? "single" : ""}`}
              aria-label={tab === "requests" ? "Arkadaşlık istekleri" : "Arkadaşlar"}
            >
              {renderList()}
            </section>

            <aside className="ct-odak-side" aria-label="Şu an aktif">
              <h2 className="ct-odak-side-title">ŞU AN AKTİF</h2>
              {activeRooms.size === 0 && activeOthers.length === 0 && (
                <p className="ct-odak-side-empty">Şu an bir odada ya da oyunda olan arkadaşın yok.</p>
              )}

              {[...activeRooms.values()].map(({ lobby, users }) => {
                const names = users.map(nameOf);
                const who =
                  names.length === 1
                    ? `${names[0]} burada`
                    : `${names.slice(0, -1).join(", ")} ve ${names[names.length - 1]} burada`;
                const here = lobby.id === currentLobbyId;
                return (
                  <article
                    key={lobby.id}
                    className="ct-odak-card ct-odak-activity ct-odak-activity-room"
                    style={staggerStyle(++sideOrder)}
                  >
                    <div className="ct-odak-activity-row">
                      <span className="ct-odak-tile accent" aria-hidden="true">
                        <SpeakerIcon size={17} />
                      </span>
                      <div className="ct-odak-fill">
                        <div className="ct-odak-activity-name">{lobby.name}</div>
                        <div className="ct-odak-muted">{who}</div>
                      </div>
                    </div>
                    <div className="ct-odak-activity-row">
                      <div className="ct-odak-faces">
                        {users.slice(0, 5).map((user) => (
                          <Avatar
                            key={user.userId}
                            userId={user.userId}
                            name={nameOf(user)}
                            avatarUrl={user.avatarUrl}
                            className="face"
                          />
                        ))}
                      </div>
                      <span className="ct-odak-fill" />
                      {here ? (
                        <span className="ct-odak-muted">Buradasın</span>
                      ) : (
                        onJoinLobby && (
                          <button
                            type="button"
                            className="ct-odak-primary small"
                            onClick={() => onJoinLobby(lobby.id)}
                          >
                            Katıl
                          </button>
                        )
                      )}
                    </div>
                  </article>
                );
              })}

              {activeOthers.map(({ user, activity }) => (
                <article
                  key={user.userId}
                  className="ct-odak-card ct-odak-activity ct-odak-activity-row"
                  style={staggerStyle(++sideOrder)}
                >
                  {activity.kind === "game" && activity.game ? (
                    <span className="ct-odak-game-art">
                      <GameArt name={activity.game} size="md" />
                    </span>
                  ) : (
                    <span className="ct-odak-tile game" aria-hidden="true">
                      <GamepadIcon size={20} />
                    </span>
                  )}
                  <div className="ct-odak-fill">
                    <div className="ct-odak-activity-name">{nameOf(user)}</div>
                    <div className="ct-odak-muted">{activity.label}</div>
                  </div>
                </article>
              ))}

              {incomingCount > 0 && (
                <>
                  <h2 className="ct-odak-side-title spaced">BEKLEYEN İSTEKLER</h2>
                  {toPeople(friends.incomingRequests)
                    .slice(0, 3)
                    .map((person) => renderRequestCard(person, true, ++sideOrder))}
                  {incomingCount > 3 && (
                    <button type="button" className="ct-odak-secondary small" onClick={() => setTab("requests")}>
                      Tümünü gör · {incomingCount}
                    </button>
                  )}
                </>
              )}
            </aside>
          </div>
        </main>
      )}

      {profileTarget && (
        <UserProfileCardAnchor
          key={`odak-profile-${profileTarget.userId}`}
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
        message={`${pendingUnfriend?.name ?? ""} arkadaş listenden kaldırılacak. Geri almak için karşı tarafın yeni isteğini kabul etmesi gerekir.`}
        confirmLabel="Arkadaşlıktan Çıkar"
        isProcessing={pendingUnfriend !== null && friends.pendingUserIds.includes(pendingUnfriend.userId)}
        onConfirm={() => {
          if (!pendingUnfriend) {
            return;
          }
          void friends.removeFriend(pendingUnfriend.userId).then(() => setPendingUnfriend(null));
        }}
        onCancel={() => setPendingUnfriend(null)}
      />
    </div>
  );
}
