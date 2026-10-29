import { useState } from "react";
import { Alert, Button, Pagination, Select, Spin, Tooltip } from "antd";
import { PageHeader } from "@/ui/page-header";
import { GiftOutlined, ReloadOutlined, WarningOutlined } from "@ant-design/icons";
import { useUiStore } from "@/store/ui-store";
// Deliberately NOT workspace's getApiErrorMessage: the workspace shell imports
// this feature, so importing back out of it would close a cycle that
// check-architecture refuses.
import { toErrorMessage } from "@shared/error-message";
import {
  FREE_GAME_FILTERS,
  SOURCE_LABELS,
  formatFetchedAt,
} from "../free-games-utils";
import { FREE_GAMES_PAGE_SIZES, useFreeGames } from "../use-free-games";
import { FreeGameCard } from "./free-game-card";

const EMPTY_MESSAGES: Record<string, string> = {
  "free-now": "Şu anda ücretsiz verilen bir oyun yok. Kampanyalar genellikle perşembe günleri başlar.",
  "ending-soon": "Önümüzdeki 24 saat içinde sona erecek bir kampanya yok.",
  "free-soon": "Sırada duyurulmuş bir kampanya yok.",
  deals: "Şu anda listelenecek bir indirim bulunamadı.",
  "always-free": "Kalıcı ücretsiz oyun bulunamadı.",
};

/**
 * The grid.
 *
 * Takes no props at all. The shell has no interest in giveaways, and the hook
 * holds a minute clock — owning it up there would have re-rendered the entire
 * workspace once a minute. Both panels read the same react-query cache, so
 * calling the hook twice costs one extra subscription and nothing else.
 */
export function FreeGamesMainPanel() {
  const {
    query,
    visibleOffers,
    pagedOffers,
    filter,
    store,
    setStore,
    storeOptions,
    page,
    setPage,
    pageSize,
    setPageSize,
    nowMs,
    snapshot,
    counts,
    setFilter,
    isRefreshing,
    refresh,
  } = useFreeGames();
  const active = FREE_GAME_FILTERS.find((entry) => entry.id === filter);

  // Odak draws the buckets as tabs over the grid (OdakFirsatlar.dc.html). The
  // cards rise in one after another the first time the grid is drawn; another
  // bucket, store or page only fades its grid in.
  const isOdak = useUiStore((state) => state.odakTheme);
  const gridKey = `${filter}:${store}:${page}`;
  const [firstGridKey] = useState(gridKey);
  const [gridChanged, setGridChanged] = useState(false);
  if (!gridChanged && gridKey !== firstGridKey) {
    setGridChanged(true);
  }

  const result = query.data;
  // The queryFn resolves the DesktopResult envelope instead of throwing, so a
  // failed call arrives as `ok: false` on a successful query. isError only ever
  // means the bridge itself broke.
  const errorMessage =
    query.isError
      ? "Ücretsiz oyun listesi alınamadı."
      : result && !result.ok
        ? toErrorMessage(result.error, "Ücretsiz oyun listesi alınamadı.")
        : null;

  const storeSelect = (
    // Options are scoped to the bucket on screen, so this never offers a
    // store that has nothing in it — and never buries the stores that do
    // under the ~350 free-to-play titles that belong to no store.
    <Select
      value={store}
      onChange={setStore}
      className="ct-free-games-store-select"
      aria-label="Mağazaya göre filtrele"
      options={storeOptions.map((option) => ({
        value: option.value,
        label: `${option.label} (${option.count})`,
      }))}
    />
  );

  return (
    <div className="ct-free-games-panel">
      {isOdak ? (
        <header className="ct-free-games-head">
          <div className="ct-odak-pill">
            <h1>Ücretsiz Oyunlar</h1>
          </div>
          <div className="ct-odak-tabs" role="tablist" aria-label="Kategori">
            {FREE_GAME_FILTERS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={entry.id === filter}
                className={entry.id === filter ? "active" : ""}
                onClick={() => setFilter(entry.id)}
                title={entry.description}
              >
                {entry.label} · {counts[entry.id]}
              </button>
            ))}
          </div>
          {/* At the far end, and still there when a narrow page wraps it
              under the tabs. */}
          <div className="ct-free-games-head-tools">
            {storeSelect}
            {snapshot.failedSources.length > 0 ? (
              <Tooltip
                title={`Şu kaynaklar yanıt vermedi: ${snapshot.failedSources
                  .map((source) => SOURCE_LABELS[source])
                  .join(", ")}. Liste eksik olabilir.`}
              >
                <span className="ct-free-games-head-warning">
                  <WarningOutlined aria-hidden="true" />
                  {snapshot.failedSources.length} kaynak yanıt vermedi
                </span>
              </Tooltip>
            ) : null}
            <span className="ct-free-games-head-updated">
              Güncelleme: {formatFetchedAt(snapshot.fetchedAt, nowMs)}
            </span>
            <button
              type="button"
              className="ct-free-games-head-refresh"
              aria-label="Listeyi yenile"
              title="Listeyi yenile"
              onClick={refresh}
              disabled={isRefreshing}
            >
              <ReloadOutlined aria-hidden="true" />
            </button>
          </div>
        </header>
      ) : (
        <PageHeader
          className="ct-free-games-header"
          title={active?.label ?? "Ücretsiz Oyunlar"}
          description={active?.description}
          actions={
            <>
              {storeSelect}
              <span className="ct-stat-chip">{visibleOffers.length} oyun</span>
            </>
          }
        />
      )}

      {errorMessage ? (
        <Alert type="error" showIcon title={errorMessage} className="ct-alert" />
      ) : null}

      {query.isPending && snapshot.offers.length === 0 && isOdak ? (
        <div className="ct-free-games-grid" aria-busy="true" aria-label="Kampanyalar taranıyor">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="ct-free-game-skeleton" aria-hidden="true" />
          ))}
        </div>
      ) : query.isPending && snapshot.offers.length === 0 ? (
        <div className="ct-free-games-state">
          <Spin />
          <p>Kampanyalar taranıyor…</p>
        </div>
      ) : visibleOffers.length === 0 && !errorMessage ? (
        <div className="ct-free-games-state">
          <GiftOutlined aria-hidden="true" />
          {/* An empty bucket and an empty FILTER are different answers, and
              saying "no giveaways this week" to somebody who narrowed to one
              store is simply wrong. */}
          {store === "all" ? (
            <p>{EMPTY_MESSAGES[filter] ?? "Listelenecek bir şey yok."}</p>
          ) : (
            <>
              <p>Bu mağazada listelenecek bir şey yok.</p>
              <Button size="small" onClick={() => setStore("all")}>
                Tüm mağazaları göster
              </Button>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Only the current page is mounted. The always-free bucket alone is
              ~350 titles, and rendering all of them would put 350 <img> tags
              against third-party CDNs on screen at once. */}
          <div
            key={isOdak ? gridKey : undefined}
            className="ct-free-games-grid"
            data-intro={gridChanged ? undefined : ""}
            aria-busy={isRefreshing}
          >
            {pagedOffers.map((offer, index) => (
              <FreeGameCard key={offer.id} offer={offer} nowMs={nowMs} index={index} />
            ))}
          </div>

          {visibleOffers.length > FREE_GAMES_PAGE_SIZES[0] ? (
            <div className="ct-free-games-pagination">
              <Pagination
                current={page}
                total={visibleOffers.length}
                pageSize={pageSize}
                onChange={(nextPage, nextSize) => {
                  setPage(nextPage);
                  if (nextSize !== pageSize) {
                    setPageSize(nextSize);
                  }
                }}
                pageSizeOptions={FREE_GAMES_PAGE_SIZES.map(String)}
                showSizeChanger
                size="small"
                showTotal={(total, [from, to]) => `${from}-${to} / ${total}`}
              />
            </div>
          ) : null}
        </>
      )}

      {/* GamerPower's terms allow commercial use and ask for a live link back;
          the other two are credited beside it rather than singling one out. */}
      <footer className="ct-free-games-attribution">
        Veriler:{" "}
        <a href="https://www.gamerpower.com" target="_blank" rel="noreferrer noopener">
          GamerPower
        </a>
        ,{" "}
        <a href="https://www.cheapshark.com" target="_blank" rel="noreferrer noopener">
          CheapShark
        </a>
        ,{" "}
        <a href="https://www.freetogame.com" target="_blank" rel="noreferrer noopener">
          FreeToGame
        </a>{" "}
        ve Epic Games Store.
      </footer>
    </div>
  );
}
