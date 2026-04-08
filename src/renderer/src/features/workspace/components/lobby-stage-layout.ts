import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
} from "react";

export type LobbyStageLayoutStyle = CSSProperties & {
  "--ct-stage-columns"?: string;
  "--ct-stage-gap"?: string;
  "--ct-stage-max-width"?: string;
  "--ct-stage-tile-width"?: string;
};

interface UseLobbyStageLayoutResult {
  stagePanelRef: MutableRefObject<HTMLElement | null>;
  stageLayoutStyle: LobbyStageLayoutStyle;
}

const STAGE_HORIZONTAL_PADDING_PX = 28;
const STAGE_VERTICAL_PADDING_TOP_PX = 76;
const STAGE_VERTICAL_PADDING_BOTTOM_PX = 96;
const STAGE_INNER_HORIZONTAL_PADDING_PX = 28;
const TILE_ASPECT_RATIO = 16 / 9;
const DEFAULT_STAGE_WIDTH_WITH_CHAT = 1040;
const DEFAULT_STAGE_WIDTH_NO_CHAT = 1360;
const DEFAULT_STAGE_HEIGHT = 760;
const MAX_COLUMNS = 7;
const RESIZE_DELTA_THRESHOLD = 8;

interface StageSize {
  width: number;
  height: number;
}

function resolveGapPx(participantCount: number): number {
  if (participantCount >= 10) {
    return 8;
  }

  if (participantCount >= 6) {
    return 10;
  }

  if (participantCount >= 3) {
    return 12;
  }

  return 14;
}

function resolveIdealMinTileWidth(
  participantCount: number,
  availableWidth: number,
): number {
  if (participantCount <= 2) {
    return availableWidth >= 1200 ? 400 : 340;
  }

  if (participantCount <= 4) {
    return availableWidth >= 1200 ? 300 : 260;
  }

  if (participantCount <= 8) {
    return availableWidth >= 1100 ? 220 : 190;
  }

  return availableWidth >= 1100 ? 180 : 160;
}

interface StageGridFit {
  columns: number;
  tileWidth: number;
  stageWidth: number;
}

function calculateTileWidth(
  participantCount: number,
  columns: number,
  availableWidth: number,
  availableHeight: number,
  gapPx: number,
): number {
  const rows = Math.ceil(participantCount / columns);
  const widthByColumns = (availableWidth - gapPx * (columns - 1)) / columns;
  const heightByRows = (availableHeight - gapPx * (rows - 1)) / rows;

  if (widthByColumns <= 0 || heightByRows <= 0) {
    return 0;
  }

  return Math.floor(
    Math.max(1, Math.min(widthByColumns, heightByRows * TILE_ASPECT_RATIO)),
  );
}

function resolveGridFit(
  participantCount: number,
  stageSize: StageSize,
  isLobbyChatOpen: boolean,
  gapPx: number,
): StageGridFit {
  const fallbackWidth = isLobbyChatOpen
    ? DEFAULT_STAGE_WIDTH_WITH_CHAT
    : DEFAULT_STAGE_WIDTH_NO_CHAT;
  const measuredWidth = stageSize.width > 0 ? stageSize.width : fallbackWidth;
  const measuredHeight =
    stageSize.height > 0 ? stageSize.height : DEFAULT_STAGE_HEIGHT;

  const availableWidth = Math.max(
    240,
    measuredWidth -
      STAGE_HORIZONTAL_PADDING_PX -
      STAGE_INNER_HORIZONTAL_PADDING_PX,
  );

  const availableHeight = Math.max(
    160,
    measuredHeight -
      STAGE_VERTICAL_PADDING_TOP_PX -
      STAGE_VERTICAL_PADDING_BOTTOM_PX,
  );

  const maxColumns = Math.max(1, Math.min(participantCount, MAX_COLUMNS));
  const idealMinTileWidth = resolveIdealMinTileWidth(
    participantCount,
    availableWidth,
  );

  let bestAnyFit: StageGridFit | null = null;
  let bestComfortFit: StageGridFit | null = null;
  let bestComfortRows = Number.MAX_SAFE_INTEGER;

  for (let columns = 1; columns <= maxColumns; columns += 1) {
    const tileWidth = calculateTileWidth(
      participantCount,
      columns,
      availableWidth,
      availableHeight,
      gapPx,
    );

    if (tileWidth <= 0) {
      continue;
    }

    const rows = Math.ceil(participantCount / columns);
    const candidate: StageGridFit = {
      columns,
      tileWidth,
      stageWidth: Math.floor(tileWidth * columns + gapPx * (columns - 1)),
    };

    if (
      !bestAnyFit ||
      candidate.tileWidth > bestAnyFit.tileWidth ||
      (candidate.tileWidth === bestAnyFit.tileWidth &&
        candidate.columns > bestAnyFit.columns)
    ) {
      bestAnyFit = candidate;
    }

    if (tileWidth < idealMinTileWidth) {
      continue;
    }

    if (
      !bestComfortFit ||
      candidate.tileWidth > bestComfortFit.tileWidth ||
      (candidate.tileWidth === bestComfortFit.tileWidth &&
        rows < bestComfortRows)
    ) {
      bestComfortFit = candidate;
      bestComfortRows = rows;
    }
  }

  const selectedFit = bestComfortFit ?? bestAnyFit;
  if (!selectedFit) {
    return {
      columns: 1,
      tileWidth: Math.max(1, Math.floor(availableWidth)),
      stageWidth: Math.max(240, Math.floor(availableWidth)),
    };
  }

  return {
    columns: selectedFit.columns,
    tileWidth: Math.max(1, selectedFit.tileWidth),
    stageWidth: Math.max(
      240,
      Math.min(Math.floor(availableWidth), selectedFit.stageWidth),
    ),
  };
}

function resolveMaxWidth(
  stageWidth: number,
  computedStageWidth: number,
): string {
  const availableWidth =
    stageWidth > 0
      ? Math.max(320, stageWidth - STAGE_HORIZONTAL_PADDING_PX)
      : computedStageWidth;

  return `${Math.floor(Math.min(availableWidth, computedStageWidth))}px`;
}

export function useLobbyStageLayout(
  participantCount: number,
  isLobbyChatOpen: boolean,
): UseLobbyStageLayoutResult {
  const stagePanelRef = useRef<HTMLElement | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const [stageSize, setStageSize] = useState<StageSize>({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    const stagePanel = stagePanelRef.current;
    if (!stagePanel) {
      return;
    }

    const updateSize = (force = false): void => {
      const rect = stagePanel.getBoundingClientRect();
      const nextSize = {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };

      setStageSize((previousSize) => {
        if (
          !force &&
          Math.abs(previousSize.width - nextSize.width) <
            RESIZE_DELTA_THRESHOLD &&
          Math.abs(previousSize.height - nextSize.height) <
            RESIZE_DELTA_THRESHOLD
        ) {
          return previousSize;
        }

        if (
          previousSize.width === nextSize.width &&
          previousSize.height === nextSize.height
        ) {
          return previousSize;
        }

        return nextSize;
      });
    };

    updateSize(true);

    const scheduleResize = (): void => {
      if (resizeFrameRef.current !== null) {
        return;
      }

      resizeFrameRef.current = window.requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        updateSize();
      });
    };

    const observer = new ResizeObserver(() => {
      scheduleResize();
    });
    observer.observe(stagePanel);

    window.addEventListener("resize", scheduleResize);

    return () => {
      window.removeEventListener("resize", scheduleResize);
      observer.disconnect();

      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, []);

  const stageLayoutStyle = useMemo<LobbyStageLayoutStyle>(() => {
    const safeParticipantCount = Math.max(1, participantCount);
    const gapPx = resolveGapPx(safeParticipantCount);
    const gridFit = resolveGridFit(
      safeParticipantCount,
      stageSize,
      isLobbyChatOpen,
      gapPx,
    );

    return {
      "--ct-stage-columns": String(gridFit.columns),
      "--ct-stage-gap": `${gapPx}px`,
      "--ct-stage-max-width": resolveMaxWidth(
        stageSize.width,
        gridFit.stageWidth,
      ),
      "--ct-stage-tile-width": `${gridFit.tileWidth}px`,
    };
  }, [isLobbyChatOpen, participantCount, stageSize]);

  return {
    stagePanelRef,
    stageLayoutStyle,
  };
}
