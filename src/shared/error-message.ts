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
