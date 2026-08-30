import { isIP } from "node:net";

export type StreamKind = "hls" | "dash" | "mp4" | "webm";

export const STREAM_PREFIX = "/stream/";

export function streamKind(url: string, contentType = ""): StreamKind | "" {
  const bare = url.split("?")[0].split("#")[0].toLowerCase();
  const type = contentType.toLowerCase();
  if (bare.endsWith(".m3u8") || bare.endsWith(".m3u") || type.includes("mpegurl")) {
    return "hls";
  }
  if (bare.endsWith(".mpd") || type.includes("dash+xml")) {
    return "dash";
  }
  if (
    bare.endsWith(".mp4") ||
    bare.endsWith(".m4v") ||
    bare.endsWith(".mov") ||
    type.startsWith("video/mp4")
  ) {
    return "mp4";
  }
  if (bare.endsWith(".webm") || type.startsWith("video/webm")) {
    return "webm";
  }
  return "";
}

export function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const value = address.toLowerCase();
    if (value === "::" || value === "::1") {
      return true;
    }
    if (value.startsWith("::ffff:")) {
      return isPrivateAddress(value.slice(7));
    }
    return value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80");
  }

  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  }
  return false;
}

export function streamProxyPath(absoluteUrl: string, sid: string): string {
  let parsed: URL;
  try {
    parsed = new URL(absoluteUrl);
  } catch {
    return absoluteUrl;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return absoluteUrl;
  }
  const scheme = parsed.protocol.slice(0, -1);
  return `${STREAM_PREFIX}${sid}/${scheme}/${parsed.host}${parsed.pathname}${parsed.search}`;
}

export function rewriteHlsManifest(text: string, baseUrl: string, sid: string): string {
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return line;
      }
      if (trimmed.startsWith("#")) {
        return line.replace(/URI="([^"]*)"/g, (_match, value: string) => {
          try {
            return `URI="${streamProxyPath(new URL(value, baseUrl).href, sid)}"`;
          } catch {
            return `URI="${value}"`;
          }
        });
      }
      try {
        return streamProxyPath(new URL(trimmed, baseUrl).href, sid);
      } catch {
        return line;
      }
    })
    .join("\n");
}

export function rewriteDashManifest(text: string, sid: string): string {
  return text.replace(/https?:\/\/[^\s"'<>]+/g, (match) => streamProxyPath(match, sid));
}
