import type { ReactNode } from "react";
import { segmentMessageBody } from "./chat-links";

// Everything @mention: matching, highlighting, and "was I named".
//
// This used to live inside users-direct-messages-panel.tsx, so lobby messages
// rendered a mention as ordinary text and `mentionsUser` — already written and
// exported there — had no caller at all. Being named in a room did nothing.

// Deliberately wider than the username rules (which are [a-z0-9_.-] only):
// someone typing "@Ayşe" should still see it highlighted rather than have it
// silently blend into the sentence. Matching against a real account is done by
// comparison below, not by this pattern.
export const MENTION_PATTERN =
  /(@[A-Za-z0-9_çğıİöşüÇĞÖŞÜ.-]{2,64})/g;

// The token being typed, anchored to the caret: "@" must start the message or
// follow whitespace, so an e-mail address does not open the picker.
const ACTIVE_MENTION_PATTERN = /(?:^|\s)@([A-Za-z0-9_çğıİöşüÇĞÖŞÜ.-]*)$/;

const lower = (value: string): string => value.toLocaleLowerCase("tr-TR");

export interface MentionCandidate {
  userId: string;
  username: string;
  displayName?: string;
  // Nullable because the directory returns null for a user with no avatar.
  avatarUrl?: string | null;
}

/** Renders @name runs as highlighted spans, marking the ones aimed at you. */
const renderMentionRuns = (
  text: string,
  self: string,
  keyPrefix: string,
): ReactNode[] => {
  return text.split(MENTION_PATTERN).map((part, index) => {
    if (!part.startsWith("@")) {
      return part;
    }

    return (
      <span
        key={`${keyPrefix}-${index}-${part}`}
        className={`ct-chat-mention ${lower(part) === self ? "self" : ""}`}
      >
        {part}
      </span>
    );
  });
};

/**
 * One pass over a message body: links become anchors, @names become mentions.
 *
 * Links used to render as plain text, so the only way to follow one was to
 * select it, copy it and paste it into a browser by hand. They are anchors
 * now; the window's own open handler (installNavigationGuards in the main
 * process) sends http(s) to the OS browser and denies everything else, so
 * there is no new IPC here and no way to navigate the app's own window away
 * from its bundle.
 *
 * Links are matched FIRST, so an address containing an "@" — a mailto-looking
 * path, a userinfo host — is not chopped into a mention run mid-href.
 */
export const renderMessageBody = (
  body: string,
  currentUsername: string,
): ReactNode[] => {
  const self = `@${lower(currentUsername)}`;

  return segmentMessageBody(body).flatMap((segment): ReactNode[] => {
    if (segment.kind === "text") {
      return renderMentionRuns(segment.value, self, `t${segment.offset}`);
    }

    return [
      <a
        key={`l${segment.offset}`}
        className="ct-chat-link"
        href={segment.href}
        target="_blank"
        rel="noreferrer noopener"
        title={segment.href}
      >
        {segment.value}
      </a>,
    ];
  });
};

/**
 * Was this user named in the message?
 *
 * Drives the one notification that ignores "Rahatsız etmeyin": being addressed
 * directly is the case that setting is not meant to silence.
 */
export const mentionsUser = (body: string, username: string): boolean => {
  if (!username.trim()) {
    return false;
  }

  const needle = `@${lower(username)}`;
  const found: string[] = lower(body).match(MENTION_PATTERN) ?? [];
  return found.includes(needle);
};

export interface ActiveMention {
  /** Text typed after the "@", possibly empty right after typing it. */
  query: string;
  /** Index of the "@" in the draft. */
  start: number;
  /** Caret position, i.e. the end of the token being replaced. */
  end: number;
}

/** The @token the caret currently sits in, or null. */
export const findActiveMention = (
  draft: string,
  caret: number,
): ActiveMention | null => {
  const before = draft.slice(0, caret);
  const match = ACTIVE_MENTION_PATTERN.exec(before);

  if (!match) {
    return null;
  }

  return {
    query: match[1],
    // match.index points at the whitespace when there is one, so the "@" is the
    // token's own length back from the caret.
    start: caret - match[1].length - 1,
    end: caret,
  };
};

/** Candidates whose username or display name starts with what was typed. */
export const filterMentionCandidates = (
  candidates: MentionCandidate[],
  query: string,
  limit = 8,
): MentionCandidate[] => {
  const needle = lower(query);

  const seen = new Set<string>();
  const matches = candidates.filter((candidate) => {
    if (seen.has(candidate.userId)) {
      return false;
    }
    seen.add(candidate.userId);

    if (!needle) {
      return true;
    }

    return (
      lower(candidate.username).startsWith(needle) ||
      lower(candidate.displayName ?? "").startsWith(needle)
    );
  });

  return matches.slice(0, limit);
};

/**
 * Replaces the active @token with a real username.
 *
 * The trailing space is what makes "@ayse @mehmet" work without the user
 * having to type one: the next "@" then follows whitespace, which is what
 * findActiveMention requires to open the picker again.
 */
export const applyMention = (
  draft: string,
  active: ActiveMention,
  username: string,
): { value: string; caret: number } => {
  const inserted = `@${username} `;
  return {
    value: draft.slice(0, active.start) + inserted + draft.slice(active.end),
    caret: active.start + inserted.length,
  };
};
