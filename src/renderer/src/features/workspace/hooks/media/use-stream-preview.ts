import { useEffect, useState, type MutableRefObject } from "react";
import workspaceService from "../../services";

// Stream previews: while you share your screen in a room, a small JPEG of it
// goes to the server every 20 s; anyone who can see the room gets the newest
// one before deciding to watch (the unwatched stage tile, the room list).
// Call rooms (call_) have no previews: the other party is already looking.

const PREVIEW_WIDTH = 480;
const PREVIEW_QUALITY = 0.72;
const FIRST_FRAME_DELAY_MS = 2_000;
const PREVIEW_INTERVAL_MS = 20_000;

/**
 * One frame of a live video track as a JPEG data URL, at preview size.
 *
 * A clone of the track feeds a detached <video>: the share itself is never
 * touched, and the clone stops as soon as the frame is drawn. Not the stage
 * tile's own <video>, which pauses while the window is in the background.
 */
export const captureTrackFrame = async (track: MediaStreamTrack): Promise<string | null> => {
  if (track.readyState !== "live") {
    return null;
  }
  const clone = track.clone();
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([clone]);
  try {
    await video.play();
    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(resolve, 1_000);
      video.requestVideoFrameCallback(() => {
        window.clearTimeout(timeout);
        resolve();
      });
    });
    if (!video.videoWidth || !video.videoHeight) {
      return null;
    }
    const width = Math.min(PREVIEW_WIDTH, video.videoWidth);
    const height = Math.round((width * video.videoHeight) / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }
    context.drawImage(video, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", PREVIEW_QUALITY);
  } catch {
    return null;
  } finally {
    video.pause();
    video.srcObject = null;
    clone.stop();
  }
};

/**
 * Posts previews of the local share for as long as it runs. Restarts with a
 * new stream (a source or quality swap), stops with the share. The room is read
 * from the ref when the share starts: leaving a room ends the share anyway.
 */
export const useStreamPreviewPublisher = (
  stream: MediaStream | null,
  activeLobbyRef: MutableRefObject<string | null>,
): void => {
  useEffect(() => {
    const track = stream?.getVideoTracks()[0];
    const lobbyId = activeLobbyRef.current;
    if (!track || !lobbyId || lobbyId.startsWith("call_")) {
      return;
    }
    let cancelled = false;
    const publish = async (): Promise<void> => {
      const image = await captureTrackFrame(track);
      if (cancelled || !image) {
        return;
      }
      // A refusal (the roster not yet saying "sharing", the feature off in
      // this room) only means no preview this time.
      await workspaceService.postStreamPreview({ lobbyId, image });
    };
    const first = window.setTimeout(() => void publish(), FIRST_FRAME_DELAY_MS);
    const interval = window.setInterval(() => void publish(), PREVIEW_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [stream, activeLobbyRef]);
};

/**
 * The newest preview of someone's share, refreshed while mounted. Mount it
 * only where it shows: every mounted copy polls.
 */
export const useStreamPreview = (lobbyId: string, userId: string): string | null => {
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    setImage(null);
    let cancelled = false;
    const load = async (): Promise<void> => {
      const result = await workspaceService.getStreamPreview({ lobbyId, userId });
      // Keep the last frame through a failed refresh; the share ending removes
      // the place this is drawn in anyway.
      if (!cancelled && result.ok && result.data) {
        setImage(result.data.image);
      }
    };
    void load();
    const interval = window.setInterval(() => void load(), PREVIEW_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [lobbyId, userId]);

  return image;
};
