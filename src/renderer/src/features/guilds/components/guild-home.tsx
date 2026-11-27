import { useEffect, useState } from "react";
import { Button } from "antd";
import { useQuery } from "@tanstack/react-query";
import type { GuildDiscoverEntry } from "@shared/guild-contracts";
import { PageHeader } from "@/ui/page-header";
import { MenuIcon } from "@/ui/odak-menu";
import { toast } from "@/services/toast";
import { daysLeft } from "../guild-logic";
import { callGuild, errorText } from "../guild-service";
import { showGuild, useGuildUi } from "../guild-store";
import { useGuildList, useRefreshGuilds } from "../use-guilds";
import { AllGuildsList } from "./all-guilds";
import { GuildIcon } from "./guild-icon";

/** Runs one server action with a busy key, a toast on failure, and a list refresh. */
const useGuildAction = () => {
  const refresh = useRefreshGuilds();
  const [busyId, setBusyId] = useState<string | null>(null);
  const run = async (id: string, action: () => Promise<string | void>): Promise<void> => {
    setBusyId(id);
    try {
      const done = await action();
      await refresh();
      if (done) toast.success(done);
    } catch (failure) {
      toast.error(errorText(failure));
    } finally {
      setBusyId(null);
    }
  };
  return { run, busyId };
};

function DiscoverCard({
  entry,
  isMember,
  isRequested,
  busy,
  onJoin,
  onCancel,
}: {
  entry: GuildDiscoverEntry;
  isMember: boolean;
  isRequested: boolean;
  busy: boolean;
  onJoin: () => void;
  onCancel: () => void;
}) {
  return (
    <li className="ct-guild-card ct-odak-card">
      <GuildIcon guild={entry} size={48} />
      <div className="ct-guild-card-text">
        <strong>{entry.name}</strong>
        <span className="ct-guild-card-meta">
          {entry.memberCount} üye{entry.joinMode === "request" ? " · istekle" : ""}
        </span>
        {entry.description && <p>{entry.description}</p>}
      </div>
      <div className="ct-guild-card-action">
        {isMember ? (
          <Button size="small" onClick={() => showGuild(entry.id)}>
            Aç
          </Button>
        ) : isRequested ? (
          <Button size="small" loading={busy} onClick={onCancel}>
            İsteği geri çek
          </Button>
        ) : (
          <Button size="small" type="primary" loading={busy} onClick={onJoin}>
            {entry.joinMode === "request" ? "İstek gönder" : "Katıl"}
          </Button>
        )}
      </div>
    </li>
  );
}

/** Keşfet: public servers, searchable. */
function DiscoverList() {
  const list = useGuildList().data;
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const { run, busyId } = useGuildAction();
  // The endpoint is rate limited: ask once typing stops.
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);
  const discover = useQuery({
    queryKey: ["guild-discover", query],
    queryFn: () => callGuild("discover", { q: query }),
    staleTime: 30_000,
  });
  const memberOf = new Set(list?.guilds.map((guild) => guild.id));
  const requested = new Set(list?.requests.map((entry) => entry.id));
  const entries = discover.data?.guilds ?? [];

  const join = (entry: GuildDiscoverEntry) =>
    run(entry.id, async () => {
      const { joined } = await callGuild("join", { guildId: entry.id });
      if (joined) {
        showGuild(entry.id);
        return `${entry.name} sunucusuna katıldın`;
      }
      return "İstek gönderildi. Bir moderatör onaylayınca katılırsın.";
    });
  const cancel = (entry: GuildDiscoverEntry) =>
    run(entry.id, async () => {
      await callGuild("cancelRequest", { guildId: entry.id });
      return "İstek geri çekildi";
    });

  return (
    <section className="ct-guild-home-section" aria-labelledby="guild-discover-title">
      <div className="ct-guild-home-bar">
        <h3 id="guild-discover-title">Açık sunucular</h3>
        <label className="ct-odak-search">
          <MenuIcon name="search" size={15} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Sunucu ara"
            aria-label="Sunucu ara"
            maxLength={64}
          />
        </label>
      </div>
      {discover.isError ? (
        <p className="ct-guild-home-note" role="alert">
          {errorText(discover.error)}
        </p>
      ) : discover.isLoading ? (
        <p className="ct-guild-home-note">Yükleniyor…</p>
      ) : entries.length === 0 ? (
        <p className="ct-guild-home-note">
          {query ? `“${query}” ile eşleşen açık sunucu yok.` : "Şu an listelenen açık sunucu yok."}
        </p>
      ) : (
        <ul className="ct-guild-grid">
          {entries.map((entry) => (
            <DiscoverCard
              key={entry.id}
              entry={entry}
              isMember={memberOf.has(entry.id)}
              isRequested={requested.has(entry.id)}
              busy={busyId === entry.id}
              onJoin={() => void join(entry)}
              onCancel={() => void cancel(entry)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Join requests still waiting, and deleted servers that can come back. */
function PendingLists() {
  const list = useGuildList().data;
  const { run, busyId } = useGuildAction();
  const requests = list?.requests ?? [];
  const deleted = list?.deleted ?? [];
  if (requests.length === 0 && deleted.length === 0) return null;

  return (
    <>
      {requests.length > 0 && (
        <section className="ct-guild-home-section" aria-labelledby="guild-requests-title">
          <h3 id="guild-requests-title">Bekleyen isteklerin</h3>
          <ul className="ct-guild-rows">
            {requests.map((entry) => (
              <li key={entry.id} className="ct-guild-row">
                <GuildIcon guild={entry} size={32} />
                <span className="ct-guild-row-text">
                  <strong>{entry.name}</strong>
                  <span>Bir moderatörün onayını bekliyor</span>
                </span>
                <Button
                  size="small"
                  loading={busyId === entry.id}
                  onClick={() =>
                    void run(entry.id, async () => {
                      await callGuild("cancelRequest", { guildId: entry.id });
                      return "İstek geri çekildi";
                    })
                  }
                >
                  Geri çek
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {deleted.length > 0 && (
        <section className="ct-guild-home-section" aria-labelledby="guild-deleted-title">
          <h3 id="guild-deleted-title">Silinen sunucuların</h3>
          <ul className="ct-guild-rows">
            {deleted.map((guild) => (
              <li key={guild.id} className="ct-guild-row">
                <GuildIcon guild={guild} size={32} />
                <span className="ct-guild-row-text">
                  <strong>{guild.name}</strong>
                  <span>{daysLeft(guild.deletedAt)} gün içinde geri yükleyebilirsin</span>
                </span>
                <Button
                  size="small"
                  loading={busyId === guild.id}
                  onClick={() =>
                    void run(guild.id, async () => {
                      await callGuild("restore", { guildId: guild.id });
                      showGuild(guild.id);
                      return `${guild.name} geri yüklendi`;
                    })
                  }
                >
                  Geri yükle
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/**
 * Where the rooms would be when there are none to show: the first-run empty
 * state (no servers yet) with Kur / Katıl / Keşfet, or Keşfet itself.
 */
export function GuildHome({ empty }: { empty: boolean }) {
  const discovering = useGuildUi((state) => state.discovering);
  const openDialog = useGuildUi((state) => state.openDialog);
  const openDiscover = useGuildUi((state) => state.openDiscover);
  const closeDiscover = useGuildUi((state) => state.closeDiscover);
  const browsingAll = useGuildUi((state) => state.browsingAll);
  const closeAllGuilds = useGuildUi((state) => state.closeAllGuilds);

  return (
    <main className="ct-main-panel ct-guild-home">
      <div className="ct-guild-home-inner">
        {browsingAll ? (
          <PageHeader
            title="Tüm sunucular"
            description="Platformdaki bütün sunucular. Aç dersen üye olmadan görünmez bakarsın."
            actions={
              <Button onClick={closeAllGuilds} icon={<MenuIcon name="x" size={15} />}>
                Kapat
              </Button>
            }
          />
        ) : discovering ? (
          <PageHeader
            title="Keşfet"
            description="Herkese açık sunucular. Hemen katıl ya da istek gönder."
            actions={
              !empty && (
                <Button onClick={closeDiscover} icon={<MenuIcon name="x" size={15} />}>
                  Kapat
                </Button>
              )
            }
          />
        ) : (
          <div className="ct-guild-empty">
            <h2>Henüz bir sunucuda değilsin</h2>
            <p>Arkadaşlarınla kendi sunucunu kur, bir davet koduyla katıl ya da açık sunuculara göz at.</p>
            <div className="ct-guild-empty-actions">
              <button type="button" className="ct-odak-primary" onClick={() => openDialog({ kind: "create" })}>
                <MenuIcon name="plus" size={16} stroke={2.2} />
                Sunucu kur
              </button>
              <button type="button" className="ct-odak-secondary" onClick={() => openDialog({ kind: "join" })}>
                <MenuIcon name="login" size={16} />
                Kodla katıl
              </button>
              <button type="button" className="ct-odak-secondary" onClick={openDiscover}>
                <MenuIcon name="search" size={16} />
                Keşfet
              </button>
            </div>
          </div>
        )}
        {!browsingAll && <PendingLists />}
        {browsingAll ? <AllGuildsList /> : discovering && <DiscoverList />}
      </div>
    </main>
  );
}
