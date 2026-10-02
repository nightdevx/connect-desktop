import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Empty, Spin, Switch, Table } from "antd";
import {
  EyeOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  TableOutlined,
} from "@ant-design/icons";
import { toErrorMessage } from "@shared/error-message";
import type { MinigamePlayer, MinigameTableOverview } from "@shared/minigames";
import { MINIGAMES } from "@/features/minigames";
import adminService from "../services/admin-service";
import { AdminPageHeader, AdminSection, AdminState } from "./admin-primitives";
import { toast } from "@/services/toast";

const REFRESH_INTERVAL_MS = 8000;

export default function AdminMinigames() {
  const [tables, setTables] = useState<MinigameTableOverview[]>([]);
  const [disabled, setDisabled] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const result = await adminService.listMinigames();
      setTables(result.tables);
      setDisabled(result.disabledGames);
    } catch (error) {
      toast.error(toErrorMessage(error, "Masalar yüklenemedi"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const setGameEnabled = async (gameId: string, enabled: boolean): Promise<void> => {
    const next = enabled
      ? disabled.filter((id) => id !== gameId)
      : [...new Set([...disabled, gameId])];

    setSavingId(gameId);
    try {
      const settings = await adminService.updateSettings({ disabledMinigames: next });
      setDisabled(settings.disabledMinigames ?? next);
    } catch (error) {
      toast.error(toErrorMessage(error, "Ayar kaydedilemedi"));
    } finally {
      setSavingId(null);
    }
  };

  const activePlayers = useMemo(
    () => new Set(tables.flatMap((table) => table.players.map((p) => p.userId))).size,
    [tables],
  );
  const activeWatchers = useMemo(
    () => tables.reduce((total, table) => total + table.spectators.length, 0),
    [tables],
  );

  const gameLabel = (id: string): string =>
    MINIGAMES.find((entry) => entry.id === id)?.label ?? id;

  return (
    <div className="ct-admin-page">
      <AdminPageHeader
        title="Oyunlar"
        description="Hangi oyunların kullanıcılara görüneceğini seç, açık masaları ve kimlerin oynadığını izle."
        actions={
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>
            Yenile
          </Button>
        }
      />

      <AdminSection
        title="Açık masalar"
        description="Şu anda kurulmuş masalar, oyuncuları ve izleyicileri."
        icon={<TableOutlined />}
        hint={`${tables.length} masa · ${activePlayers} oyuncu · ${activeWatchers} izleyici`}
        flush
      >
        {isLoading && tables.length === 0 ? (
          <div className="ct-admin-minigames-loading">
            <Spin />
          </div>
        ) : (
          <Table<MinigameTableOverview>
            tableLayout="fixed"
            rowKey="id"
            dataSource={tables}
            pagination={false}
            size="small"
            className="ct-admin-table-wrap"
            locale={{
              emptyText: <Empty description="Şu anda açık masa yok" />,
            }}
            columns={[
              {
                title: "Oyun",
                dataIndex: "game",
                width: 160,
                render: (game: string) => <strong>{gameLabel(game)}</strong>,
              },
              {
                title: "Durum",
                key: "state",
                width: 130,
                render: (_, table) =>
                  table.finished ? (
                    <AdminState>Bitti</AdminState>
                  ) : table.started ? (
                    <AdminState tone="ok">Oynanıyor</AdminState>
                  ) : (
                    <AdminState tone="warn">Bekliyor</AdminState>
                  ),
              },
              {
                title: "Oyuncular",
                key: "players",
                ellipsis: true,
                render: (_, table) =>
                  table.players.map((player: MinigamePlayer) => player.username).join(", "),
              },
              {
                title: "İzleyiciler",
                key: "spectators",
                ellipsis: true,
                render: (_, table) =>
                  table.spectators.length === 0 ? (
                    <span className="ct-admin-minigames-none">—</span>
                  ) : (
                    <span className="ct-admin-inline">
                      <EyeOutlined className="ct-admin-muted" />
                      {table.spectators.map((watcher: MinigamePlayer) => watcher.username).join(", ")}
                    </span>
                  ),
              },
              {
                title: "Açılış",
                dataIndex: "createdAt",
                width: 90,
                render: (value: string) => (
                  <span className="ct-admin-muted">
                    {new Date(value).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                ),
              },
            ]}
          />
        )}
      </AdminSection>

      <AdminSection
        title="Oyun görünürlüğü"
        description="Kapalı bir oyun kullanıcıların oyun listesinde görünmez."
        icon={<PlayCircleOutlined />}
        hint={`${MINIGAMES.length - disabled.length}/${MINIGAMES.length} açık`}
        flush
      >
        <ul className="ct-admin-minigames-toggles">
          {MINIGAMES.map((entry) => {
            const isEnabled = !disabled.includes(entry.id);
            return (
              <li key={entry.id} className="ct-settings-row">
                <span className="ct-settings-row-icon" aria-hidden="true">
                  {entry.icon}
                </span>
                <div className="ct-settings-row-text">
                  <strong>{entry.label}</strong>
                  <span>{entry.description}</span>
                </div>
                <Switch
                  checked={isEnabled}
                  loading={savingId === entry.id}
                  onChange={(checked) => void setGameEnabled(entry.id, checked)}
                  aria-label={`${entry.label} görünürlüğü`}
                />
              </li>
            );
          })}
        </ul>
      </AdminSection>
    </div>
  );
}
