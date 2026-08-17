import { useCallback, useRef, useState, type ReactElement } from "react";
import { Avatar, Button, Image, Input, Popover, Spin, Tag, message } from "antd";
import {
  ClockCircleOutlined,
  SendOutlined,
  UserAddOutlined,
} from "@ant-design/icons";
import { useUserCard } from "../../hooks/user/use-user-cards";
import type { FriendsController } from "../../hooks/user/use-friends";
import workspaceService from "../../services";
import { getApiErrorMessage } from "../../workspace-utils";
import { formatDateLabel, getDisplayInitials } from "../../workspace-utils";

// Same ceiling the composer uses. Enforced again server-side; this only stops
// the request being made at all.
const MAX_QUICK_MESSAGE_LENGTH = 2_000;

// The profile card: who is this person, and can I add them.
//
// It exists because a voice room is full of people the friends-only directory
// cannot describe — no avatar, no handle, no join date — so a stranger in a
// lobby was a grey circle with a display name on it. Everything here comes from
// the public-card endpoint, which answers for any id the caller already holds.
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

export function UserProfileCard({
  userId,
  fallbackName,
  currentUserId,
  friends,
  onPhotoPreviewChange,
}: UserProfileCardProps): ReactElement {
  const { card, isLoading, isUnavailable } = useUserCard(userId);
  const [isSending, setIsSending] = useState(false);

  const isSelf = userId === currentUserId;
  const isFriend = friends.friendIds.includes(userId);
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

  if (isLoading) {
    return (
      <div className="ct-profile-card loading">
        <Spin size="small" />
        <span>{fallbackName}</span>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="ct-profile-card">
        <div className="ct-profile-card-identity">
          <Avatar size={64} className="ct-profile-card-avatar">
            {getDisplayInitials(fallbackName)}
          </Avatar>
          <div className="ct-profile-card-names">
            <strong>{fallbackName}</strong>
            <span>
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

  return (
    <div className="ct-profile-card">
      {/* A colour band behind the avatar, the way every profile card since
          Discord has done it: it is what makes the avatar read as the subject
          of the card rather than as an icon next to a name. */}
      {/* aria-hidden either way: with a picture it is still decoration, and the
          card already names the person underneath it. */}
      <div
        className={`ct-profile-card-banner ${card.bannerUrl ? "has-image" : ""}`}
        aria-hidden="true"
      >
        {card.bannerUrl && <img src={card.bannerUrl} alt="" />}
      </div>

      <div className="ct-profile-card-identity">
        {card.avatarUrl ? (
          // antd's Image, not Avatar, so the picture opens full size on click.
          // A profile picture is the one thing on this card people want to see
          // bigger, and 88px is not it.
          //
          // classNames.root, NOT rootClassName. antd hands rootClassName to
          // rc-image, which puts it on the thumbnail's wrapper AND on the
          // fullscreen preview's root:
          //
          //     className:     clsx(prefixCls, rootClassName, classNames.root)
          //     rootClassName: clsx(previewRootClassName, rootClassName)
          //
          // antd needs that (its hashId and CSS-var classes have to reach the
          // portalled preview too), but it meant the 88px box below — fixed
          // size, overflow-hidden, rounded — also clamped the preview, so the
          // full-size picture opened as an 88px square in the top-left corner.
          // classNames.root lands on the thumbnail only.
          <Image
            src={card.avatarUrl}
            alt={displayName}
            className="ct-profile-card-photo"
            classNames={{ root: "ct-profile-card-photo-root" }}
            preview={{ mask: "Büyüt", onOpenChange: onPhotoPreviewChange }}
          />
        ) : (
          <Avatar size={88} className="ct-profile-card-avatar">
            {getDisplayInitials(displayName)}
          </Avatar>
        )}

        <div className="ct-profile-card-names">
          <strong>{displayName}</strong>
          <span>@{card.username}</span>
        </div>
      </div>

      <div className="ct-profile-card-tags">
        <Tag>{card.role === "admin" ? "Yönetici" : "Üye"}</Tag>
        {isFriend && <Tag color="success">Arkadaş</Tag>}
      </div>

      <div className="ct-profile-card-meta">
        <span>Katılım</span>
        <strong>{formatDateLabel(card.createdAt)}</strong>
      </div>

      {/* Nothing to offer for yourself or for someone already on the list; an
          outgoing request shows as state, not as a button that resends it. */}
      {!isSelf && !isFriend && (
        <Button
          block
          type="primary"
          size="small"
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
      rootClassName="ct-profile-card-popover"
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
  ...cardProps
}: UserProfileCardPopoverProps): ReactElement {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover
      open={isOpen}
      onOpenChange={setIsOpen}
      trigger="click"
      placement="right"
      rootClassName="ct-profile-card-popover"
      content={<UserProfileCard {...cardProps} />}
    >
      {children}
    </Popover>
  );
}
