import { Button } from "antd";
import { findInviteCode } from "../guild-logic";
import { showGuild } from "../guild-store";
import { GuildIcon } from "./guild-icon";
import { useInvitePreview, useJoinByInvite } from "./guild-join-dialog";

/**
 * A server invite in a chat message: name, icon, member count and Katıl.
 * Nothing at all when the message carries no code or the code is not valid,
 * so a word that only looks like a code costs one quiet lookup.
 */
export function InviteCard({ body }: { body: string }) {
  const code = findInviteCode(body);
  const preview = useInvitePreview(code);
  const { join, busy } = useJoinByInvite();
  const invite = preview.data?.invite;
  if (!code || !invite) return null;

  return (
    <div className="ct-guild-invite-card" role="group" aria-label={`${invite.name} sunucusuna davet`}>
      <GuildIcon guild={invite} size={44} />
      <span className="ct-guild-preview-text">
        <strong>{invite.name}</strong>
        <span>Sunucu daveti · {invite.memberCount} üye</span>
      </span>
      {invite.isMember ? (
        <Button size="small" onClick={() => showGuild(invite.guildId)}>
          Aç
        </Button>
      ) : (
        <Button size="small" type="primary" loading={busy} onClick={() => void join(code)}>
          Katıl
        </Button>
      )}
    </div>
  );
}
