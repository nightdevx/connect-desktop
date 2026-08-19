import { Tooltip } from "antd";
import { EyeOutlined } from "@ant-design/icons";
import { useScreenWatchers } from "@/features/livekit";

interface ScreenWatcherBadgeProps {
  /** Whose share this is. */
  ownerUserId: string;
  /** Roster names, so the badge can say who rather than how many. */
  nameByUserId: Record<string, string>;
}

/** At most this many names before the label falls back to a count. */
const INLINE_NAME_LIMIT = 2;

const labelFor = (names: string[]): string => {
  if (names.length <= INLINE_NAME_LIMIT) {
    return names.join(", ");
  }
  return `${names.length} izleyici`;
};

/**
 * Who is watching this screen share, on the share's own tile.
 *
 * Sharing into a room used to be a broadcast into the dark: nothing told the
 * person sharing whether anyone had opened it, which matters more here than in
 * most apps because watching is opt-in — "can you see my screen?" had no answer
 * anywhere on screen.
 *
 * Subscribes to the store directly rather than taking the audience as a prop:
 * the tile around it is memoised on a fixed list of fields, so a prop would
 * either be ignored or force the whole tile — video element included — to
 * re-render every time somebody pressed watch.
 */
export function ScreenWatcherBadge({
  ownerUserId,
  nameByUserId,
}: ScreenWatcherBadgeProps) {
  const watcherIds = useScreenWatchers(ownerUserId);

  if (watcherIds.length === 0) {
    return null;
  }

  const names = watcherIds.map((userId) => nameByUserId[userId] ?? "Bilinmeyen");

  return (
    <Tooltip title={`İzleyenler: ${names.join(", ")}`} placement="bottom">
      <div
        className="ct-lobby-tile-watchers"
        role="status"
        aria-label={`${watcherIds.length} kişi izliyor`}
      >
        <EyeOutlined aria-hidden="true" />
        <span>{labelFor(names)}</span>
      </div>
    </Tooltip>
  );
}
