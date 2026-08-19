import { useEffect } from "react";
import type { Direction } from "./minigames-logic";

/**
 * Arrow keys and WASD, for the two games driven by a direction.
 *
 * Bound to `window` rather than to the board, because a board is a grid of divs
 * and giving it focus means either a tabindex that traps the keyboard or a
 * click before the first key does anything. The listener is torn down with the
 * component, and every game unmounts as soon as the page leaves the screen.
 */
const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
  a: "left",
  d: "right",
  w: "up",
  s: "down",
  A: "left",
  D: "right",
  W: "up",
  S: "down",
};

/** `onDirection` must be stable -- wrap it in useCallback, or this rebinds. */
export function useArrowKeys(onDirection: (direction: Direction) => void): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // Never eat a keystroke aimed at a field. Nothing on this page has one
      // today; a search box added later would otherwise silently stop taking
      // the letter "w", and the cause would be nowhere near the search box.
      if (
        target?.isContentEditable ||
        /^(input|textarea|select)$/i.test(target?.tagName ?? "")
      ) {
        return;
      }

      const direction = KEY_DIRECTIONS[event.key];
      if (!direction) {
        return;
      }

      // The panel scrolls on arrow keys otherwise, so the board walks off the
      // top of the screen while it is being played.
      event.preventDefault();
      onDirection(direction);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onDirection]);
}
