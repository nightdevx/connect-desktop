// Avatars and banners by address instead of inside the JSON.
//
// From core.DesktopPictureURLVersion on, the backend leaves the base64 pictures
// out of /auth/users rows and profile events and sends avatarVersion and
// bannerVersion (16 hex) instead; the bytes are at
// GET /auth/users/{id}/avatar|banner?v=<version>. Older backends, and the
// single-user routes for now, still send the base64.
//
// Every <img> in the app reads avatarUrl / bannerUrl, so this fills those with
// an address the main process answers (picture-protocol.ts: the bearer token
// and an on-disk cache keyed by id and version) wherever a version came without
// a picture. A base64 picture that did come is left as it is.
//
// Pure, so the main process, the stream host and the self-check share it.

export const PICTURE_SCHEME = "connect-picture";

export type PictureKind = "avatar" | "banner";

const VERSION_PATTERN = /^[0-9a-f]{16}$/i;
// User ids are UUIDs; anything else never becomes a file name.
const USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export const pictureUrl = (kind: PictureKind, userId: string, version: string): string =>
  `${PICTURE_SCHEME}://${kind}/${encodeURIComponent(userId)}?v=${encodeURIComponent(version)}`;

export interface PictureRequest {
  kind: PictureKind;
  userId: string;
  version: string;
}

/** The picture an address names, or null for anything this app did not mint. */
export const parsePictureUrl = (raw: string): PictureRequest | null => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const kind = url.hostname;
  const userId = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const version = url.searchParams.get("v") ?? "";
  if (
    url.protocol !== `${PICTURE_SCHEME}:` ||
    (kind !== "avatar" && kind !== "banner") ||
    !USER_ID_PATTERN.test(userId) ||
    !VERSION_PATTERN.test(version)
  ) {
    return null;
  }
  return { kind, userId, version: version.toLowerCase() };
};

const fill = (
  record: Record<string, unknown>,
  kind: PictureKind,
  userId: unknown,
): void => {
  const urlKey = `${kind}Url`;
  const version = record[`${kind}Version`];
  if (
    typeof version === "string" &&
    VERSION_PATTERN.test(version) &&
    typeof userId === "string" &&
    USER_ID_PATTERN.test(userId) &&
    (record[urlKey] === undefined || record[urlKey] === null || record[urlKey] === "")
  ) {
    record[urlKey] = pictureUrl(kind, userId, version);
  }
};

/**
 * Fills avatarUrl / bannerUrl from avatarVersion / bannerVersion, in place,
 * anywhere in a parsed response or frame. The owner is the record's userId
 * (directory rows, profile events) or id (a profile). Returns the same value.
 */
export const attachPictureUrls = <T>(value: T): T => {
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object") {
      return;
    }
    const record = node as Record<string, unknown>;
    if ("avatarVersion" in record || "bannerVersion" in record) {
      const owner = record.userId ?? record.id;
      fill(record, "avatar", owner);
      fill(record, "banner", owner);
    }
    for (const child of Object.values(record)) {
      if (child && typeof child === "object") {
        visit(child);
      }
    }
  };
  visit(value);
  return value;
};

/** The image type of a picture's bytes, read from its signature. */
export const sniffImageType = (bytes: Uint8Array): string => {
  const ascii = (start: number, end: number): string =>
    String.fromCharCode(...bytes.subarray(start, end));
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return "image/jpeg";
  }
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") {
    return "image/png";
  }
  if (ascii(0, 3) === "GIF") {
    return "image/gif";
  }
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    return "image/webp";
  }
  return "application/octet-stream";
};
