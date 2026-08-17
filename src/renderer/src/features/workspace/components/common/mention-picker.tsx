import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
import type { InputRef } from "antd";
import {
  applyMention,
  filterMentionCandidates,
  findActiveMention,
  type MentionCandidate,
} from "../../mentions";
import { getDisplayInitials } from "../../workspace-utils";

// A stable empty result, so "no active mention" does not mint a new array — and
// therefore a new memo identity — on every keystroke.
const EMPTY_MATCHES: MentionCandidate[] = [];

interface UseMentionPickerParams {
  draft: string;
  onDraftChange: (value: string) => void;
  candidates: MentionCandidate[];
  inputRef: RefObject<InputRef>;
}

interface UseMentionPickerResult {
  isOpen: boolean;
  matches: MentionCandidate[];
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  choose: (candidate: MentionCandidate) => void;
  /** Wrap the composer's own key handler: returns true when it consumed the key. */
  handleKeyDown: (event: KeyboardEvent<HTMLInputElement>) => boolean;
  close: () => void;
  /** Call after every draft edit so the picker tracks the caret. */
  syncCaret: () => void;
}

/**
 * Drives the @mention picker for a composer.
 *
 * The caret is read off the DOM node rather than tracked in React state: antd's
 * Input is controlled by the panel's draft, and a state-held caret lags a frame
 * behind the value it belongs to — which put the popup one keystroke out of
 * date on fast typing.
 */
export const useMentionPicker = ({
  draft,
  onDraftChange,
  candidates,
  inputRef,
}: UseMentionPickerParams): UseMentionPickerResult => {
  const [caret, setCaret] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const syncCaret = useCallback((): void => {
    const element = inputRef.current?.input;
    setCaret(element?.selectionStart ?? draft.length);
    setDismissed(false);
  }, [draft.length, inputRef]);

  // Memoised, both of them. A fresh array literal per render is a fresh
  // identity, so anything depending on `matches` re-ran every render — and
  // depending on `matches.length` instead only hid that from the linter rather
  // than fixing it.
  const active = useMemo(
    () => (dismissed ? null : findActiveMention(draft, caret)),
    [caret, dismissed, draft],
  );
  const matches = useMemo(
    () =>
      active ? filterMentionCandidates(candidates, active.query) : EMPTY_MATCHES,
    [active, candidates],
  );
  const isOpen = active !== null && matches.length > 0;

  // A shrinking result list must not leave the highlight past the end.
  useEffect(() => {
    setActiveIndex((current) => (current < matches.length ? current : 0));
  }, [matches]);

  const close = useCallback((): void => {
    setDismissed(true);
    setActiveIndex(0);
  }, []);

  // Written to on choose, read by the effect below: setting the caret has to
  // happen after React has re-rendered the input with the new value, or the
  // browser puts it back at the end of the old one.
  const pendingCaretRef = useRef<number | null>(null);

  useEffect(() => {
    const target = pendingCaretRef.current;
    if (target === null) {
      return;
    }
    pendingCaretRef.current = null;

    const element = inputRef.current?.input;
    element?.focus();
    element?.setSelectionRange(target, target);
    setCaret(target);
  }, [draft, inputRef]);

  const choose = useCallback(
    (candidate: MentionCandidate): void => {
      const target = findActiveMention(draft, caret);
      if (!target) {
        return;
      }

      const next = applyMention(draft, target, candidate.username);
      pendingCaretRef.current = next.caret;
      setActiveIndex(0);
      onDraftChange(next.value);
    },
    [caret, draft, onDraftChange],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>): boolean => {
      if (!isOpen) {
        return false;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActiveIndex(
          (current) => (current + step + matches.length) % matches.length,
        );
        return true;
      }

      // Enter picks instead of sending: with the list open, the message is not
      // what the user is aiming at.
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        choose(matches[activeIndex] ?? matches[0]);
        return true;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return true;
      }

      return false;
    },
    [activeIndex, choose, close, isOpen, matches],
  );

  return {
    isOpen,
    matches,
    activeIndex,
    setActiveIndex,
    choose,
    handleKeyDown,
    close,
    syncCaret,
  };
};

interface MentionPickerProps {
  isOpen: boolean;
  matches: MentionCandidate[];
  activeIndex: number;
  onHover: (index: number) => void;
  onChoose: (candidate: MentionCandidate) => void;
}

export function MentionPicker({
  isOpen,
  matches,
  activeIndex,
  onHover,
  onChoose,
}: MentionPickerProps): JSX.Element | null {
  if (!isOpen) {
    return null;
  }

  return (
    <ul className="ct-mention-popup" role="listbox" aria-label="Bahsedilecek kişiler">
      {matches.map((candidate, index) => (
        <li
          key={candidate.userId}
          role="option"
          aria-selected={index === activeIndex}
          className={`ct-mention-option ${index === activeIndex ? "active" : ""}`}
          onMouseEnter={() => onHover(index)}
          // mousedown, not click: the composer input loses focus on mousedown,
          // and a blur that closes the popup would remove the row before the
          // click ever lands on it.
          onMouseDown={(event) => {
            event.preventDefault();
            onChoose(candidate);
          }}
        >
          <span className="ct-mention-avatar" aria-hidden="true">
            {candidate.avatarUrl ? (
              <img src={candidate.avatarUrl} alt="" />
            ) : (
              getDisplayInitials(candidate.displayName || candidate.username)
            )}
          </span>
          <span className="ct-mention-name">
            {candidate.displayName || candidate.username}
          </span>
          <span className="ct-mention-handle">@{candidate.username}</span>
        </li>
      ))}
    </ul>
  );
}
