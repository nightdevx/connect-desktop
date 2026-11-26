// Pure rules for stream previews, kept apart from React so a script can test them.

// The server drops a preview after 2 minutes; an unchanged frame is re-sent
// well inside that so a still, live share keeps its preview.
const RESEND_UNCHANGED_AFTER_MS = 60_000;

/** Polls `load` every `intervalMs` while visible; fetches at once when shown again. */
export const startPreviewPoll = ({
  load,
  isHidden,
  onVisibilityChange,
  intervalMs,
}: {
  load: () => void;
  isHidden: () => boolean;
  onVisibilityChange: (callback: () => void) => () => void;
  intervalMs: number;
}): (() => void) => {
  if (!isHidden()) {
    load();
  }
  const timer = setInterval(() => {
    if (!isHidden()) {
      load();
    }
  }, intervalMs);
  const unsubscribe = onVisibilityChange(() => {
    if (!isHidden()) {
      load();
    }
  });
  return () => {
    clearInterval(timer);
    unsubscribe();
  };
};

export const shouldPostPreview = (
  image: string,
  last: { image: string; atMs: number } | null,
  nowMs: number,
): boolean => last === null || last.image !== image || nowMs - last.atMs >= RESEND_UNCHANGED_AFTER_MS;
