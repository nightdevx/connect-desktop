/**
 * What a face without a picture shows: a person's outline (Lucide "user"), in
 * the face's own colour (hueStyle) like the rest of it. Sized by the face's
 * font size, or by antd's Avatar box when it is that Avatar's icon.
 */
export const BlankFace = () => (
  <svg
    className="ct-avatar-blank"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
