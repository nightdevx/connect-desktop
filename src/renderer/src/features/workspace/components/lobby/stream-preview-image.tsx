import type { ReactNode } from "react";
import { useStreamPreview } from "../../hooks/media/use-stream-preview";

/**
 * Someone's screen share as its newest small frame, for a viewer who has not
 * opened the stream. Renders `fallback` until the first frame arrives (the
 * sharer's first one goes out a couple of seconds into the share).
 */
export function StreamPreviewImage({
  lobbyId,
  userId,
  className,
  fallback = null,
}: {
  lobbyId: string;
  userId: string;
  className: string;
  fallback?: ReactNode;
}) {
  const image = useStreamPreview(lobbyId, userId);
  if (!image) {
    return <>{fallback}</>;
  }
  return <img className={className} src={image} alt="" draggable={false} />;
}
