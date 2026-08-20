import type { ComponentType, ReactNode } from "react";
import {
  BulbOutlined,
  CrownOutlined,
  CloseSquareOutlined,
  FlagOutlined,
  NodeIndexOutlined,
  TableOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { MINIGAME_IDS, type MinigameId } from "@/store/minigame-scores";
import type { MinigameBoardProps } from "./board-props";
import { Game2048 } from "./components/games/game-2048";
import { Memory } from "./components/games/memory";
import { Minesweeper } from "./components/games/minesweeper";
import { Snake } from "./components/games/snake";
import { VersusBoard } from "./components/games/versus-board";

/**
 * The list of games, and everything the two panels need to draw one.
 *
 * A registry rather than a switch in each panel: adding a game is one id in the
 * store union plus one entry here, and because the entries are a
 * Record<MinigameId, ...> the compiler names the second half if the first is
 * done alone. An array would have let a new id ship with no game behind it.
 */
export interface MinigameEntry {
  id: MinigameId;
  label: string;
  description: string;
  icon: ReactNode;
  /**
   * Solo runs alone and keeps a personal best per difficulty; versus is played
   * against somebody and keeps none. Drives the sidebar's two groups, and
   * whether the difficulty picker is drawn at all.
   */
  mode: "solo" | "versus";
  /** What the personal best measures. Absent for versus, which keeps none. */
  formatScore?: (score: number) => string;
  Component: ComponentType<MinigameBoardProps>;
}

const BY_ID: Record<MinigameId, MinigameEntry> = {
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
  xox: {
    id: "xox",
    label: "XOX",
    description: "3x3. Masa aç, biri katılsın, sırayla oyna.",
    icon: <CloseSquareOutlined />,
    mode: "versus",
    // Defined once, at module scope, so this is a stable component type and not
    // a new one on every render of the panel that mounts it.
    Component: (props) => <VersusBoard game="xox" {...props} />,
  },
  connect4: {
    id: "connect4",
    label: "4'lü Sıra",
    description: "7x6. Masa aç, dört taşı yan yana diz.",
    icon: <TeamOutlined />,
    mode: "versus",
    Component: (props) => <VersusBoard game="connect4" {...props} />,
  },
  chess: {
    id: "chess",
    label: "Satranç",
    description: "Tam kurallar. Rok, geçerken alma, terfi.",
    icon: <CrownOutlined />,
    mode: "versus",
    Component: (props) => <VersusBoard game="chess" {...props} />,
  },
};

/** Sidebar order. Owned by MINIGAME_IDS so the store and the page agree. */
export const MINIGAMES: readonly MinigameEntry[] = MINIGAME_IDS.map((id) => BY_ID[id]);

export const SOLO_MINIGAMES = MINIGAMES.filter((entry) => entry.mode === "solo");
export const VERSUS_MINIGAMES = MINIGAMES.filter((entry) => entry.mode === "versus");

export function findMinigame(id: MinigameId): MinigameEntry {
  return BY_ID[id];
}

export type { MinigameBoardProps };
