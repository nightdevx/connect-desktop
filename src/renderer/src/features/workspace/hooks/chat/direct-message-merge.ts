import type { ChatMessage } from "@shared/auth-contracts";

/**
 * Folding a freshly fetched newest page back into a thread the user has already
 * paged through.
 *
 * The direct-message query always asks for the newest 120, and it owns the same
 * React Query entry the "load older" pages are prepended into. So every refetch
 * — the reconnect backfill, a stale remount — arrives holding only part of what
 * is on screen, and what it does with the rest is the whole correctness story:
 *
 *   * drop the older half and the history the user scrolled back for vanishes
 *     mid-read, which is the bug this was written for;
 *   * drop the newer half and a message the socket delivered while the request
 *     was in flight is lost for good, because the socket carries no backlog;
 *   * keep the newer half by TIMESTAMP and a message deleted while the socket
 *     was down comes back from the dead every time — its delete event never
 *     arrived, so it looks new forever.
 *
 * Hence `inFlightBefore`: the ids the entry held when the request left. Anything
 * in the cache that is missing from it arrived during the request and is the
 * only thing the server could not have known about.
 */
export interface DirectMessageMergeInput {
  /** Everything currently in the cache entry, oldest first. */
  cached: ChatMessage[];
  /** The page the server just returned, oldest first. */
  fresh: ChatMessage[];
  /** Ids the cache entry held when the request was sent. */
  inFlightBefore: ReadonlySet<string>;
}

export const mergeDirectMessagePages = ({
  cached,
  fresh,
  inFlightBefore,
}: DirectMessageMergeInput): ChatMessage[] => {
  const oldestFresh = fresh[0];
  if (cached.length === 0 || !oldestFresh) {
    return fresh;
  }

  const known = new Set(fresh.map((message) => message.id));

  // The older pages. `<=` and not `<`: two messages can share a timestamp, and
  // the id check above already excludes everything the page actually carried.
  const kept = cached.filter(
    (message) =>
      !known.has(message.id) && message.createdAt <= oldestFresh.createdAt,
  );
  const keptIds = new Set(kept.map((message) => message.id));

  // ...and whatever landed while the request was in flight.
  const tail = cached.filter(
    (message) =>
      !known.has(message.id) &&
      !keptIds.has(message.id) &&
      !inFlightBefore.has(message.id),
  );

  if (kept.length === 0 && tail.length === 0) {
    return fresh;
  }

  return [...kept, ...fresh, ...tail];
};
