import { app, protocol } from "electron";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { backendClient, withAccessToken } from "./ipc/context";
import { DesktopApiError } from "./clients/base-client";
import {
  PICTURE_SCHEME,
  parsePictureUrl,
  sniffImageType,
  type PictureRequest,
} from "../shared/picture-urls";

// Answers connect-picture://avatar|banner/<userId>?v=<version>, the addresses
// shared/picture-urls.ts puts where the base64 used to be.
//
// The picture routes want the bearer token, which only main holds, and a
// version names exactly one picture forever, so the bytes are kept on disk
// under the version: an avatar is fetched once per change, not once per launch.
// A new version of the same picture replaces the old file.
//
// ponytail: no size bound on the folder; it holds one file per person and
// picture kind the user has seen. Add an LRU sweep if that ever matters.

const cacheDir = (): string => path.join(app.getPath("userData"), "picture-cache");

const fileName = ({ kind, userId, version }: PictureRequest): string =>
  `${kind}-${userId}-${version}`;

const inFlight = new Map<string, Promise<Buffer>>();

const fetchPicture = async (request: PictureRequest): Promise<Buffer> => {
  const file = path.join(cacheDir(), fileName(request));
  try {
    return await readFile(file);
  } catch {
    // Not cached yet.
  }

  const { bytes } = await withAccessToken((accessToken) =>
    backendClient.base.requestBinary(
      `/auth/users/${encodeURIComponent(request.userId)}/${request.kind}?v=${request.version}`,
      { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } },
      30_000,
    ),
  );

  try {
    await mkdir(cacheDir(), { recursive: true });
    // Written beside and renamed over, so a crash never leaves half a picture
    // under a name that is read as whole.
    await writeFile(`${file}.tmp`, bytes);
    await rename(`${file}.tmp`, file);
    // The previous versions of this picture will never be asked for again.
    const stale = `${request.kind}-${request.userId}-`;
    for (const name of await readdir(cacheDir())) {
      if (name.startsWith(stale) && name !== fileName(request)) {
        await rm(path.join(cacheDir(), name), { force: true });
      }
    }
  } catch (error) {
    // A cache that cannot be written still answers this request.
    console.warn("[pictures] cache write failed", error);
  }
  return bytes;
};

/** Before app ready: the scheme loads in <img> and fetch() like https does. */
export const registerPictureScheme = (): void => {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: PICTURE_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
    },
  ]);
};

/** After app ready, on the session the app's page runs in. */
export const installPictureProtocol = (): void => {
  protocol.handle(PICTURE_SCHEME, async (request) => {
    const picture = parsePictureUrl(request.url);
    if (!picture) {
      return new Response(null, { status: 400 });
    }

    const key = fileName(picture);
    let pending = inFlight.get(key);
    if (!pending) {
      pending = fetchPicture(picture).finally(() => inFlight.delete(key));
      inFlight.set(key, pending);
    }

    try {
      const bytes = await pending;
      return new Response(new Uint8Array(bytes), {
        headers: {
          "Content-Type": sniffImageType(bytes),
          // Read by fetch() from the page (use-still-image.ts asks whether a
          // picture is a GIF), whose file:// origin is "null".
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "private, max-age=31536000, immutable",
        },
      });
    } catch (error) {
      const status = error instanceof DesktopApiError ? error.statusCode : 502;
      return new Response(null, { status: status >= 400 && status < 600 ? status : 502 });
    }
  });
};
