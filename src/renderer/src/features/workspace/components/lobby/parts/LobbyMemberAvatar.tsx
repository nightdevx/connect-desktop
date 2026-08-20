import { Avatar } from "antd";
import { useIsSpeaking } from "@/features/livekit";
import { getDisplayInitials } from "../../../workspace-utils";

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
 */
export function LobbyMemberAvatar({
  userId,
  username,
  avatarUrl,
}: LobbyMemberAvatarProps) {
  const isSpeaking = useIsSpeaking(userId);

  return (
    <Avatar
      size={22}
      src={avatarUrl}
      className={`ct-lobby-member-avatar ${isSpeaking ? "speaking" : ""}`}
    >
      {getDisplayInitials(username)}
    </Avatar>
  );
}
