import { QueryClient } from "@tanstack/react-query";
import type { DesktopResult } from "@shared/desktop-api-types";
import { isTransientApiError } from "@shared/error-message";

/**
 * Thrown by a query whose request never got an answer. The IPC layer hands
 * every failure back as data ({ ok: false }), which react-query takes for a
 * success: the error replaced the last good answer on screen and nothing tried
 * again. Thrown, it keeps the last good data showing and is retried below.
 */
export class TransientQueryError extends Error {}

export const throwIfTransient = <T extends DesktopResult<unknown>>(result: T): T => {
  if (!result.ok && isTransientApiError(result.error)) {
    throw new TransientQueryError("Sunucuya şu an ulaşılamıyor, yeniden deneniyor…");
  }
  return result;
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A transient failure gets three more tries, a second apart and then two
      // and four (react-query's own backoff), on top of each request's 8 s
      // budget: about forty seconds, the length of the stalls production saw.
      retry: (failureCount, error) =>
        failureCount < (error instanceof TransientQueryError ? 3 : 1),
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
