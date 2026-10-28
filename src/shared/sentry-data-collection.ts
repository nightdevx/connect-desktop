// @sentry/electron 8 (Sentry JS 11) collects far more when `dataCollection` is
// left unset than 7 did: the user's IP, cookies, and full HTTP request and
// response bodies -- which here include login passwords, refresh tokens and
// chat messages. This is the restrictive v7 default, spelled out as Sentry's
// migration guide says to; both the main and the renderer init pass it.
const NETWORK_DENY = ["forwarded", "-ip", "remote-", "via", "-user"];

export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: {
    request: { deny: NETWORK_DENY },
    response: { deny: NETWORK_DENY },
  },
  httpBodies: [],
  urlQueryParams: { deny: NETWORK_DENY },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  graphQL: { document: false, variables: false },
};
