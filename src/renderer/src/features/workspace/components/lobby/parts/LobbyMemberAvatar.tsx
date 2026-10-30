import { useIsSpeaking } from "@/features/livekit";
import { Avatar } from "../../odak/odak-parts";

interface LobbyMemberAvatarProps {
  userId: string;
  username: string;
  avatarUrl?: string | null;
}

/**
 * A roster face, with the green ring while its owner is talking.
 *
 * Its own component purely so the subscription can be. Speaking flips several
 * times a second, and reading the store from the panel would re-render the
 * whole lobby list — every row, its dropdown and its popover — on every
 * syllable. Here the only thing that re-renders is the 22px circle that
 * actually changes.
 *
 * The plain Odak face, not antd's Avatar: antd measures the initials after
 * mount to scale them, which forced style and layout inside the click that
 * opens Lobiler (F7.5). The size and type come from the stylesheet.
 */
export function LobbyMemberAvatar({
  userId,
  username,
  avatarUrl,
}: LobbyMemberAvatarProps) {
  const isSpeaking = useIsSpeaking(userId);

  return (
    <Avatar
      userId={userId}
      name={username}
      avatarUrl={avatarUrl}
      className={`ct-lobby-member-avatar ${isSpeaking ? "speaking" : ""}`}
    />
  );
}
