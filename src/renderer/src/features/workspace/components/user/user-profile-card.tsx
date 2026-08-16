import { useCallback, useState, type ReactElement } from "react";
import { Avatar, Button, Popover, Spin, Tag, message } from "antd";
import { ClockCircleOutlined, UserAddOutlined } from "@ant-design/icons";
import { useUserCard } from "../../hooks/user/use-user-cards";
import type { FriendsController } from "../../hooks/user/use-friends";
import { formatDateLabel, getDisplayInitials } from "../../workspace-utils";

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
}

export function UserProfileCard({
  userId,
  fallbackName,
  currentUserId,
  friends,
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
      <div className="ct-profile-card-identity">
        <Avatar
          size={64}
          src={card.avatarUrl ?? undefined}
          className="ct-profile-card-avatar"
        >
          {getDisplayInitials(displayName)}
        </Avatar>

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
  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      trigger="click"
      placement="rightTop"
      rootClassName="ct-profile-card-popover"
      content={<UserProfileCard {...cardProps} />}
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
 * Click-to-open wrapper. The card only mounts while it is open, which is what
 * keeps the query from firing for every name in a long backlog.
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
      content={isOpen ? <UserProfileCard {...cardProps} /> : null}
    >
      {children}
    </Popover>
  );
}
