import { useMemo, useState } from "react";
import { Button, Select } from "antd";
import type { GuildJoinMode } from "@shared/guild-contracts";
import { MenuIcon } from "@/ui/odak-menu";
import { filterAllGuilds, guildStatus, JOIN_MODE_LABELS, type AllGuildsFilter, type GuildStatus } from "../guild-logic";
import { errorText } from "../guild-service";
import { useGuildUi } from "../guild-store";
import { useAllGuilds } from "../use-guilds";
import { GuildIcon } from "./guild-icon";

const STATUS_LABELS: Record<GuildStatus, string> = { active: "Etkin", suspended: "Askıda", deleted: "Silinmiş" };

const STATUS_OPTIONS = [
  { value: "all", label: "Tümü" },
  ...(Object.keys(STATUS_LABELS) as GuildStatus[]).map((value) => ({ value, label: STATUS_LABELS[value] })),
];

const MODE_OPTIONS = [
  { value: "all", label: "Her katılım" },
  ...(Object.keys(JOIN_MODE_LABELS) as GuildJoinMode[]).map((value) => ({
    value,
    label: JOIN_MODE_LABELS[value].label,
  })),
];

/** Tüm sunucular (platform staff): every server, opened without joining. */
export function AllGuildsList() {
  const { data, isLoading, isError, error } = useAllGuilds();
  const view = useGuildUi((state) => state.view);
  const [filter, setFilter] = useState<AllGuildsFilter>({ query: "", status: "all", joinMode: "all" });
  const rows = useMemo(() => filterAllGuilds(data?.guilds ?? [], filter), [data, filter]);

  return (
    <section className="ct-guild-home-section" aria-labelledby="guild-all-title">
      <div className="ct-guild-home-bar">
        <h3 id="guild-all-title">{data ? `${rows.length} sunucu` : "Sunucular"}</h3>
        <div className="ct-guild-filters">
          <label className="ct-odak-search">
            <MenuIcon name="search" size={15} />
            <input
              type="search"
              value={filter.query}
              onChange={(event) => setFilter({ ...filter, query: event.target.value })}
              placeholder="Sunucu ya da sahip ara"
              aria-label="Sunucu ya da sahip ara"
              maxLength={64}
            />
          </label>
          <Select
            size="middle"
            value={filter.status}
            options={STATUS_OPTIONS}
            onChange={(status) => setFilter({ ...filter, status })}
            aria-label="Duruma göre süz"
            className="ct-guild-filter-select"
          />
          <Select
            size="middle"
            value={filter.joinMode}
            options={MODE_OPTIONS}
            onChange={(joinMode) => setFilter({ ...filter, joinMode })}
            aria-label="Katılım şekline göre süz"
            className="ct-guild-filter-select wide"
          />
        </div>
      </div>
      {isError ? (
        <p className="ct-guild-home-note" role="alert">
          {errorText(error)}
        </p>
      ) : isLoading ? (
        <p className="ct-guild-home-note">Yükleniyor…</p>
      ) : rows.length === 0 ? (
        <p className="ct-guild-home-note">Bu süzgece uyan sunucu yok.</p>
      ) : (
        <ul className="ct-guild-rows">
          {rows.map((guild) => {
            const status = guildStatus(guild);
            return (
              <li key={guild.id} className="ct-guild-row">
                <GuildIcon guild={guild} size={32} />
                <span className="ct-guild-row-text">
                  <strong>{guild.name}</strong>
                  <span>
                    {guild.ownerUsername} · {guild.memberCount} üye · {JOIN_MODE_LABELS[guild.joinMode].label}
                  </span>
                </span>
                {status !== "active" && <span className={"ct-guild-role " + status}>{STATUS_LABELS[status]}</span>}
                {guild.member && <span className="ct-guild-role owner">Üyesin</span>}
                <Button size="small" aria-label={guild.name + ": aç"} onClick={() => view(guild.id)}>
                  Aç
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
