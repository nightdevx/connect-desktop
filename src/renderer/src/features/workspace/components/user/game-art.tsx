import { useEffect, useState } from "react";
import { GAME_ART } from "@shared/game-activity";
import { getDisplayInitials, hueStyle } from "@/ui/person-style";

export type GameArtSize = "xs" | "md" | "lg";

/**
 * A game's square picture, the same size for every game at a given size.
 *
 * The pictures ship with the app (public/games, see GAME_ART), so nothing is
 * fetched from a store's CDN while somebody plays. A game without one -- or a
 * file that fails to load -- shows its initials on a colour of its own, like a
 * face without a photo.
 */
export function GameArt({ name, size }: { name: string; size: GameArtSize }) {
  const file = GAME_ART[name];
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [file]);

  if (!file || failed) {
    return (
      <span className={`ct-game-art ct-hued ${size}`} style={hueStyle(name)} aria-hidden="true">
        {getDisplayInitials(name)}
      </span>
    );
  }

  // Relative to index.html: the packaged app loads it from disk, and the dev
  // server serves public/ at the same place.
  return (
    <img
      className={`ct-game-art ${size}`}
      src={`games/${file}.jpg`}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}
