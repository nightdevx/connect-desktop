import type { CSSProperties } from "react";
import type {
  MinigamePokerCard,
  MinigameRummyTile,
  MinigameUnoCard,
} from "@shared/minigames";

/**
 * The physical objects: playing cards, okey tiles, uno cards, dice and chips.
 *
 * One module for all of them because they are all the same problem -- an object
 * with a MATERIAL and a SYMBOL -- and solving it five times is how five games
 * end up with five different ideas of what a card looks like.
 *
 * The split is deliberate and it is the whole design:
 *
 *   MATERIAL is CSS. Card stock, ivory, felt, clay: bevels, inner shadows,
 *            specular highlights, grain, drop shadows. It lives in
 *            minigames.css next to everything else that is presentation.
 *   SYMBOL   is inline SVG, here. Suits, court panels, numerals, pips.
 *
 * No image files, and that is a decision rather than a limit: the CSP does
 * allow bundled art (`img-src 'self'`), so swapping a procedural material for a
 * photographic one later is one custom property per surface -- `--card-face:
 * url(...)` -- and touches nothing in this file. Vector today means the symbols
 * are sharp at every size the board is ever laid out at, which a 10x16 uno hand
 * and a 5-card poker board genuinely need.
 *
 * Everything here is presentation and holds no rules: a card does not know
 * whether it is playable.
 */

// --- playing cards -----------------------------------------------------------

const SUIT_LABELS: Record<string, string> = {
  s: "Maça",
  h: "Kupa",
  d: "Karo",
  c: "Sinek",
};

const RANK_LABELS: Record<number, string> = {
  11: "V",
  12: "K",
  13: "P",
  14: "A",
};

/**
 * Where the pips go on a numbered card, as fractions of the face.
 *
 * The real layout, not a grid: a seven has its odd pip at the top-centre and a
 * ten has two, and a card that lays them out evenly reads as a spreadsheet.
 * Mirrored vertically -- the bottom half is the top half upside down -- which
 * is what makes the y values below only ever go up to 0.5.
 */
const PIP_LAYOUT: Record<number, [number, number][]> = {
  2: [[0.5, 0.16]],
  3: [
    [0.5, 0.16],
    [0.5, 0.5],
  ],
  4: [
    [0.28, 0.16],
    [0.72, 0.16],
  ],
  5: [
    [0.28, 0.16],
    [0.72, 0.16],
    [0.5, 0.5],
  ],
  6: [
    [0.28, 0.16],
    [0.72, 0.16],
    [0.28, 0.5],
    [0.72, 0.5],
  ],
  7: [
    [0.28, 0.16],
    [0.72, 0.16],
    [0.28, 0.5],
    [0.72, 0.5],
    [0.5, 0.33],
  ],
  8: [
    [0.28, 0.16],
    [0.72, 0.16],
    [0.28, 0.5],
    [0.72, 0.5],
    [0.5, 0.33],
    [0.5, 0.67],
  ],
  9: [
    [0.28, 0.16],
    [0.72, 0.16],
    [0.28, 0.39],
    [0.72, 0.39],
    [0.5, 0.5],
  ],
  10: [
    [0.28, 0.16],
    [0.72, 0.16],
    [0.28, 0.39],
    [0.72, 0.39],
    [0.5, 0.28],
    [0.5, 0.72],
  ],
};

/** The four suits, as paths on a 100x100 box. */
function SuitGlyph({ suit }: { suit: string }) {
  switch (suit) {
    case "h":
      return (
        <path d="M50 88C22 68 8 52 8 34 8 20 19 10 32 10c8 0 15 4 18 10 3-6 10-10 18-10 13 0 24 10 24 24 0 18-14 34-42 54z" />
      );
    case "d":
      return <path d="M50 6 88 50 50 94 12 50z" />;
    case "c":
      return (
        <path d="M50 6c11 0 20 9 20 20 0 4-1 8-3 11 4-3 8-4 13-4 11 0 20 9 20 20s-9 20-20 20c-8 0-15-4-18-11 1 12 5 20 11 26H27c6-6 10-14 11-26-3 7-10 11-18 11C9 73 0 64 0 53s9-20 20-20c5 0 9 1 13 4-2-3-3-7-3-11 0-11 9-20 20-20z" />
      );
    default:
      return (
        <path d="M50 6c14 18 42 34 42 54 0 12-9 21-20 21-7 0-13-3-17-9 2 13 7 21 13 26H32c6-5 11-13 13-26-4 6-10 9-17 9C17 81 8 72 8 60 8 40 36 24 50 6z" />
      );
  }
}

/**
 * A court card's centre panel.
 *
 * Not a portrait -- a portrait means twelve pieces of artwork, and at the size
 * a four-handed poker board draws a card it would be a smudge. A framed monogram
 * over a lattice reads as a court card at every size, which is the job.
 */
function CourtPanel({ rank, suit }: { rank: number; suit: string }) {
  return (
    <g>
      <rect
        className="ct-card-court-frame"
        x="18"
        y="26"
        width="64"
        height="88"
        rx="4"
      />
      <rect
        className="ct-card-court-fill"
        x="22"
        y="30"
        width="56"
        height="80"
        rx="2"
      />
      <text className="ct-card-court-letter" x="50" y="80" textAnchor="middle">
        {RANK_LABELS[rank]}
      </text>
      <svg x="38" y="84" width="24" height="24" viewBox="0 0 100 100">
        <g className="ct-card-suit">
          <SuitGlyph suit={suit} />
        </g>
      </svg>
    </g>
  );
}

export interface PlayingCardProps {
  card: MinigamePokerCard;
  /** Drawn face-down. The face is not rendered at all, so it cannot be read. */
  facedown?: boolean;
  /** Dimmed, for a folded hand or a card already spent. */
  muted?: boolean;
  className?: string;
}

/**
 * One playing card.
 *
 * A face-down card renders NO face -- the element simply is not there. Hiding
 * it with CSS would put the rank in the DOM of a card the player is not allowed
 * to see, and this is a game where somebody will open the inspector.
 */
export function PlayingCard({ card, facedown, muted, className }: PlayingCardProps) {
  const red = card.suit === "h" || card.suit === "d";
  const label = `${RANK_LABELS[card.rank] ?? card.rank} ${SUIT_LABELS[card.suit] ?? ""}`;

  if (facedown) {
    return (
      <span
        className={`ct-card ct-card-back ${className ?? ""}`}
        role="img"
        aria-label="Kapalı kart"
      >
        <span className="ct-card-back-pattern" aria-hidden="true" />
      </span>
    );
  }

  const pips = PIP_LAYOUT[card.rank];

  return (
    <span
      className={`ct-card ${className ?? ""}`}
      data-suit={card.suit}
      data-red={red ? "true" : undefined}
      data-muted={muted ? "true" : undefined}
      role="img"
      aria-label={label}
    >
      <svg className="ct-card-face" viewBox="0 0 100 140" aria-hidden="true">
        {/* Corner indices, top-left and bottom-right rotated. Both corners so a
            fanned hand can be read from either end, which is what corners are
            for on a real deck. */}
        <g className="ct-card-index">
          <text x="9" y="21" textAnchor="middle">
            {RANK_LABELS[card.rank] ?? card.rank}
          </text>
          <svg x="3" y="24" width="12" height="12" viewBox="0 0 100 100">
            <g className="ct-card-suit">
              <SuitGlyph suit={card.suit} />
            </g>
          </svg>
        </g>
        <g className="ct-card-index" transform="rotate(180 50 70)">
          <text x="9" y="21" textAnchor="middle">
            {RANK_LABELS[card.rank] ?? card.rank}
          </text>
          <svg x="3" y="24" width="12" height="12" viewBox="0 0 100 100">
            <g className="ct-card-suit">
              <SuitGlyph suit={card.suit} />
            </g>
          </svg>
        </g>

        {card.rank === 14 ? (
          // The ace gets one big pip, which is what an ace is.
          <svg x="26" y="42" width="48" height="48" viewBox="0 0 100 100">
            <g className="ct-card-suit">
              <SuitGlyph suit={card.suit} />
            </g>
          </svg>
        ) : card.rank >= 11 ? (
          <CourtPanel rank={card.rank} suit={card.suit} />
        ) : (
          pips?.map(([x, y], index) => (
            // Each entry is drawn twice -- once as given, once mirrored through
            // the centre -- except a pip already on the centre line, which would
            // otherwise be drawn on top of itself.
            <g key={index}>
              <Pip x={x} y={y} suit={card.suit} />
              {y === 0.5 ? null : <Pip x={x} y={1 - y} suit={card.suit} flipped />}
            </g>
          ))
        )}
      </svg>
    </span>
  );
}

function Pip({
  x,
  y,
  suit,
  flipped,
}: {
  x: number;
  y: number;
  suit: string;
  flipped?: boolean;
}) {
  const size = 17;
  const left = x * 100 - size / 2;
  const top = y * 140 - size / 2;

  return (
    <svg
      x={left}
      y={top}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      // The bottom half of a real card is the top half turned round, pips
      // included. Upright, a nine looks like a printing error.
      transform={flipped ? `rotate(180 ${left + size / 2} ${top + size / 2})` : undefined}
    >
      <g className="ct-card-suit">
        <SuitGlyph suit={suit} />
      </g>
    </svg>
  );
}

// --- uno ---------------------------------------------------------------------

const UNO_COLOR_NAMES: Record<string, string> = {
  r: "Kırmızı",
  y: "Sarı",
  g: "Yeşil",
  b: "Mavi",
  w: "Joker",
};

/** The action cards' glyphs, drawn rather than typed as text. */
function UnoGlyph({ kind }: { kind: string }) {
  switch (kind) {
    case "skip":
      return (
        <g className="ct-uno-glyph">
          <circle cx="50" cy="50" r="30" fill="none" strokeWidth="10" />
          <line x1="28" y1="28" x2="72" y2="72" strokeWidth="10" strokeLinecap="round" />
        </g>
      );
    case "reverse":
      return (
        <g className="ct-uno-glyph">
          <path
            d="M28 34h30l-9-9M72 66H42l9 9"
            fill="none"
            strokeWidth="9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M58 34 44 20v28zM42 66l14 14V52z" />
        </g>
      );
    case "draw2":
      return (
        <g className="ct-uno-cards">
          <rect x="18" y="22" width="36" height="56" rx="5" transform="rotate(-12 36 50)" />
          <rect x="46" y="22" width="36" height="56" rx="5" transform="rotate(12 64 50)" />
        </g>
      );
    case "wild4":
      return (
        <g className="ct-uno-cards">
          <rect x="16" y="12" width="33" height="37" rx="4" data-wedge="r" />
          <rect x="51" y="12" width="33" height="37" rx="4" data-wedge="y" />
          <rect x="16" y="51" width="33" height="37" rx="4" data-wedge="g" />
          <rect x="51" y="51" width="33" height="37" rx="4" data-wedge="b" />
        </g>
      );
    case "wild":
      return (
        <g className="ct-uno-wedges">
          <path d="M50 50 12 12h38z" data-wedge="r" />
          <path d="M50 50 88 12V50z" data-wedge="y" />
          <path d="M50 50 88 88H50z" data-wedge="g" />
          <path d="M50 50 12 88V50z" data-wedge="b" />
        </g>
      );
    default:
      return null;
  }
}

export interface UnoCardArtProps {
  card: MinigameUnoCard;
  facedown?: boolean;
  className?: string;
}

/**
 * One card of the shedding deck: the slanted white oval, the thick white border
 * and a numeral with a heavy outline.
 *
 * All three are geometry rather than artwork, and that is also the legal
 * position: the layout of a card is drawn here from scratch, no retail deck's
 * artwork is copied, and no wordmark appears anywhere on it. The game is listed
 * under its own name (see minigames-catalog.tsx).
 */
export function UnoCardArt({ card, facedown, className }: UnoCardArtProps) {
  return (
    <span
      className={`ct-uno-card ${facedown ? "ct-uno-card-back " : ""}${className ?? ""}`}
      data-color={facedown ? undefined : card.color}
      data-kind={facedown ? undefined : card.kind}
      role="img"
      aria-label={
        facedown ? "Kapalı kart" : `${UNO_COLOR_NAMES[card.color] ?? ""} ${card.kind}`
      }
    >
      <svg viewBox="0 0 100 150" aria-hidden="true">
        <UnoCardFace card={card} facedown={facedown} />
      </svg>
    </span>
  );
}

export function UnoCardFace({ card, facedown }: UnoCardArtProps) {
  const sheenId = facedown ? "uno-sheen-back" : `uno-sheen-${card.color}-${card.kind}`;
  const isNumber = !facedown && /^\d$/.test(card.kind);

  return (
    <>
      <defs>
        <linearGradient id={sheenId} x1="0.1" y1="0" x2="0.75" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.3" />
          <stop offset="0.42" stopColor="#ffffff" stopOpacity="0.06" />
          <stop offset="0.66" stopColor="#000000" stopOpacity="0.03" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.24" />
        </linearGradient>
      </defs>

      <rect className="ct-uno-shell" x="0" y="0" width="100" height="150" rx="10" ry="10" />
      <rect className="ct-uno-body" x="6" y="6" width="88" height="138" rx="7" ry="7" />
      <rect x="6" y="6" width="88" height="138" rx="7" ry="7" fill={`url(#${sheenId})`} />
      <rect className="ct-uno-keyline" x="6" y="6" width="88" height="138" rx="7" ry="7" />

      <ellipse className="ct-uno-oval" cx="50" cy="75" rx="44" ry="27" />

      {facedown ? (
        // The back carries our own mark -- the four-colour pinwheel the wild
        // card already uses -- and not a wordmark. The retail deck's name and
        // the lettering on its back are somebody's trademark; the rules of a
        // shedding game are not.
        <g className="ct-uno-backmark">
          <svg x="26" y="51" width="48" height="48" viewBox="0 0 100 100">
            <UnoGlyph kind="wild" />
          </svg>
        </g>
      ) : (
        <>
          {isNumber ? (
            <text className="ct-uno-numeral" x="50" y="100" textAnchor="middle">
              {card.kind}
            </text>
          ) : (
            <svg x="20" y="45" width="60" height="60" viewBox="0 0 100 100">
              <UnoGlyph kind={card.kind} />
            </svg>
          )}

          {/* The small corner marks. Real cards have them so a fanned hand can be
              read, and a fanned hand is exactly how this is drawn. */}
          <text className="ct-uno-corner" x="13" y="29" textAnchor="start">
            {isNumber ? card.kind : shortKind(card.kind)}
          </text>
          <text
            className="ct-uno-corner"
            x="87"
            y="127"
            textAnchor="start"
            transform="rotate(180 87 121)"
          >
            {isNumber ? card.kind : shortKind(card.kind)}
          </text>
        </>
      )}
    </>
  );
}

function shortKind(kind: string): string {
  switch (kind) {
    case "skip":
      return "⊘";
    case "reverse":
      return "⇄";
    case "draw2":
      return "+2";
    case "wild4":
      return "+4";
    default:
      return "★";
  }
}

// --- okey --------------------------------------------------------------------

const TILE_COLOR_NAMES: Record<string, string> = {
  r: "kırmızı",
  y: "sarı",
  b: "mavi",
  k: "siyah",
};

export interface OkeyTileProps {
  tile: MinigameRummyTile;
  /** Face-down, for the pile and for other people's racks. */
  facedown?: boolean;
  /** True when this tile is the okey, so it can wear the marker. */
  isOkey?: boolean;
  selected?: boolean;
  className?: string;
}

/**
 * One okey tile.
 *
 * The material is the point: an ivory body with a bevelled top edge, a shadowed
 * bottom one, and the numeral engraved rather than printed. All of that is CSS
 * on the wrapper; the SVG carries the numeral, the underline that tells a 6
 * from a 9, and the little false-joker face.
 */
export function OkeyTile({
  tile,
  facedown,
  isOkey,
  selected,
  className,
}: OkeyTileProps) {
  if (facedown) {
    return (
      <span
        className={`ct-tile ct-tile-back ${className ?? ""}`}
        role="img"
        aria-label="Kapalı taş"
      />
    );
  }

  const isBlank = tile.value === 0;

  return (
    <span
      className={`ct-tile ${className ?? ""}`}
      data-color={isBlank ? "j" : tile.color}
      data-selected={selected ? "true" : undefined}
      data-okey={isOkey ? "true" : undefined}
      role="img"
      aria-label={
        isBlank ? "Sahte okey" : `${TILE_COLOR_NAMES[tile.color] ?? ""} ${tile.value}`
      }
    >
      <svg className="ct-tile-face" viewBox="0 0 60 84" aria-hidden="true">
        {isBlank ? (
          // The false okey is a blank tile with a little smiling face on it,
          // exactly as the real set has.
          <g className="ct-tile-joker">
            <circle cx="30" cy="36" r="16" fill="none" strokeWidth="3" />
            <circle cx="24" cy="32" r="2.5" />
            <circle cx="36" cy="32" r="2.5" />
            <path d="M22 42a10 10 0 0 0 16 0" fill="none" strokeWidth="3" strokeLinecap="round" />
          </g>
        ) : (
          <>
            <text className="ct-tile-numeral" x="30" y="52" textAnchor="middle">
              {tile.value}
            </text>
            {/* The underline under a 6 and a 9, which is the only thing that
                tells them apart on a tile that can be picked up either way up. */}
            {tile.value === 6 || tile.value === 9 ? (
              <line className="ct-tile-underline" x1="20" y1="60" x2="40" y2="60" />
            ) : null}
          </>
        )}
        {/* The moulding dimple every real tile has near the bottom. */}
        <circle className="ct-tile-dimple" cx="30" cy="72" r="3" />
      </svg>
    </span>
  );
}

// --- dice --------------------------------------------------------------------

/** Where the pips sit on each face, in thirds. */
const DIE_PIPS: Record<number, [number, number][]> = {
  1: [[2, 2]],
  2: [
    [1, 1],
    [3, 3],
  ],
  3: [
    [1, 1],
    [2, 2],
    [3, 3],
  ],
  4: [
    [1, 1],
    [3, 1],
    [1, 3],
    [3, 3],
  ],
  5: [
    [1, 1],
    [3, 1],
    [2, 2],
    [1, 3],
    [3, 3],
  ],
  6: [
    [1, 1],
    [3, 1],
    [1, 2],
    [3, 2],
    [1, 3],
    [3, 3],
  ],
};

export interface DieProps {
  /** 1..6, or 0 for a die that has not been thrown. */
  face: number;
  held?: boolean;
  spent?: boolean;
  className?: string;
}

/** One die: a rounded ivory cube with recessed pips. */
export function Die({ face, held, spent, className }: DieProps) {
  return (
    <span
      className={`ct-die ${className ?? ""}`}
      data-held={held ? "true" : undefined}
      data-spent={spent ? "true" : undefined}
      data-empty={face === 0 ? "true" : undefined}
      role="img"
      aria-label={face === 0 ? "Atılmamış zar" : `${face}`}
    >
      {face === 0 ? null : (
        <svg viewBox="0 0 60 60" aria-hidden="true">
          {DIE_PIPS[face]?.map(([x, y], index) => (
            <circle key={index} className="ct-die-pip" cx={x * 15} cy={y * 15} r="5.5" />
          ))}
        </svg>
      )}
    </span>
  );
}

// --- chips -------------------------------------------------------------------

/**
 * The denominations a stack is broken into, largest first. Real casino colours,
 * because they are what people already read: white 1, red 5, green 25, black
 * 100, purple 500, yellow 1000.
 */
const CHIP_VALUES = [1000, 500, 100, 25, 5, 1];

export interface ChipStackProps {
  amount: number;
  /** How many chips to draw at most, so a big stack does not fill the table. */
  limit?: number;
  className?: string;
}

/**
 * A pile of chips worth `amount`.
 *
 * Broken into denominations rather than drawn as N of one colour: a stack of
 * forty whites and a stack of two twenty-fives are the same money and only one
 * of them fits on the table.
 */
export function ChipStack({ amount, limit = 8, className }: ChipStackProps) {
  const chips: number[] = [];
  let left = amount;

  for (const value of CHIP_VALUES) {
    while (left >= value && chips.length < limit) {
      chips.push(value);
      left -= value;
    }
  }

  return (
    <span
      className={`ct-chips ${className ?? ""}`}
      role="img"
      aria-label={`${amount} çip`}
    >
      {chips.map((value, index) => (
        <span
          key={index}
          className="ct-chip"
          data-value={value}
          // Stacked upwards, each one a little higher than the last.
          style={{ "--chip-index": String(index) } as CSSProperties}
        />
      ))}
      <span className="ct-chips-amount">{amount}</span>
    </span>
  );
}
