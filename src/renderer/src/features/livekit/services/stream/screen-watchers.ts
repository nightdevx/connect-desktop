// Who is watching whose screen share.
//
// Nothing in WebRTC tells a publisher who subscribed: subscription is a
// receiver-side decision the SFU never reports back, so the only way for the
// person sharing to know that anybody is actually looking is for the viewers to
// say so. Each client broadcasts the list of shares it is currently watching on
// the room's data channel, and every client assembles the same answer from the
// lists it has received.
//
// Broadcast as WHOLE STATE rather than as join/leave deltas. A delta stream has
// to be replayed from the beginning to be correct, and a client that misses one
// frame — because it connected a second later, or because an unreliable packet
// was dropped — stays wrong forever. A full list is idempotent: the last one
// received is the truth, whatever happened before it.
//
// The payload carries no user data beyond identities the receiver can already
// enumerate from the room, so a forged frame can at worst misreport who is
// watching. It is still bounded and validated here, because a data channel is
// remote input and the parsed result is rendered.

/** Marks our frames on a channel any participant can publish to. */
export const SCREEN_WATCH_TOPIC = "ct.screen-watch";

/** More shares than anyone can watch at once; a longer list is not a client. */
const MAX_TARGETS = 32;
/** LiveKit identities are user ids; this is well past the longest real one. */
const MAX_IDENTITY_LENGTH = 128;

interface ScreenWatchFrame {
  t: typeof SCREEN_WATCH_TOPIC;
  /** Protocol version, so a future shape can be told from this one. */
  v: 1;
  /** Identities whose screen share the sender is watching right now. */
  targets: string[];
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const normalizeIdentity = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_IDENTITY_LENGTH) {
    return null;
  }
  return trimmed;
};

/** The whole current watch list of this client, ready to publish. */
export const encodeWatchState = (targets: Iterable<string>): Uint8Array => {
  const unique: string[] = [];
  for (const target of targets) {
    const identity = normalizeIdentity(target);
    if (identity && !unique.includes(identity)) {
      unique.push(identity);
    }
    if (unique.length >= MAX_TARGETS) {
      break;
    }
  }

  const frame: ScreenWatchFrame = {
    t: SCREEN_WATCH_TOPIC,
    v: 1,
    targets: unique,
  };
  return encoder.encode(JSON.stringify(frame));
};

/**
 * The targets in a received frame, or null when the payload is not one of ours.
 *
 * Null and an empty array mean different things and both happen constantly:
 * null is "somebody else's message, ignore it", `[]` is "this viewer stopped
 * watching everything", which has to clear their entry.
 */
export const decodeWatchState = (payload: Uint8Array): string[] | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(payload));
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const frame = parsed as Partial<ScreenWatchFrame>;
  if (frame.t !== SCREEN_WATCH_TOPIC || frame.v !== 1) {
    return null;
  }
  if (!Array.isArray(frame.targets)) {
    return null;
  }

  const targets: string[] = [];
  for (const entry of frame.targets.slice(0, MAX_TARGETS)) {
    const identity = normalizeIdentity(entry);
    if (identity && !targets.includes(identity)) {
      targets.push(identity);
    }
  }
  return targets;
};

/** Viewer identity -> the shares that viewer is watching. */
export type WatchStateByViewer = ReadonlyMap<string, readonly string[]>;

/** Share owner identity -> everyone watching it, this client included. */
export type ScreenWatcherMap = Record<string, string[]>;

/**
 * Turns "who watches what" inside out into "who is watching me".
 *
 * The local client's own list is merged in here rather than kept separately, so
 * the count under a share is the same number for the person sharing and for the
 * people watching it — including the reader's own presence in it.
 */
export const buildWatcherMap = (
  byViewer: WatchStateByViewer,
  localIdentity: string,
  localTargets: Iterable<string>,
): ScreenWatcherMap => {
  const watchers = new Map<string, Set<string>>();

  const add = (target: string, viewer: string): void => {
    // Watching your own share is not a thing anyone does — the preview is
    // local — but a client that claims it would otherwise inflate its own
    // audience.
    if (!target || !viewer || target === viewer) {
      return;
    }
    const existing = watchers.get(target);
    if (existing) {
      existing.add(viewer);
      return;
    }
    watchers.set(target, new Set([viewer]));
  };

  for (const [viewer, targets] of byViewer) {
    for (const target of targets) {
      add(target, viewer);
    }
  }

  const local = normalizeIdentity(localIdentity);
  if (local) {
    for (const target of localTargets) {
      add(target, local);
    }
  }

  const result: ScreenWatcherMap = {};
  for (const [target, viewers] of watchers) {
    // Sorted so an unchanged audience produces an identical array every time
    // and the equality check below can stay a string comparison.
    result[target] = [...viewers].sort();
  }
  return result;
};

/** Whether two maps describe the same audiences, ignoring key order. */
export const watcherMapsEqual = (
  left: ScreenWatcherMap,
  right: ScreenWatcherMap,
): boolean => {
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) {
    return false;
  }
  return leftKeys.every((key) => {
    const a = left[key];
    const b = right[key];
    return (
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((viewer, index) => viewer === b[index])
    );
  });
};
