// Finding the links in a message body.
//
// Split out of mentions.tsx so it can be checked without React: this is index
// arithmetic over user-supplied text, which is exactly the kind of code that
// mangles a message by one character and is never noticed until someone pastes
// an address into a room.

// A pasted address, in the two forms people actually write. Bare domains
// ("ornek.com") are deliberately NOT matched: "dosya.txt" and "3.14" are far
// more common in a chat than a scheme-less link, and turning those into
// clickable links is worse than leaving one link unclicked.
//
// Angle brackets and whitespace end the run; the punctuation of the sentence
// around it is trimmed below rather than swallowed into the href.
const LINK_PATTERN = /(?:https?:\/\/|www\.)[^\s<>]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?'"»)\]}]+$/;

/** www.ornek.com is a link the OS browser cannot open without a scheme. */
export const hrefForUrl = (raw: string): string =>
  /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

/**
 * Drops the sentence's punctuation from the end of a matched address.
 *
 * "(bkz. https://ornek.com/a)" must not put the closing bracket in the href —
 * but an address that opens its own bracket, as Wikipedia's do, keeps it.
 */
export const trimUrlTail = (raw: string): string => {
  let url = raw;

  for (;;) {
    const next = url.replace(TRAILING_PUNCTUATION, "");
    if (next === url) {
      return url;
    }

    const dropped = url.slice(next.length);
    const opens = next.match(/\(/g)?.length ?? 0;
    const closes = next.match(/\)/g)?.length ?? 0;
    if (dropped === ")" && opens > closes) {
      return url;
    }

    url = next;
  }
};

export type MessageSegment =
  | { kind: "text"; value: string; offset: number }
  | { kind: "link"; value: string; href: string; offset: number };

/**
 * Splits a message into plain runs and link runs, in order.
 *
 * Links are found FIRST, before mentions, so an address containing an "@" — a
 * userinfo host, a mailto-looking path — is not chopped in half by the mention
 * pass. `offset` is the position in the original body, and it is what the
 * renderer keys on: two identical links in one message must not collide.
 */
export const segmentMessageBody = (body: string): MessageSegment[] => {
  const segments: MessageSegment[] = [];
  let cursor = 0;

  LINK_PATTERN.lastIndex = 0;
  for (
    let match = LINK_PATTERN.exec(body);
    match !== null;
    match = LINK_PATTERN.exec(body)
  ) {
    const start = match.index;
    const url = trimUrlTail(match[0]);

    if (start > cursor) {
      segments.push({
        kind: "text",
        value: body.slice(cursor, start),
        offset: cursor,
      });
    }

    segments.push({
      kind: "link",
      value: url,
      href: hrefForUrl(url),
      offset: start,
    });

    cursor = start + url.length;
    // The match may have run past the trimmed end; resume from the trim so the
    // punctuation we gave back is still rendered as text.
    LINK_PATTERN.lastIndex = cursor;
  }

  if (cursor < body.length) {
    segments.push({ kind: "text", value: body.slice(cursor), offset: cursor });
  }

  return segments;
};
