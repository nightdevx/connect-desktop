import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Empty, Space, Spin, Switch, Table, Tag, message } from "antd";
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
import { AdminPageHeader, AdminSection } from "./admin-primitives";

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
      message.error(toErrorMessage(error, "Masalar yüklenemedi"));
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
      message.error(toErrorMessage(error, "Ayar kaydedilemedi"));
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
            rowKey="id"
            dataSource={tables}
            pagination={false}
            size="small"
            locale={{
              emptyText: <Empty description="Şu anda açık masa yok" />,
            }}
            columns={[
              {
                title: "Oyun",
                dataIndex: "game",
                render: (game: string) => gameLabel(game),
              },
              {
                title: "Durum",
                key: "state",
                render: (_, table) =>
                  table.finished ? (
                    <Tag>bitti</Tag>
                  ) : table.started ? (
                    <Tag color="green">oynanıyor</Tag>
                  ) : (
                    <Tag color="gold">bekliyor</Tag>
                  ),
              },
              {
                title: "Oyuncular",
                key: "players",
                render: (_, table) => (
                  <Space size={4} wrap>
                    {table.players.map((player: MinigamePlayer) => (
                      <Tag key={player.userId} icon={<PlayCircleOutlined />}>
                        {player.username}
                      </Tag>
                    ))}
                  </Space>
                ),
              },
              {
                title: "İzleyiciler",
                key: "spectators",
                render: (_, table) =>
                  table.spectators.length === 0 ? (
                    <span className="ct-admin-minigames-none">—</span>
                  ) : (
                    <Space size={4} wrap>
                      {table.spectators.map((watcher: MinigamePlayer) => (
                        <Tag key={watcher.userId} icon={<EyeOutlined />} color="blue">
                          {watcher.username}
                        </Tag>
                      ))}
                    </Space>
                  ),
              },
              {
                title: "Açılış",
                dataIndex: "createdAt",
                render: (value: string) => new Date(value).toLocaleTimeString("tr-TR"),
              },
            ]}
          />
        )}
      </AdminSection>

      <AdminSection
        title="Oyun görünürlüğü"
        icon={<PlayCircleOutlined />}
        hint={`${MINIGAMES.length - disabled.length}/${MINIGAMES.length} açık`}
      >
        <ul className="ct-admin-minigames-toggles">
          {MINIGAMES.map((entry) => {
            const isEnabled = !disabled.includes(entry.id);
            return (
              <li key={entry.id} className="ct-admin-minigames-toggle">
                <span className="ct-admin-minigames-icon" aria-hidden="true">
                  {entry.icon}
                </span>
                <span className="ct-admin-minigames-label">
                  <strong>{entry.label}</strong>
                  <span>{entry.description}</span>
                </span>
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
