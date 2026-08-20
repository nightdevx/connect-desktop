import { useEffect, useState } from "react";
import { Modal } from "antd";
import { GiftOutlined } from "@ant-design/icons";
import {
  RELEASE_HIGHLIGHT_LABELS,
  notesSince,
  readLastSeenVersion,
  saveLastSeenVersion,
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
export function WhatsNewModal({ version, enabled }: WhatsNewModalProps) {
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

  if (!notes) {
    return null;
  }

  return (
    <Modal
      rootClassName="ct-modal"
      title={
        <span className="ct-modal-title-icon">
          <GiftOutlined />
          Yenilikler
        </span>
      }
      open={isOpen}
      onCancel={() => setIsOpen(false)}
      onOk={() => setIsOpen(false)}
      okText="Anladım"
      cancelButtonProps={{ style: { display: "none" } }}
      width={560}
      destroyOnHidden
    >
      <div className="ct-whats-new-body">
        {notes.map((note) => (
          <section key={note.version} className="ct-whats-new-release">
            <header className="ct-whats-new-release-head">
              <span className="ct-whats-new-version">v{note.version}</span>
              <span className="ct-whats-new-date">{formatDate(note.date)}</span>
            </header>

            {note.summary ? (
              <p className="ct-whats-new-summary">{note.summary}</p>
            ) : null}

            <ul className="ct-whats-new-list">
              {note.highlights.map((highlight, index) => (
                <li
                  // Nothing in a highlight is unique on its own — two releases
                  // can carry the same sentence — so the position within its
                  // release is the identity. The list is static once open.
                  key={`${note.version}-${index}`}
                  className="ct-whats-new-item"
                >
                  {/* data-kind, not a second class name: the kinds are `new`,
                      `improved` and `fixed`, and `fixed` is a TAILWIND UTILITY
                      — `position: fixed`. As a class it took the tag out of
                      flow and dropped it on top of its own sentence. */}
                  <span className="ct-whats-new-tag" data-kind={highlight.kind}>
                    {RELEASE_HIGHLIGHT_LABELS[highlight.kind]}
                  </span>
                  <span className="ct-whats-new-text">{highlight.text}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}
