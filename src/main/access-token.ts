// When the access token stops being usable.
//
// The backend issues a 15-minute JWT (ACCESS_TOKEN_TTL_SECONDS, default 900).
// Discovering the expiry by being told 401 costs a full extra round trip on
// whatever the user happened to be doing at the time — and because the renderer
// runs several queries in parallel, an expiry used to produce a burst of 401s
// that all had to wait behind one refresh before retrying. Reading `exp` lets
// the refresh happen before the request instead of after the failure.
//
// Returns null for anything that is not a JWT carrying a numeric `exp`. A null
// means "no opinion": the caller keeps the old reactive behaviour rather than
// refreshing on every single call.
export const accessTokenExpiryMs = (accessToken: string): number | null => {
  const segments = accessToken.split(".");
  if (segments.length !== 3) {
    return null;
  }

  try {
    // base64url, and Buffer's "base64" decoder does not accept - and _.
    const json = Buffer.from(
      segments[1].replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");

    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
};

// The window in which a token is treated as already gone. It has to cover the
// request's own flight time plus any clock skew between this machine and the
// server, or a token that passes the check here still arrives expired.
export const ACCESS_TOKEN_REFRESH_SKEW_MS = 60_000;

export const isAccessTokenExpiring = (
  accessToken: string,
  nowMs: number,
): boolean => {
  const expiresAt = accessTokenExpiryMs(accessToken);
  return expiresAt !== null && expiresAt - nowMs <= ACCESS_TOKEN_REFRESH_SKEW_MS;
};

// Past the point where a retry could help: used to decide whether a failed
// proactive refresh is fatal or whether the request is still worth attempting.
export const isAccessTokenExpired = (
  accessToken: string,
  nowMs: number,
): boolean => {
  const expiresAt = accessTokenExpiryMs(accessToken);
  return expiresAt !== null && expiresAt <= nowMs;
};
