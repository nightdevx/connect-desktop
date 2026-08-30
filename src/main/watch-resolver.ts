import { BrowserWindow, session as electronSession, type Session } from "electron";
import { lookup } from "node:dns/promises";

import { isPrivateAddress, streamKind, type StreamKind } from "./watch-stream-url";

export interface ResolvedStream {
  streamUrl: string;
  kind: StreamKind;
  headers: Record<string, string>;
  pageTitle: string;
}

const PARTITION = "watch-resolver";
const RESOLVE_TIMEOUT_MS = 45_000;
const NAVIGATE_TIMEOUT_MS = 30_000;
const POKE_INTERVAL_MS = 1_600;
const SETTLE_MS = 1_800;

const RANK: Record<StreamKind, number> = { hls: 4, dash: 3, mp4: 2, webm: 1 };

const AD_PATTERN =
  /(doubleclick|googlesyndication|googletagservices|googletagmanager|google-analytics|adservice\.|adsterra|propellerads|popads|popcash|onclickads|exoclick|juicyads|hilltopads|mgid\.com|clickadu|adnxs|zeroredirect|smartadserver|criteo|taboola|outbrain|histats|statcounter)/i;

const SEGMENT_PATTERN =
  /\.(ts|m4s|aac|mp3|vtt|srt|jpe?g|png|gif|webp|svg|css|woff2?|ico|js)$/i;

const FORWARDED_HEADERS = new Set([
  "referer",
  "origin",
  "user-agent",
  "cookie",
  "accept",
  "accept-language",
]);

const POKE = `(() => {
  for (const v of document.querySelectorAll('video')) {
    try {
      v.muted = true;
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  }
  const sels = [
    '.vjs-big-play-button', '.jw-icon-display', '.plyr__control--overlaid', '.fp-ui',
    '[class*="big-play"]', '[class*="play-button"]', '[id*="play-button"]',
    '[class*="btnPlay"]', '[class*="playButton"]', '[aria-label*="lay"]',
    '#player', '.player', '.play', '#play'
  ];
  for (const s of sels) {
    const el = document.querySelector(s);
    if (el && el.offsetParent !== null) {
      try { el.click(); } catch (e) {}
      break;
    }
  }
})()`;

async function assertPublicPage(pageUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(pageUrl);
  } catch {
    throw new Error("Bağlantı çözümlenemedi.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Yalnızca http/https bağlantıları açılabilir.");
  }

  const addresses = await lookup(parsed.hostname, { all: true }).catch(() => []);
  if (addresses.length === 0) {
    throw new Error("Adres çözümlenemedi.");
  }
  if (addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error("Yerel ağ adresleri açılamaz.");
  }
  return parsed;
}

function pickHeaders(
  raw: Record<string, string | string[]>,
  fallbackReferer: string,
): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    const name = key.toLowerCase();
    if (!FORWARDED_HEADERS.has(name)) {
      continue;
    }
    const flat = Array.isArray(value) ? value.join("; ") : value;
    if (flat) {
      picked[name] = flat;
    }
  }
  if (!picked.referer && fallbackReferer) {
    picked.referer = fallbackReferer;
  }
  if (!picked.origin && picked.referer) {
    try {
      picked.origin = new URL(picked.referer).origin;
    } catch {
      // A referer that is not a URL simply yields no origin.
    }
  }
  return picked;
}

async function pokeEveryFrame(window: BrowserWindow): Promise<void> {
  const main = window.webContents.mainFrame;
  if (!main) {
    return;
  }
  for (const frame of [main, ...main.framesInSubtree]) {
    try {
      await frame.executeJavaScript(POKE, true);
    } catch {
      // A frame that navigated away mid-poke is not an error worth reporting.
    }
  }
}

let inFlight: Promise<unknown> = Promise.resolve();

export function resolveWatchSource(pageUrl: string): Promise<ResolvedStream> {
  const next = inFlight.then(
    () => runResolve(pageUrl),
    () => runResolve(pageUrl),
  );
  inFlight = next.catch(() => undefined);
  return next;
}

async function runResolve(pageUrl: string): Promise<ResolvedStream> {
  const parsed = await assertPublicPage(pageUrl);

  const partition = electronSession.fromPartition(PARTITION);
  const window = new BrowserWindow({
    show: false,
    width: 1366,
    height: 768,
    webPreferences: {
      partition: PARTITION,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      webSecurity: true,
    },
  });

  const requestHeaders = new Map<number, Record<string, string | string[]>>();
  let best: ResolvedStream | null = null;
  let signalHit: () => void = () => undefined;
  const firstHit = new Promise<void>((resolve) => {
    signalHit = resolve;
  });

  const filter = { urls: ["*://*/*"] };

  partition.webRequest.onBeforeRequest(filter, (details, callback) => {
    callback({ cancel: AD_PATTERN.test(details.url) });
  });

  partition.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    requestHeaders.set(details.id, details.requestHeaders);
    callback({ requestHeaders: details.requestHeaders });
  });

  partition.webRequest.onHeadersReceived(filter, (details, callback) => {
    try {
      const url = details.url;
      const bare = url.split("?")[0].split("#")[0];
      if (!AD_PATTERN.test(url) && !SEGMENT_PATTERN.test(bare)) {
        const headers = details.responseHeaders ?? {};
        const contentTypeKey = Object.keys(headers).find(
          (key) => key.toLowerCase() === "content-type",
        );
        const contentType = contentTypeKey
          ? [headers[contentTypeKey]].flat().join(";")
          : "";
        const kind = streamKind(url, contentType);
        if (kind && (!best || RANK[best.kind] < RANK[kind])) {
          best = {
            streamUrl: url,
            kind,
            headers: pickHeaders(requestHeaders.get(details.id) ?? {}, parsed.href),
            pageTitle: "",
          };
          signalHit();
        }
      }
    } catch {
      // Sniffing must never break the navigation it is observing.
    }
    callback({});
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  try {
    await Promise.race([
      window.loadURL(parsed.href).catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, NAVIGATE_TIMEOUT_MS)),
    ]);

    const deadline = Date.now() + RESOLVE_TIMEOUT_MS;
    while (!best && Date.now() < deadline && !window.isDestroyed()) {
      await pokeEveryFrame(window);
      await Promise.race([
        firstHit,
        new Promise((resolve) => setTimeout(resolve, POKE_INTERVAL_MS)),
      ]);
    }

    if (!best) {
      throw new Error(
        "Videoya ulaşılamadı. Sayfa DRM korumalı olabilir, bot doğrulaması isteyebilir ya da akış desteklenmeyen bir formatta olabilir.",
      );
    }

    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

    const settled = best as ResolvedStream;
    settled.pageTitle = window.isDestroyed() ? "" : window.webContents.getTitle();
    return settled;
  } finally {
    partition.webRequest.onBeforeRequest(null);
    partition.webRequest.onBeforeSendHeaders(null);
    partition.webRequest.onHeadersReceived(null);
    requestHeaders.clear();
    if (!window.isDestroyed()) {
      window.destroy();
    }
    void clearResolverSession(partition);
  }
}

async function clearResolverSession(partition: Session): Promise<void> {
  try {
    await partition.clearStorageData();
    await partition.clearCache();
  } catch {
    // Best effort: a session that cannot be cleared is not a reason to fail a
    // resolve that already succeeded.
  }
}
