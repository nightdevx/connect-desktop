// A screen share's capture can die behind the app's back: livekit stops tracks
// it unpublishes, and a programmatic stop() fires no "ended" event. Republishing
// such a stream shows viewers an empty share, so only live tracks are used.
export function usableScreenTracks(
  stream: MediaStream | null,
): { video: MediaStreamTrack; audio: MediaStreamTrack[] } | null {
  const video = stream?.getVideoTracks()[0];
  if (!stream || !video || video.readyState !== "live") return null;
  return { video, audio: stream.getAudioTracks().filter((t) => t.readyState === "live") };
}
