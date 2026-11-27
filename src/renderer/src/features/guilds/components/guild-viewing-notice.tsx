import { useState } from "react";
import { toast } from "@/services/toast";
import { callGuild, errorText } from "../guild-service";
import { useGuildUi } from "../guild-store";
import { guildStatus } from "../guild-logic";
import { useAllGuilds, useGuildList, useRefreshGuilds } from "../use-guilds";

/**
 * Above the rooms of a server platform staff look at without being in it:
 * what they are doing, and the two ways out (join, or close the view).
 */
export function GuildViewingNotice() {
  const viewingGuildId = useGuildUi((state) => state.viewingGuildId);
  const stopViewing = useGuildUi((state) => state.stopViewing);
  const selectGuild = useGuildUi((state) => state.selectGuild);
  const mine = useGuildList().data?.guilds;
  const refresh = useRefreshGuilds();
  const viewed = useAllGuilds(Boolean(viewingGuildId)).data?.guilds.find((guild) => guild.id === viewingGuildId);
  const status = viewed ? guildStatus(viewed) : "active";
  const [busy, setBusy] = useState(false);
  if (!viewingGuildId || !mine || mine.some((guild) => guild.id === viewingGuildId)) return null;

  const join = async (): Promise<void> => {
    setBusy(true);
    try {
      try {
        await callGuild("adminJoin", { guildId: viewingGuildId });
      } catch (failure) {
        // Already in it (the list was stale): fine.
        if (!(failure instanceof Error && "code" in failure && failure.code === "ALREADY_MEMBER")) throw failure;
      }
      await refresh();
      selectGuild(viewingGuildId);
    } catch (failure) {
      toast.error(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ct-guild-viewing" role="status">
      <p>
        Bu sunucuya üye değilsin, görünmez bakıyorsun.
        {status === "suspended" && " Sunucu askıda."}
        {status === "deleted" && " Sunucu silinmiş."}
      </p>
      {status !== "deleted" && (
        <button type="button" disabled={busy} aria-label="Bu sunucuya üye ol" onClick={() => void join()}>
          Katıl
        </button>
      )}
      <button type="button" aria-label="Görüntülemeyi kapat" onClick={stopViewing}>
        Kapat
      </button>
    </div>
  );
}
