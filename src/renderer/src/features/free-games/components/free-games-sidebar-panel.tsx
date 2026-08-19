import { Button, Tooltip } from "antd";
import { ReloadOutlined, WarningOutlined } from "@ant-design/icons";
import { FREE_GAME_FILTERS, SOURCE_LABELS, formatFetchedAt } from "../free-games-utils";
import { useFreeGames } from "../use-free-games";

/**
 * The bucket list, its counts, and the state of the last fetch.
 *
 * Shaped like SettingsSidebarTabs on purpose: a vertical list of labelled tabs
 * with a description, driven by one value in the ui store. Nothing here knows
 * how the offers were obtained.
 *
 * Reads the controller itself rather than taking it as a prop. The hook holds
 * a minute clock, and owning it in the shell would have re-rendered the whole
 * workspace once a minute for a countdown that is drawn in two panels.
 */
export function FreeGamesSidebarPanel() {
  const { counts, filter, setFilter, snapshot, isRefreshing, refresh, nowMs } =
    useFreeGames();

  return (
    <div className="ct-free-games-sidebar">
      <nav
        className="ct-free-games-tabs"
        role="tablist"
        aria-label="Ücretsiz oyun kategorileri"
      >
        {FREE_GAME_FILTERS.map((entry) => {
          const count = counts[entry.id];
          const isActive = filter === entry.id;

          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`ct-free-games-tab ${isActive ? "active" : ""}`}
              onClick={() => setFilter(entry.id)}
            >
              <span className="ct-free-games-tab-head">
                <span className="ct-free-games-tab-label">{entry.label}</span>
                {/* Zero is drawn as a dash rather than hidden: an empty bucket is
                    an answer, and a vanishing badge reads as a loading state. */}
                <span className="ct-free-games-tab-count">{count > 0 ? count : "–"}</span>
              </span>
              <span className="ct-free-games-tab-description">{entry.description}</span>
            </button>
          );
        })}
      </nav>

      <div className="ct-free-games-sidebar-footer">
        {snapshot.failedSources.length > 0 ? (
          <Tooltip
            title={`Şu kaynaklar yanıt vermedi: ${snapshot.failedSources
              .map((source) => SOURCE_LABELS[source])
              .join(", ")}. Liste eksik olabilir.`}
          >
            <p className="ct-free-games-warning">
              <WarningOutlined aria-hidden="true" />
              {snapshot.failedSources.length} kaynak yanıt vermedi
            </p>
          </Tooltip>
        ) : null}

        <p className="ct-free-games-updated">
          Güncelleme: {formatFetchedAt(snapshot.fetchedAt, nowMs)}
        </p>

        <Button
          block
          icon={<ReloadOutlined />}
          onClick={refresh}
          loading={isRefreshing}
        >
          Yenile
        </Button>
      </div>
    </div>
  );
}
