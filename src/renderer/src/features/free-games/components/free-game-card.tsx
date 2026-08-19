import { memo, useState } from "react";
import { Tooltip } from "antd";
import {
  ClockCircleOutlined,
  ExportOutlined,
  GiftOutlined,
  TagOutlined,
} from "@ant-design/icons";
import type { FreeGameOffer } from "@shared/free-games";
import { formatRemaining, formatStartsIn } from "../free-games-utils";

interface FreeGameCardProps {
  offer: FreeGameOffer;
  /** Shared minute clock, so every card on the page ticks in step. */
  nowMs: number;
}

// Under this much time left the countdown turns urgent.
const URGENT_WINDOW_MS = 24 * 60 * 60 * 1000;

const isUrgent = (offer: FreeGameOffer, nowMs: number): boolean => {
  if (!offer.endsAt) {
    return false;
  }
  const end = Date.parse(offer.endsAt);
  return Number.isFinite(end) && end - nowMs <= URGENT_WINDOW_MS;
};

function FreeGameCardImpl({ offer, nowMs }: FreeGameCardProps) {
  // Artwork comes from four third-party CDNs and any one of them can 404 or be
  // blocked. Falling back to the gradient is what keeps a dead image from
  // leaving a torn box where the cover should be.
  const [imageFailed, setImageFailed] = useState(false);

  const remaining =
    offer.kind === "free-soon"
      ? formatStartsIn(offer.startsAt, nowMs)
      : formatRemaining(offer.endsAt, nowMs);

  const urgent = offer.kind === "free-now" && isUrgent(offer, nowMs);
  const showImage = Boolean(offer.imageUrl) && !imageFailed;

  return (
    <article className={`ct-free-game-card ${offer.kind}`}>
      <div className="ct-free-game-cover">
        {showImage ? (
          <img
            src={offer.imageUrl ?? undefined}
            alt=""
            loading="lazy"
            draggable={false}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span className="ct-free-game-cover-fallback" aria-hidden="true">
            <GiftOutlined />
          </span>
        )}

        <span className="ct-free-game-store">{offer.storeLabel}</span>

        {offer.kind === "deal" && offer.discountPercent !== null ? (
          <span className="ct-free-game-discount">-%{offer.discountPercent}</span>
        ) : null}
      </div>

      <div className="ct-free-game-body">
        <Tooltip title={offer.title} placement="top">
          <h4 className="ct-free-game-title">{offer.title}</h4>
        </Tooltip>

        {offer.description ? (
          <p className="ct-free-game-description">{offer.description}</p>
        ) : null}

        <div className="ct-free-game-meta">
          {/* A discount shows what it costs NOW, with the old price struck out
              beside it. It used to show only the original, next to a tag icon,
              which read as the asking price — the one number a bargain card
              must not get wrong.

              A giveaway has no current price to print: the card already says it
              is free, so the original is struck out on its own. */}
          {offer.salePrice ? (
            <span className="ct-free-game-price">
              <TagOutlined aria-hidden="true" />
              {offer.salePrice}
              {offer.originalPrice ? (
                <s className="ct-free-game-price-was">{offer.originalPrice}</s>
              ) : null}
            </span>
          ) : offer.originalPrice ? (
            <span className="ct-free-game-price struck">{offer.originalPrice}</span>
          ) : null}

          {remaining ? (
            <span className={`ct-free-game-remaining ${urgent ? "urgent" : ""}`}>
              <ClockCircleOutlined aria-hidden="true" />
              {offer.kind === "free-soon" ? `${remaining} sonra` : `${remaining} kaldı`}
            </span>
          ) : null}
        </div>

        {/* A plain anchor, not an IPC call: the window-open handler already
            routes http(s) to the OS browser and denies everything else, which
            is the same path chat links take. */}
        <a
          className="ct-free-game-action"
          href={offer.url}
          target="_blank"
          rel="noreferrer noopener"
          title={offer.url}
        >
          {offer.kind === "free-soon" ? "Mağazada Gör" : "Mağazada Aç"}
          <ExportOutlined aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}

/**
 * Memoised on the offer, and on the clock only when the card reads it.
 *
 * The grid shares one minute clock, so a plain `memo` would be worthless — the
 * tick changes a prop on every card at once. A card with no dates on it renders
 * nothing that the clock can change, so it opts out of the tick entirely; the
 * "Kalıcı ücretsiz" bucket is 60 such cards.
 */
export const FreeGameCard = memo(FreeGameCardImpl, (previous, next) => {
  if (previous.offer !== next.offer) {
    return false;
  }

  const readsClock =
    next.offer.endsAt !== null || next.offer.startsAt !== null;
  return !readsClock || previous.nowMs === next.nowMs;
});
