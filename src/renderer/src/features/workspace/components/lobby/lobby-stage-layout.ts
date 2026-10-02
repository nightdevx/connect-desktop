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
  "--ct-stage-tile-width"?: string;
};

interface UseLobbyStageLayoutResult {
  /**
   * Goes on `.ct-lobby-stage-area` — the padded box the tiles are laid out in.
   *
   * Deliberately the element that CARRIES the padding rather than the stage
   * panel around it: a ResizeObserver reports the CONTENT box, so whatever the
   * stylesheet spends on padding is already subtracted by the time it gets
   * here. The old version observed the panel and subtracted four hardcoded
   * numbers (28/28/76/96) that no stylesheet agreed with — the CSS spent
   * 18/18/66/94, and 10/10 below 900px — so every tile was fitted to an area
   * that did not exist.
   */
  stageAreaRef: MutableRefObject<HTMLDivElement | null>;
  stageLayoutStyle: LobbyStageLayoutStyle;
}

const TILE_ASPECT_RATIO = 16 / 9;
const DEFAULT_STAGE_WIDTH_WITH_CHAT = 1040;
const DEFAULT_STAGE_WIDTH_NO_CHAT = 1360;
const DEFAULT_STAGE_HEIGHT = 620;
const MAX_COLUMNS = 7;
const RESIZE_DELTA_THRESHOLD = 8;

export interface StageSize {
  width: number;
  height: number;
}

/**
 * Which size to lay the tiles out for, given the one just measured.
 *
 * A few pixels of GROWTH is not worth reflowing every tile for; a shrink always
 * is. The fit fills a row exactly, so a box even 1px narrower than the one it
 * was fitted to drops a tile onto a row of its own. The room grid's 320ms
 * column transition ends in steps smaller than the threshold, and they were all
 * skipped: a stage that settled at 1086px stayed fitted to 1089, and three
 * tiles wrapped into one column that overflowed under the room header.
 */
export function nextStageSize(
  previous: StageSize,
  next: StageSize,
  force: boolean,
): StageSize {
  if (previous.width === next.width && previous.height === next.height) {
    return previous;
  }

  const shrank = next.width < previous.width || next.height < previous.height;
  if (
    !force &&
    !shrank &&
    Math.abs(previous.width - next.width) < RESIZE_DELTA_THRESHOLD &&
    Math.abs(previous.height - next.height) < RESIZE_DELTA_THRESHOLD
  ) {
    return previous;
  }

  return next;
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

export function resolveGridFit(
  participantCount: number,
  stageSize: StageSize,
  isLobbyChatOpen: boolean,
  gapPx: number,
): StageGridFit {
  const fallbackWidth = isLobbyChatOpen
    ? DEFAULT_STAGE_WIDTH_WITH_CHAT
    : DEFAULT_STAGE_WIDTH_NO_CHAT;

  // The measured box IS the content box, so nothing is subtracted from it.
  const availableWidth = Math.max(
    240,
    stageSize.width > 0 ? stageSize.width : fallbackWidth,
  );
  const availableHeight = Math.max(
    160,
    stageSize.height > 0 ? stageSize.height : DEFAULT_STAGE_HEIGHT,
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
    const candidate: StageGridFit = { columns, tileWidth };

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
    return { columns: 1, tileWidth: Math.max(1, Math.floor(availableWidth)) };
  }

  return {
    columns: selectedFit.columns,
    tileWidth: Math.max(1, selectedFit.tileWidth),
  };
}

export function useLobbyStageLayout(
  participantCount: number,
  isLobbyChatOpen: boolean,
): UseLobbyStageLayoutResult {
  const stageAreaRef = useRef<HTMLDivElement | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const [stageSize, setStageSize] = useState<StageSize>({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    const stageArea = stageAreaRef.current;
    if (!stageArea) {
      return;
    }

    // The same content box the observer reports, read synchronously so the
    // first paint is already fitted rather than laid out from the fallback.
    const readContentBox = (): StageSize => {
      const styles = window.getComputedStyle(stageArea);
      const horizontal =
        parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const vertical =
        parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);

      return {
        width: Math.max(0, Math.round(stageArea.clientWidth - horizontal)),
        height: Math.max(0, Math.round(stageArea.clientHeight - vertical)),
      };
    };

    // The first measurement always lands; after that, see nextStageSize.
    const applySize = (nextSize: StageSize, force: boolean): void => {
      setStageSize((previousSize) => nextStageSize(previousSize, nextSize, force));
    };

    applySize(readContentBox(), true);

    const scheduleResize = (nextSize: StageSize): void => {
      if (resizeFrameRef.current !== null) {
        return;
      }

      resizeFrameRef.current = window.requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        applySize(nextSize, false);
      });
    };

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      scheduleResize({
        width: Math.round(entry.contentRect.width),
        height: Math.round(entry.contentRect.height),
      });
    });
    observer.observe(stageArea);

    return () => {
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
      "--ct-stage-tile-width": `${gridFit.tileWidth}px`,
    };
  }, [isLobbyChatOpen, participantCount, stageSize]);

  return {
    stageAreaRef,
    stageLayoutStyle,
  };
}
