import type { ComponentType, ReactNode } from "react";
import {
  AimOutlined,
  AppstoreAddOutlined,
  AppstoreOutlined,
  BgColorsOutlined,
  BlockOutlined,
  BorderInnerOutlined,
  BorderOuterOutlined,
  BorderOutlined,
  BuildOutlined,
  BulbOutlined,
  CalculatorOutlined,
  CloseSquareOutlined,
  CreditCardOutlined,
  CrownOutlined,
  DeploymentUnitOutlined,
  DollarOutlined,
  DotChartOutlined,
  DownCircleOutlined,
  DownSquareOutlined,
  FlagOutlined,
  FontSizeOutlined,
  FormatPainterOutlined,
  GoldOutlined,
  NodeIndexOutlined,
  PicCenterOutlined,
  PieChartOutlined,
  ProfileOutlined,
  QuestionCircleOutlined,
  RocketOutlined,
  TableOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  MULTIPLAYER_SEATS,
  isMultiplayerGameId,
  type MultiplayerGameId,
} from "@shared/minigames";
import { MINIGAME_IDS, type MinigameId } from "@/store/minigame-scores";
import type { MinigameBoardProps } from "./board-props";
import { FloodIt } from "./components/games/flood-it";
import { Game2048 } from "./components/games/game-2048";
import { Gunline } from "./components/games/gunline";
import { LightsOut } from "./components/games/lights-out";
import { MathSprint } from "./components/games/math-sprint";
import { Memory } from "./components/games/memory";
import { Minesweeper } from "./components/games/minesweeper";
import { Nonogram } from "./components/games/nonogram";
import { Puzzle15 } from "./components/games/puzzle15";
import { Simon } from "./components/games/simon";
import { Snake } from "./components/games/snake";
import { Sudoku } from "./components/games/sudoku";
import { Tetris } from "./components/games/tetris";
import { Typing } from "./components/games/typing";
import { VersusBoard } from "./components/games/versus-board";

/**
 * The list of games, and everything the two panels need to draw one.
 *
 * A registry rather than a switch in each panel: adding a game is one id in the
 * store union plus one entry here, and because the entries are a
 * Record<MinigameId, ...> the compiler names the second half if the first is
 * done alone. An array would have let a new id ship with no game behind it.
 *
 * Every multiplayer entry is the SAME component with a different game id. The
 * board behind it is chosen by versus-views.tsx, which is a second registry
 * over the multiplayer ids alone -- this one is about the page (a label, an
 * icon, a group), that one is about the board.
 */
export interface MinigameEntry {
  id: MinigameId;
  label: string;
  description: string;
  icon: ReactNode;
  /**
   * Solo runs alone and keeps a personal best per difficulty; versus is played
   * against somebody and keeps none. Drives the sidebar's groups, and whether
   * the difficulty picker is drawn at all.
   */
  mode: "solo" | "versus";
  /** What the personal best measures. Absent for versus, which keeps none. */
  formatScore?: (score: number) => string;
  Component: ComponentType<MinigameBoardProps>;
}

/**
 * One versus entry.
 *
 * Defined through a helper so the component identity is STABLE per game: an
 * inline arrow in each row would be a new component type on every render of the
 * panel that mounts it, which remounts the board -- and remounting a board
 * throws away the local state that is the only thing a board owns (a selected
 * blokus rotation, a half-arranged okey rack).
 */
const versusComponents = {} as Record<
  MultiplayerGameId,
  ComponentType<MinigameBoardProps>
>;

function versusComponent(game: MultiplayerGameId): ComponentType<MinigameBoardProps> {
  if (!versusComponents[game]) {
    versusComponents[game] = ({ currentUserId }: MinigameBoardProps) => (
      <VersusBoard game={game} currentUserId={currentUserId} />
    );
    versusComponents[game].displayName = `VersusBoard(${game})`;
  }
  return versusComponents[game];
}

function versus(
  id: MultiplayerGameId,
  label: string,
  description: string,
  icon: ReactNode,
): MinigameEntry {
  return { id, label, description, icon, mode: "versus", Component: versusComponent(id) };
}

const BY_ID: Record<MinigameId, MinigameEntry> = {
  // --- solo ------------------------------------------------------------------
  "2048": {
    id: "2048",
    label: "2048",
    description: "Kaydır, aynı sayıları birleştir.",
    icon: <TableOutlined />,
    mode: "solo",
    formatScore: (score) => `${score} puan`,
    Component: Game2048,
  },
  minesweeper: {
    id: "minesweeper",
    label: "Mayın Tarlası",
    description: "İlk tıklama her zaman güvenli.",
    icon: <FlagOutlined />,
    mode: "solo",
    formatScore: (score) => `${score} saniye`,
    Component: Minesweeper,
  },
  snake: {
    id: "snake",
    label: "Yılan",
    description: "Yem yedikçe uzar ve hızlanır.",
    icon: <NodeIndexOutlined />,
    mode: "solo",
    formatScore: (score) => `${score} yem`,
    Component: Snake,
  },
  memory: {
    id: "memory",
    label: "Hafıza",
    description: "Çiftleri en az hamlede eşle.",
    icon: <BulbOutlined />,
    mode: "solo",
    formatScore: (score) => `${score} hamle`,
    Component: Memory,
  },
  sudoku: {
    id: "sudoku",
    label: "Sudoku",
    description: "9x9. Her satır, sütun ve kutuda 1-9.",
    icon: <BorderOuterOutlined />,
    mode: "solo",
    formatScore: (score) => `${score} saniye`,
    Component: Sudoku,
  },
  puzzle15: {
    id: "puzzle15",
    label: "Sayı Kaydırma",
    description: "Taşları kaydır, sıraya diz.",
    icon: <AppstoreOutlined />,
    mode: "solo",
    formatScore: (score) => `${score} hamle`,
    Component: Puzzle15,
  },
  lightsout: {
    id: "lightsout",
    label: "Işıklar",
    description: "Bir kareye bas, komşuları da döner.",
    icon: <ThunderboltOutlined />,
    mode: "solo",
    formatScore: (score) => `${score} basış`,
    Component: LightsOut,
  },
  tetris: {
    id: "tetris",
    label: "Düşen Bloklar",
    description: "Satırları doldur, kuyuyu boşalt.",
    icon: <BuildOutlined />,
    mode: "solo",
    formatScore: (score) => `${score} puan`,
    Component: Tetris,
  },
  simon: {
    id: "simon",
    label: "Renk Dizisi",
    description: "Diziyi izle, aynısını tekrarla.",
    icon: <BgColorsOutlined />,
    mode: "solo",
    formatScore: (score) => `${score}. seviye`,
    Component: Simon,
  },
  floodit: {
    id: "floodit",
    label: "Renk Yayılımı",
    description: "Köşeden başla, tahtayı tek renge indir.",
    icon: <FormatPainterOutlined />,
    mode: "solo",
    formatScore: (score) => `${score} hamle`,
    Component: FloodIt,
  },
  nonogram: {
    id: "nonogram",
    label: "Nonogram",
    description: "Kenardaki sayılar resmi anlatır.",
    icon: <BorderInnerOutlined />,
    mode: "solo",
    formatScore: (score) => `${score} saniye`,
    Component: Nonogram,
  },
  typing: {
    id: "typing",
    label: "Klavye Hızı",
    description: "Metni yaz, dakikada kaç kelime?",
    icon: <FontSizeOutlined />,
    mode: "solo",
    formatScore: (score) => `${score} WPM`,
    Component: Typing,
  },
  mathsprint: {
    id: "mathsprint",
    label: "Zihinden İşlem",
    description: "Süre dolmadan kaç işlem çözebilirsin?",
    icon: <CalculatorOutlined />,
    mode: "solo",
    formatScore: (score) => `${score} doğru`,
    Component: MathSprint,
  },
  gunline: {
    id: "gunline",
    label: "Nişan Hattı",
    description: "Müfrezeni büyüt, gelen dalgayı durdur.",
    icon: <AimOutlined />,
    mode: "solo",
    formatScore: (score) => `${score} puan`,
    Component: Gunline,
  },

  // --- two players -----------------------------------------------------------
  xox: versus("xox", "XOX", "3x3. Üçü yan yana getir.", <CloseSquareOutlined />),
  connect4: versus(
    "connect4",
    "4'lü Sıra",
    "7x6. Dört taşı yan yana diz.",
    <DownCircleOutlined />,
  ),
  gomoku: versus(
    "gomoku",
    "Gomoku",
    "15x15. Beş taşı yan yana diz.",
    <DotChartOutlined />,
  ),
  connect5: versus(
    "connect5",
    "5'li Sıra",
    "9x7. Aynı oyun, bir uzun.",
    <DownSquareOutlined />,
  ),
  chess: versus(
    "chess",
    "Satranç",
    "Tam kurallar. Rok, geçerken alma, terfi.",
    <CrownOutlined />,
  ),
  reversi: versus(
    "reversi",
    "Reversi",
    "8x8. Rakibin taşlarını arana al, çevir.",
    <PieChartOutlined />,
  ),
  backgammon: versus(
    "backgammon",
    "Tavla",
    "Zar at, pulları topla. Yalnız kalan kırılır.",
    <PicCenterOutlined />,
  ),
  battleship: versus(
    "battleship",
    "Amiral Battı",
    "Filoları aynı anda dizin, sırayla ateş edin.",
    <RocketOutlined />,
  ),

  // --- a crowd ---------------------------------------------------------------
  connect4trio: versus(
    "connect4trio",
    "3 Kişilik Sıra",
    "11x9, üç kişi. Dördü yan yana diz.",
    <TeamOutlined />,
  ),
  boxes: versus(
    "boxes",
    "Nokta Kutu",
    "Çizgi çek, kutu kapat. Kapatan tekrar oynar.",
    <BorderOutlined />,
  ),
  blokus: versus(
    "blokus",
    "Köşe Blokları",
    "21 taş. Köşeden değ, kenardan değme.",
    <BlockOutlined />,
  ),
  yahtzee: versus(
    "yahtzee",
    "Zar Poker",
    "Beş zar, üç atış, on üç kutu.",
    <GoldOutlined />,
  ),
  ludo: versus(
    "ludo",
    "Kızma Birader",
    "6 at, bazadan çık. Üstüne basanı kır.",
    <DeploymentUnitOutlined />,
  ),
  quiz: versus(
    "quiz",
    "Bilgi Yarışması",
    "Sırayla soru. Sekiz tur, dört şık.",
    <QuestionCircleOutlined />,
  ),
  // Named for the shout, not for the box. The rules of a shedding card game are
  // nobody's property, but the name on the retail box and the artwork on its
  // cards are -- so this table plays the game and wears its own clothes. Same
  // reason "Zar Poker" is not Yahtzee and "Köşe Blokları" is not Blokus.
  uno: versus(
    "uno",
    "Son Kart",
    "Aynı renk ya da aynı sayı. Elini ilk bitiren kazanır.",
    <CreditCardOutlined />,
  ),
  okey: versus(
    "okey",
    "Okey",
    "106 taş. On dördü grup yapan eli açar.",
    <AppstoreAddOutlined />,
  ),
  rummy1: versus(
    "rummy1",
    "Okey 101",
    "21 taş, 101 puanla el açma. Cezası 101'e ulaşan elenir.",
    <ProfileOutlined />,
  ),
  poker: versus(
    "poker",
    "Poker",
    "Texas Hold'em, oyun çipiyle. Yan potlar dahil.",
    <DollarOutlined />,
  ),
};

/** Sidebar order. Owned by MINIGAME_IDS so the store and the page agree. */
export const MINIGAMES: readonly MinigameEntry[] = MINIGAME_IDS.map((id) => BY_ID[id]);

export const SOLO_MINIGAMES = MINIGAMES.filter((entry) => entry.mode === "solo");

/**
 * The two-player games and the ones that seat a crowd, split.
 *
 * A third group rather than one long list, because the question people arrive
 * with is "what can four of us play" and a list of eighteen does not answer it.
 * The split is read off MULTIPLAYER_SEATS rather than typed out here, so a game
 * whose seat count changes moves group on its own.
 */
export const DUEL_MINIGAMES = MINIGAMES.filter(
  (entry) =>
    entry.mode === "versus" &&
    isMultiplayerGameId(entry.id) &&
    MULTIPLAYER_SEATS[entry.id].max === 2,
);

export const PARTY_MINIGAMES = MINIGAMES.filter(
  (entry) =>
    entry.mode === "versus" &&
    isMultiplayerGameId(entry.id) &&
    MULTIPLAYER_SEATS[entry.id].max > 2,
);

/** Every versus game, for anything that does not care about the split. */
export const VERSUS_MINIGAMES = MINIGAMES.filter((entry) => entry.mode === "versus");

export function findMinigame(id: MinigameId): MinigameEntry {
  return BY_ID[id];
}

/** How many chairs a game's table has, or null for a solo game. */
export function seatsOf(id: MinigameId): { min: number; max: number } | null {
  return isMultiplayerGameId(id) ? MULTIPLAYER_SEATS[id] : null;
}

export type { MinigameBoardProps };
