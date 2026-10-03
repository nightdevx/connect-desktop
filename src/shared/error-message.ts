/**
 * The human-readable message inside a thrown value, or `fallback`.
 *
 * `catch` gives you `unknown`, and the app throws three different shapes at it:
 * a real Error, a rejected IPC envelope (`{ code, message }`, not an Error), and
 * occasionally a bare string. Twenty-odd call sites each solved that with
 * `catch (err: any) { err.message || "..." }`, which is the same thing with the
 * type checker switched off — and which renders "undefined" the moment
 * something throws a shape nobody anticipated.
 *
 * Blank messages fall through to the fallback on purpose: a toast that says
 * nothing is worse than one that says what failed.
 */
export const toErrorMessage = (error: unknown, fallback: string): string => {
  // An IPC envelope for a request that never got an answer.
  if (
    typeof error === "object" &&
    error !== null &&
    isTransientApiError(error as { code?: string; statusCode?: number })
  ) {
    return TRANSIENT_API_ERROR_MESSAGE;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  // Not an Error, but message-shaped: this is what the IPC layer rejects with.
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
};

/**
 * A request that never got an answer: the main process timed it out
 * (REQUEST_TIMEOUT), could not reach the server (BACKEND_UNREACHABLE), or the
 * proxy said the backend was away (502-504, as during a deploy). The network
 * or the server is gone for a moment, and the same call a few seconds later is
 * expected to work. Production showed stalls of tens of seconds for a few
 * users at once, while the server answered everyone else in milliseconds.
 */
export const isTransientApiError = (error?: {
  code?: string;
  statusCode?: number;
}): boolean => {
  if (!error) {
    return false;
  }
  return (
    error.code === "REQUEST_TIMEOUT" ||
    error.code === "BACKEND_UNREACHABLE" ||
    error.statusCode === 502 ||
    error.statusCode === 503 ||
    error.statusCode === 504
  );
};

/**
 * What a person reads for a transient failure. The main process used to put
 * its URL in the message ("Backend istegi zaman asimina ugradi (https://...)"),
 * which on screen read like a crash. Neutral on purpose: one-shot actions do
 * not retry, and the views that do say so themselves (TransientQueryError).
 */
export const TRANSIENT_API_ERROR_MESSAGE = "Sunucuya şu an ulaşılamıyor.";
