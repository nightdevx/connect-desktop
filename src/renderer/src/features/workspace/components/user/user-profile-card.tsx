import { useCallback, useRef, useState, type ReactElement } from "react";
import { Avatar, Button, Image, Input, Popover, Tag, Tooltip, message } from "antd";
import type { TooltipPlacement } from "antd/es/tooltip";
import {
  CheckOutlined,
  ClockCircleOutlined,
  CopyOutlined,
  CrownOutlined,
  PlayCircleOutlined,
  SendOutlined,
  UsergroupAddOutlined,
  TeamOutlined,
  UserAddOutlined,
} from "@ant-design/icons";
import {
  gameActivityLabel,
  joinMinigameTable,
  minigameLabel,
  useGameActivityByUser,
} from "@/features/minigames";
import { useUiStore } from "@/store/ui-store";
import { useUserCard } from "../../hooks/user/use-user-cards";
import { useUserPresence } from "../../hooks/user/use-user-presence";
import type { FriendsController } from "../../hooks/user/use-friends";
import workspaceService from "../../services";
import {
  formatDateLabel,
  formatMembershipLength,
  getApiErrorMessage,
  getDisplayInitials,
  getPresenceColor,
  getUserStatusLabel,
} from "../../workspace-utils";

// Same ceiling the composer uses. Enforced again server-side; this only stops
// the request being made at all.
const MAX_QUICK_MESSAGE_LENGTH = 2_000;

// The profile card: who is this person, and what can I do about it.
//
// It exists because a voice room is full of people the friends-only directory
// cannot describe — no avatar, no handle, no join date — so a stranger in a
// lobby was a grey circle with a display name on it. Everything here comes from
// the public-card endpoint, which answers for any id the caller already holds,
// plus two things the client already knows and the card used to throw away:
// whether they are online (directory, friends only) and how long they have been
// a member (derived from the join date it was already printing).
//
// Deliberately NOT a full profile drawer. Blocking, unfriending and opening a
// DM already have their own surfaces (the conversation header, the friends
// home, the row's right-click menu), and each needs a confirmation flow this
// popover would have to grow a modal for.

interface UserProfileCardProps {
  userId: string;
  /** Shown while the card loads, and if the server will not name them. */
  fallbackName: string;
  currentUserId: string;
  friends: FriendsController;
  /**
   * Fires while the avatar's full-size preview is open.
   *
   * A host that unmounts this card on an outside click has to know, because the
   * preview is portalled to document.body and every click on it reads as
   * outside -- closing the card would take the picture down with it.
   */
  onPhotoPreviewChange?: (open: boolean) => void;
}

/** The band + avatar frame, shared by the real card and its loading skeleton. */
function ProfileCardBanner({
  bannerUrl,
}: {
  bannerUrl?: string | null;
}): ReactElement {
  return (
    // A colour band behind the avatar, the way every profile card since Discord
    // has done it: it is what makes the avatar read as the subject of the card
    // rather than as an icon next to a name.
    //
    // aria-hidden either way: with a picture it is still decoration, and the
    // card already names the person underneath it.
    <div
      className={`ct-profile-card-banner ${bannerUrl ? "has-image" : ""}`}
      aria-hidden="true"
    >
      {bannerUrl && <img src={bannerUrl} alt="" />}
    </div>
  );
}

export function UserProfileCard({
  userId,
  fallbackName,
  currentUserId,
  friends,
  onPhotoPreviewChange,
}: UserProfileCardProps): ReactElement {
  const { card, isLoading, isUnavailable } = useUserCard(userId);
  const presence = useUserPresence(userId);
  const [isSending, setIsSending] = useState(false);
  const [hasCopiedHandle, setHasCopiedHandle] = useState(false);

  const isSelf = userId === currentUserId;
  const isFriend = friends.friendIds.includes(userId);

  const gameActivity = useGameActivityByUser();
  const activity = gameActivity.get(userId) ?? null;
  // My own table, for the invite. Offered only while it is still a lobby --
  // asking somebody to a game that has been dealt is asking them to a chair
  // that no longer exists.
  const myTable = gameActivity.get(currentUserId) ?? null;
  const canInvite =
    !isSelf && !activity && myTable?.role === "playing" && myTable.joinable;

  const setSelectedMinigame = useUiStore((state) => state.setSelectedMinigame);
  const setWorkspaceSection = useUiStore((state) => state.setWorkspaceSection);
  const [joining, setJoining] = useState(false);
  const [inviting, setInviting] = useState(false);

  const handleJoinGame = useCallback((): void => {
    if (!activity || joining) {
      return;
    }

    setJoining(true);
    void joinMinigameTable(activity.tableId)
      .then((joined) => {
        if (!joined) {
          message.error("Masaya oturulamadı. Oyun başlamış olabilir.");
          return;
        }
        // The page opens on whatever game was last looked at, so the table
        // would otherwise be joined behind a board nobody asked for.
        setSelectedMinigame(activity.game);
        setWorkspaceSection("minigames");
      })
      .finally(() => setJoining(false));
  }, [activity, joining, setSelectedMinigame, setWorkspaceSection]);

  /**
   * Asks somebody to the table this account is at.
   *
   * Sent as a direct message rather than as a new kind of notification, because
   * a DM is already delivered live, already survives being offline, and already
   * shows up in a place people look. The other half of the invite is the button
   * above: whoever gets this opens the sender's card and joins from it, which
   * is the same path a stranger takes.
   */
  const handleInviteToGame = useCallback((): void => {
    if (!myTable || inviting) {
      return;
    }

    const game = minigameLabel(myTable.game);
    setInviting(true);
    void workspaceService
      .sendDirectMessage({
        peerUserId: userId,
        body: `Seni ${game} masama çağırıyorum — profilimden "Oyuna katıl" ile gelebilirsin.`,
      })
      .then((result) => {
        if (!result.ok) {
          message.error(`Davet gönderilemedi: ${getApiErrorMessage(result.error)}`);
          return;
        }
        message.success(`${game} daveti gönderildi`);
      })
      .finally(() => setInviting(false));
  }, [inviting, myTable, userId]);
  const hasOutgoingRequest = friends.outgoingRequests.some(
    (entry) => entry.userId === userId,
  );

  const handleAddFriend = useCallback((): void => {
    // The handle comes from the card, never from the roster: a lobby row
    // carries the DISPLAY name, and the send route is keyed by username — which
    // is exactly why "Arkadaş Ekle" used to answer "Kullanıcı bulunamadı" for
    // everyone who had set a display name.
    if (!card?.username || isSending) {
      return;
    }

    setIsSending(true);
    void friends
      .sendRequest(card.username)
      .then((result) => {
        // use-friends already maps the server's codes to Turkish.
        if (result.ok) {
          message.success(result.message);
        } else {
          message.error(result.message);
        }
      })
      .finally(() => setIsSending(false));
  }, [card?.username, friends, isSending]);

  const handleCopyHandle = useCallback((): void => {
    if (!card?.username) {
      return;
    }

    void navigator.clipboard
      .writeText(`@${card.username}`)
      .then(() => {
        // The tick on the button IS the confirmation; a toast for a copy is
        // noise on top of a popover that is already an overlay.
        setHasCopiedHandle(true);
        window.setTimeout(() => setHasCopiedHandle(false), 1_400);
      })
      .catch(() => message.error("Kullanıcı adı kopyalanamadı"));
  }, [card?.username]);

  // The skeleton is the finished layout with its text blanked out, not a
  // spinner on a line of its own: the card is a popover anchored to a row, and
  // one that opens 40px tall and then jumps to 300px drags its own anchor
  // across the screen while the query lands.
  if (isLoading) {
    return (
      <div className="ct-profile-card loading" aria-busy="true">
        <ProfileCardBanner />

        <div className="ct-profile-card-head">
          <div className="ct-profile-card-photo-root skeleton" />
          <div className="ct-profile-card-names">
            <strong>{fallbackName}</strong>
            <span className="ct-profile-card-skeleton-line" />
          </div>
        </div>

        {/* Reserved, not just the stats. Without the tag row and the two action
            slots the card still grew about 100px when the query landed — which
            is the jump the skeleton exists to prevent, and it drags the popover
            across its own anchor on the way. */}
        <div className="ct-profile-card-tags">
          <span className="ct-profile-card-skeleton-line tag" />
          <span className="ct-profile-card-skeleton-line tag" />
        </div>

        <div className="ct-profile-card-stats">
          <div className="ct-profile-card-stat">
            <span>Katılım</span>
            <strong className="ct-profile-card-skeleton-line" />
          </div>
          <div className="ct-profile-card-stat">
            <span>Üyelik</span>
            <strong className="ct-profile-card-skeleton-line" />
          </div>
        </div>

        {/* isSelf is known before the query answers, so the slots that only
            exist for other people are reserved only for other people. */}
        {!isSelf && (
          <>
            <span className="ct-profile-card-skeleton-line bar" />
            <span className="ct-profile-card-skeleton-line bar" />
          </>
        )}
      </div>
    );
  }

  if (!card) {
    return (
      <div className="ct-profile-card">
        <ProfileCardBanner />

        <div className="ct-profile-card-head">
          {/* 96, the same as the loaded card and the skeleton. At 88 the avatar
              shrank by 8px the moment the query failed, so the failure looked
              like a second, differently-sized card. */}
          <Avatar size={96} className="ct-profile-card-avatar">
            {getDisplayInitials(fallbackName)}
          </Avatar>

          <div className="ct-profile-card-names">
            <strong>{fallbackName}</strong>
            <span className="ct-profile-card-unavailable">
              {isUnavailable
                ? "Bu hesabın profili görüntülenemiyor."
                : "Profil yüklenemedi."}
            </span>
          </div>
        </div>
      </div>
    );
  }

  const displayName = card.displayName.trim() || card.username;
  const isAdmin = card.role === "admin";

  return (
    <div className="ct-profile-card">
      <ProfileCardBanner bannerUrl={card.bannerUrl} />

      <div className="ct-profile-card-head">
        <div className="ct-profile-card-photo-wrap">
          {card.avatarUrl ? (
            // antd's Image, not Avatar, so the picture opens full size on click.
            // A profile picture is the one thing on this card people want to see
            // bigger, and 96px is not it.
            //
            // classNames.root, NOT rootClassName. antd hands rootClassName to
            // rc-image, which puts it on the thumbnail's wrapper AND on the
            // fullscreen preview's root:
            //
            //     className:     clsx(prefixCls, rootClassName, classNames.root)
            //     rootClassName: clsx(previewRootClassName, rootClassName)
            //
            // antd needs that (its hashId and CSS-var classes have to reach the
            // portalled preview too), but it meant the fixed-size,
            // overflow-hidden, rounded box below also clamped the preview, so
            // the full-size picture opened as a 96px square in the top-left
            // corner. classNames.root lands on the thumbnail only.
            <Image
              src={card.avatarUrl}
              alt={displayName}
              className="ct-profile-card-photo"
              classNames={{ root: "ct-profile-card-photo-root" }}
              preview={{ mask: "Büyüt", onOpenChange: onPhotoPreviewChange }}
            />
          ) : (
            <Avatar size={96} className="ct-profile-card-avatar">
              {getDisplayInitials(displayName)}
            </Avatar>
          )}

          {/* Only for people the directory carries, which is friends. Guessing
              "çevrimdışı" for a stranger would be wrong about most of a room. */}
          {presence && (
            <Tooltip
              title={getUserStatusLabel(presence.appOnline, presence.presence)}
            >
              <span
                className="ct-profile-card-presence"
                style={{
                  background: getPresenceColor(
                    presence.appOnline,
                    presence.presence,
                  ),
                }}
                role="img"
                aria-label={getUserStatusLabel(
                  presence.appOnline,
                  presence.presence,
                )}
              />
            </Tooltip>
          )}
        </div>

        <div className="ct-profile-card-names">
          <strong title={displayName}>{displayName}</strong>

          {/* The handle is the one string on this card somebody needs to type
              somewhere else — into "Arkadaş Ekle", into a lobby's allow list —
              so it is a copy button rather than dead text. */}
          <button
            type="button"
            className="ct-profile-card-handle"
            onClick={handleCopyHandle}
            title="Kullanıcı adını kopyala"
          >
            <span>@{card.username}</span>
            {hasCopiedHandle ? <CheckOutlined /> : <CopyOutlined />}
          </button>
        </div>
      </div>

      {/* antd's `color="gold"` / `color="success"` presets are antd's palette,
          not this app's: they ignore --ct-warning and --ct-success and paint two
          saturated chips into an otherwise monochrome card. The variants are
          classes now, built from the tokens, so they follow the theme. */}
      <div className="ct-profile-card-tags">
        {isAdmin ? (
          <Tag className="ct-profile-card-tag admin" icon={<CrownOutlined />}>
            Yönetici
          </Tag>
        ) : (
          <Tag className="ct-profile-card-tag">Üye</Tag>
        )}
        {isSelf && <Tag className="ct-profile-card-tag">Sen</Tag>}
        {isFriend && (
          <Tag className="ct-profile-card-tag friend" icon={<TeamOutlined />}>
            Arkadaş
          </Tag>
        )}
        {!isSelf && !isFriend && hasOutgoingRequest && (
          <Tag className="ct-profile-card-tag" icon={<ClockCircleOutlined />}>
            İstek gönderildi
          </Tag>
        )}
      </div>

      {activity || canInvite ? (
        <div className="ct-profile-card-game">
          <span className="ct-profile-card-game-label">
            {activity
              ? gameActivityLabel(activity)
              : `${minigameLabel(myTable!.game)} masandasın`}
          </span>
          {/* Offered only while the table is still a lobby. A game already
              dealt has no chair to give, and a button that fails is worse than
              no button. */}
          {activity && !isSelf && activity.joinable ? (
            <Button
              size="small"
              type="primary"
              icon={<PlayCircleOutlined />}
              loading={joining}
              onClick={handleJoinGame}
            >
              Oyuna katıl
            </Button>
          ) : null}
          {canInvite ? (
            <Button
              size="small"
              icon={<UsergroupAddOutlined />}
              loading={inviting}
              onClick={handleInviteToGame}
            >
              Oyuna davet et
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Two facts from one field. A date alone cannot be ranked — "14.03.2024"
          says nothing about whether this is a founding member or somebody who
          signed up last week, which is the only thing a join date is read
          for. */}
      <div className="ct-profile-card-stats">
        <div className="ct-profile-card-stat">
          <span>Katılım</span>
          <strong>{formatDateLabel(card.createdAt)}</strong>
        </div>

        <div className="ct-profile-card-stat">
          <span>Üyelik</span>
          <strong>{formatMembershipLength(card.createdAt)}</strong>
        </div>

        {presence && (
          <div className="ct-profile-card-stat">
            <span>Durum</span>
            <strong>
              {getUserStatusLabel(presence.appOnline, presence.presence)}
            </strong>
          </div>
        )}
      </div>

      {/* Nothing to offer for yourself or for someone already on the list; an
          outgoing request shows as state, not as a button that resends it. */}
      {!isSelf && !isFriend && (
        <Button
          block
          type="primary"
          icon={hasOutgoingRequest ? <ClockCircleOutlined /> : <UserAddOutlined />}
          disabled={hasOutgoingRequest}
          loading={isSending}
          onClick={handleAddFriend}
        >
          {hasOutgoingRequest ? "İstek Gönderildi" : "Arkadaş Ekle"}
        </Button>
      )}

      {!isSelf && (
        <QuickMessageBar peerUserId={userId} peerName={card.username} />
      )}
    </div>
  );
}

/**
 * Send one message without leaving the card.
 *
 * The card is opened from a roster row, a chat mention or a video tile — every
 * one of them a place where the thing you want is to say something to this
 * person, and where the route to it was: close the card, switch to Kişiler,
 * find the row, click it, then type. It sends straight through the DM endpoint
 * and does not open the thread: this is a reply, not a context switch.
 */
function QuickMessageBar({
  peerUserId,
  peerName,
}: {
  peerUserId: string;
  peerName: string;
}): ReactElement {
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);

  const send = useCallback((): void => {
    const body = draft.trim();
    if (!body || isSending) {
      return;
    }

    setIsSending(true);
    void workspaceService
      .sendDirectMessage({ peerUserId, body })
      .then((result) => {
        if (!result.ok) {
          message.error(`Mesaj gönderilemedi: ${getApiErrorMessage(result.error)}`);
          return;
        }

        // Cleared only on success, so a rejected message is still in the box to
        // retry or copy out of.
        setDraft("");
        message.success(`@${peerName} kişisine mesaj gönderildi`);
      })
      .finally(() => setIsSending(false));
  }, [draft, isSending, peerName, peerUserId]);

  return (
    <div
      className="ct-profile-card-composer"
      // The card lives inside popovers and context menus whose parents treat a
      // click as "join this lobby" or "close me".
      onClick={(event) => event.stopPropagation()}
    >
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onPressEnter={send}
        maxLength={MAX_QUICK_MESSAGE_LENGTH}
        placeholder={`@${peerName} kişisine yaz`}
        disabled={isSending}
      />
      <Button
        type="primary"
        icon={<SendOutlined />}
        loading={isSending}
        disabled={draft.trim().length === 0}
        onClick={send}
        aria-label="Gönder"
      />
    </div>
  );
}

interface UserProfileCardAnchorProps extends UserProfileCardProps {
  x: number;
  y: number;
  onClose: () => void;
}

/**
 * The same card, opened at a screen position rather than around an element —
 * for the lobby stage, where the trigger is a right-click on a video tile and
 * there is no element to hang a popover on.
 *
 * The anchor is a 1x1 fixed div with pointer events off, the same trick
 * ParticipantContextMenu uses: a transform anywhere up the tile's ancestry
 * would otherwise offset an element-anchored popover.
 */
export function UserProfileCardAnchor({
  x,
  y,
  onClose,
  ...cardProps
}: UserProfileCardAnchorProps): ReactElement {
  // A ref, not state: this is read inside onOpenChange during the same gesture
  // that sets it, and a state update would not have landed yet.
  const isPhotoPreviewOpen = useRef(false);

  return (
    <Popover
      open
      rootClassName="ct-profile-card-popover"
      onOpenChange={(open) => {
        // The avatar's full-size preview is portalled to document.body, so
        // every click on it is "outside" this popover. Closing here would
        // unmount the card and the picture with it -- the host owns this
        // component's lifetime, so unlike UserProfileCardPopover it cannot rely
        // on the popup merely being hidden.
        if (!open && !isPhotoPreviewOpen.current) {
          onClose();
        }
      }}
      trigger="click"
      placement="rightTop"
      content={
        <UserProfileCard
          {...cardProps}
          onPhotoPreviewChange={(open) => {
            isPhotoPreviewOpen.current = open;
          }}
        />
      }
      destroyOnHidden
    >
      <div
        style={{
          position: "fixed",
          left: x,
          top: y,
          width: 1,
          height: 1,
          zIndex: 9999,
          pointerEvents: "none",
        }}
      />
    </Popover>
  );
}

interface UserProfileCardPopoverProps extends UserProfileCardProps {
  children: ReactElement;
  /** Roster rows sit at the left edge; the quick dock sits at the bottom. */
  placement?: TooltipPlacement;
}

/**
 * Click-to-open wrapper.
 *
 * `content` is passed unconditionally, and that is load-bearing. It used to be
 * `content={isOpen ? <UserProfileCard/> : null}` to keep the card's query from
 * firing for every name on screen -- an optimisation that made the component
 * impossible to open at all. antd's Tooltip, which Popover is built on, refuses
 * to report an open request for a popup that has nothing in it:
 *
 *     const noTitle = !title && !overlay && title !== 0;   // antd/lib/tooltip
 *     setOpen(noTitle ? false : vis);
 *     if (!noTitle && onOpenChange) { onOpenChange(vis); }
 *
 * Closed meant empty, empty meant onOpenChange was swallowed, swallowed meant
 * isOpen never turned true, and it stayed empty. A deadlock, and the only click
 * target in the app that used this wrapper simply did nothing.
 *
 * And deliberately NO destroyOnHidden, which is what keeps the avatar's
 * full-size preview working. antd renders that preview from inside this
 * Popover's subtree but portals it to document.body, so it is a SIBLING of the
 * popover, not a child. The first mousedown that lands on it therefore counts
 * as "outside" and closes the popover -- and with destroyOnHidden that unmounts
 * the <Image>, taking its preview portal down with it. The picture opened and
 * vanished in the same gesture. Without it the popup is only hidden, the Image
 * stays mounted, and the preview outlives the card it was opened from.
 *
 * The lazy mount this costs is small: antd still does not render the popup's
 * subtree until the popover is opened the first time, so a roster of fifty
 * names still fires zero card queries until one is clicked.
 */
export function UserProfileCardPopover({
  children,
  placement = "right",
  ...cardProps
}: UserProfileCardPopoverProps): ReactElement {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover
      open={isOpen}
      onOpenChange={setIsOpen}
      rootClassName="ct-profile-card-popover"
      trigger="click"
      placement={placement}
      content={<UserProfileCard {...cardProps} />}
    >
      {children}
    </Popover>
  );
}
