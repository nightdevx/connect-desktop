// The domain KLIPY serves its media from. This list exists for one reason, and
// it is not cosmetic.
//
// A chat bubble whose entire body is an image URL renders as an <img>, which
// is an unattended GET the moment the message scrolls into view. Without an
// allowlist a stranger could post "https://attacker.tld/t.png" into a lobby and
// harvest every viewer's public IP, User-Agent and exact read time with zero
// interaction -- a read receipt and an IP harvester in one message -- or serve
// a 50 MB "image" to burn their bandwidth. So only the GIF provider's own CDN
// is ever auto-loaded; every other URL stays text.
//
// This matches the registrable domain rather than a list of subdomains on
// purpose. Nobody here has a KLIPY key and docs.klipy.com answers 403, so the
// exact CDN hostnames are unverified -- and a wrong guess fails invisibly:
// every API row maps to null, the picker shows "Sonuç bulunamadı" for every
// query, and it is indistinguishable from a search that found nothing.
//
// The CSP img-src in src/renderer/index.html must stay in step with this
// (https://*.klipy.com). The two fail closed, not open.
const GIF_CDN_DOMAIN = "klipy.com";

// https + the provider's own registrable domain, decided on the PARSED
// hostname. Never a substring or startsWith test of the href -- that is what
// these three defeat:
//   https://klipy.com.evil.tld/x.gif   -> hostname "klipy.com.evil.tld"
//   https://evil.tld/?x=klipy.com      -> hostname "evil.tld"
//   https://media.klipy.com@evil.tld/x -> hostname "evil.tld" (the rest is
//                                         userinfo)
// The leading dot in the suffix test is load-bearing on its own: without it
// "evilklipy.com" would pass.
const parseProviderUrl = (value: string): URL | null => {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") {
      return null;
    }

    return parsed.hostname === GIF_CDN_DOMAIN ||
      parsed.hostname.endsWith(`.${GIF_CDN_DOMAIN}`)
      ? parsed
      : null;
  } catch {
    return null;
  }
};

// The main process's filter over KLIPY's own API response. Deliberately has NO
// path-extension requirement: KLIPY's media paths may well be extensionless
// (/gif/12345/), and demanding ".gif" there would drop every row and produce
// exactly the silent empty grid described above.
export const isGifProviderMediaUrl = (value: string): boolean =>
  parseProviderUrl(value) !== null;

// Extensions an <img> can actually display. .mp4 is deliberately absent: KLIPY
// returns video variants in the same payload and they would render as a broken
// image box.
const IMAGE_PATH_PATTERN = /\.(?:gif|png|jpe?g|webp)$/i;

// The chat auto-render test, and a stricter question than the one above: here
// the input is arbitrary user-typed message text, not a vetted API response, so
// it must also look like something an <img> can show. Parsing rather than
// regex-matching the whole URL means a query string ("?v=2") does not defeat
// the extension check.
export const isAutoLoadableImageUrl = (value: string): boolean => {
  const parsed = parseProviderUrl(value);
  return parsed !== null && IMAGE_PATH_PATTERN.test(parsed.pathname);
};
