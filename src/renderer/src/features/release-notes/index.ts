// What changed in this release, and the dialog that says so once after an
// update. The changelog itself is release-notes.ts — that is the one file a
// release touches.
export { WhatsNewModal } from "./whats-new-modal";
export {
  RELEASE_NOTES,
  compareVersions,
  notesSince,
  readLastSeenVersion,
  saveLastSeenVersion,
  type ReleaseNote,
  type ReleaseHighlight,
  type ReleaseHighlightKind,
} from "./release-notes";
