import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Modal } from "antd";
import { GiftOutlined } from "@ant-design/icons";
import { MODAL_WIDTH, ModalHeading } from "@/ui/modal-heading";
import {
  RELEASE_HIGHLIGHT_LABELS,
  notesSince,
  notesUpTo,
  readLastSeenVersion,
  saveLastSeenVersion,
  type ReleaseHighlightKind,
  type ReleaseNote,
} from "./release-notes";

interface WhatsNewModalProps {
  /** app.getVersion(), or null while the round trip is still in flight. */
  version: string | null | undefined;
  /**
   * Whether this is a moment to interrupt somebody.
   *
   * The dialog is deliberately NOT shown over the login card or the boot
   * placeholder: what changed in the app is of no use to somebody who has not
   * got into it yet, and a modal over the password field is the worst place
   * this could possibly open.
   */
  enabled: boolean;
  /**
   * Opened by hand from the question-mark button beside the version, which
   * shows the whole changelog rather than only what is new. Kept in the parent
   * so the button and the dialog are not two components apart from each other.
   */
  manualOpen?: boolean;
  onManualOpenChange?: (open: boolean) => void;
}

const DATE_FORMAT = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const formatDate = (iso: string): string => {
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? DATE_FORMAT.format(parsed) : iso;
};

// "31 Eki 2026": short enough to sit on the same line as the version in the
// tab list, which keeps a row one line tall.
const SHORT_DATE_FORMAT = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const KINDS = Object.keys(RELEASE_HIGHLIGHT_LABELS) as ReleaseHighlightKind[];

/**
 * One release: its version and date, then its lines grouped by kind.
 *
 * Grouped rather than in the order they were written, with the kind said once
 * as a heading instead of as a coloured tag on every line: five tags in three
 * colours down the left edge were the loudest thing in the dialog, and the
 * sentences beside them — the part anybody opens it for — had to fit in what
 * was left.
 */
function ReleaseSection({ note }: { note: ReleaseNote }) {
  return (
    <section className="ct-whats-new-release">
      <header className="ct-whats-new-release-head">
        <h2 className="ct-whats-new-version">v{note.version}</h2>
        <span className="ct-whats-new-date">{formatDate(note.date)}</span>
      </header>

      {note.summary ? (
        <p className="ct-whats-new-summary">{note.summary}</p>
      ) : null}

      {KINDS.map((kind) => {
        const lines = note.highlights.filter((highlight) => highlight.kind === kind);
        if (lines.length === 0) {
          return null;
        }

        // data-kind, not a second class name: the kinds are `new`, `improved`
        // and `fixed`, and `fixed` is a TAILWIND UTILITY — `position: fixed`.
        // As a class it took the element out of flow.
        return (
          <div key={kind} className="ct-whats-new-group" data-kind={kind}>
            <h3 className="ct-whats-new-group-title">
              {RELEASE_HIGHLIGHT_LABELS[kind]}
            </h3>
            <ul className="ct-whats-new-list">
              {lines.map((highlight, index) => (
                // Nothing in a line is unique on its own — two releases can
                // carry the same sentence — so its place in the group is the
                // identity. The list is static once open.
                <li key={`${kind}-${index}`} className="ct-whats-new-item">
                  {highlight.text}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

/**
 * The dialog's body.
 *
 * After an update, every release since the last one seen is stacked in one
 * scroll, newest first. That dialog exists to say what changed while somebody
 * was away, so none of it sits behind a click: the seen-marker has already
 * moved by the time it is open, and a release hidden behind a list row would be
 * a release they never read.
 *
 * Opened by hand it is the whole changelog — twenty releases and over a hundred
 * lines — and there the versions are tabs down the left with one release read
 * at a time; as one scroll there was no way to find a version except to scroll
 * past all the others.
 *
 * Its own component so the picked version lives inside the modal, which
 * `destroyOnHidden` throws away: every opening starts on the newest release.
 */
function WhatsNewBody({ notes, browse }: { notes: ReleaseNote[]; browse: boolean }) {
  const [pickedVersion, setPickedVersion] = useState(notes[0].version);
  const tabsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const idBase = useId();

  if (!browse || notes.length === 1) {
    return (
      <div className="ct-whats-new-body">
        {notes.map((note) => (
          <ReleaseSection key={note.version} note={note} />
        ))}
      </div>
    );
  }

  const pickedIndex = Math.max(
    0,
    notes.findIndex((note) => note.version === pickedVersion),
  );
  const picked = notes[pickedIndex];
  const tabId = (index: number): string => `${idBase}-tab-${index}`;
  const panelId = `${idBase}-panel`;

  // A vertical tab list: Tab enters it once and leaves it once, the arrows
  // move through it, and the release follows the focus — reading the next one
  // is a single key, not a Tab and an Enter.
  const moveTo = (index: number): void => {
    const next = Math.min(Math.max(index, 0), notes.length - 1);
    setPickedVersion(notes[next].version);
    tabsRef.current[next]?.focus();
  };
  const KEY_MOVES: Record<string, number> = {
    ArrowDown: pickedIndex + 1,
    ArrowUp: pickedIndex - 1,
    Home: 0,
    End: notes.length - 1,
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const target = KEY_MOVES[event.key];
    if (target === undefined) {
      return;
    }
    event.preventDefault();
    moveTo(target);
  };

  return (
    <div className="ct-whats-new-body browse">
      <div
        className="ct-whats-new-versions"
        role="tablist"
        aria-orientation="vertical"
        aria-label="Sürümler"
        onKeyDown={handleKeyDown}
      >
        {notes.map((note, index) => (
          <button
            key={note.version}
            ref={(element) => {
              tabsRef.current[index] = element;
            }}
            id={tabId(index)}
            type="button"
            role="tab"
            aria-selected={index === pickedIndex}
            aria-controls={panelId}
            tabIndex={index === pickedIndex ? 0 : -1}
            className="ct-whats-new-version-tab"
            onClick={() => setPickedVersion(note.version)}
          >
            <span className="ct-whats-new-version-tab-name">v{note.version}</span>
            <span className="ct-whats-new-version-tab-date">
              {SHORT_DATE_FORMAT.format(Date.parse(note.date))}
            </span>
          </button>
        ))}
      </div>

      {/* Keyed on the version, so a new pick is a new scroll box: it opens at
          its top, not wherever the previous release was left. */}
      <div
        key={picked.version}
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId(pickedIndex)}
        tabIndex={0}
        className="ct-whats-new-detail"
      >
        <ReleaseSection note={picked} />
      </div>
    </div>
  );
}

/**
 * "Yenilikler" — what changed, shown once after an update.
 *
 * The decision is made once, on the first render where both the version and a
 * usable moment are available, and then never revisited: `pending` is state, not
 * a value derived on every render, so dismissing the dialog cannot re-open it
 * and a version query settling a second time cannot either.
 *
 * The seen-marker is written when the dialog OPENS rather than when it closes.
 * Closing is not the only way out of a modal — the window can be shut, the app
 * can crash, the updater can restart it — and every one of those used to be a
 * way to be shown the same notes again on the next launch.
 */
export function WhatsNewModal({
  version,
  enabled,
  manualOpen = false,
  onManualOpenChange,
}: WhatsNewModalProps) {
  const [notes, setNotes] = useState<ReleaseNote[] | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isDecided, setIsDecided] = useState(false);

  useEffect(() => {
    // `useAuthController` reports the version as "-" when the round trip has not
    // answered — or has failed. Writing that as the seen-marker would record a
    // release that does not exist and compare the next launch against it.
    if (isDecided || !enabled || !version || !/^\d/.test(version.trim())) {
      return;
    }

    setIsDecided(true);

    const pending = notesSince(version, readLastSeenVersion());
    // The marker moves even when there is nothing to show: a release with no
    // changelog entry still has to count as seen, or the NEXT release would be
    // compared against a version from months ago and replay everything since.
    saveLastSeenVersion(version);

    if (pending.length === 0) {
      return;
    }

    setNotes(pending);
    setIsOpen(true);
  }, [enabled, version, isDecided]);

  // Opening it by hand reads the whole changelog; the automatic one reads only
  // what arrived since the last launch. Neither writes the seen-marker again:
  // the automatic path already moved it, and re-reading old notes on purpose
  // must not change what the next update is compared against.
  const shown = manualOpen ? notesUpTo(version) : notes;
  const close = (): void => {
    if (manualOpen) {
      onManualOpenChange?.(false);
      return;
    }
    setIsOpen(false);
  };

  if (!shown || shown.length === 0) {
    return null;
  }

  return (
    <Modal
      rootClassName="ct-modal"
      title={
        <ModalHeading
          icon={<GiftOutlined />}
          title="Yenilikler"
          description={
            manualOpen
              ? "Bütün sürümlerde neler değişti."
              : "Son güncellemelerde neler değişti."
          }
        />
      }
      open={manualOpen || isOpen}
      onCancel={close}
      onOk={close}
      okText={manualOpen ? "Kapat" : "Anladım"}
      cancelButtonProps={{ style: { display: "none" } }}
      width={MODAL_WIDTH.l}
      destroyOnHidden
    >
      <WhatsNewBody notes={shown} browse={manualOpen} />
    </Modal>
  );
}
