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
  const said = rawErrorMessage(error);
  if (said === null) {
    return fallback;
  }
  // A backend sentence in English becomes Turkish; one nobody translated, or a
  // library's own text, gives way to the caller's fallback.
  return translateBackendMessage(said) ?? fallback;
};

const rawErrorMessage = (error: unknown): string | null => {
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

  return null;
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

/** What a person reads when nothing better is known. */
export const GENERIC_ERROR_MESSAGE = "Bir sorun oluştu.";

// The backend answers in English for most refusals (internal/chat, lobby, auth).
// The desktop used to show those as they came: "message can only be edited by
// sender" in a Turkish toast. One entry per sentence the user can really reach.
const BACKEND_MESSAGES: Array<[RegExp, string | ((match: RegExpMatchArray) => string)]> = [
  [/can only be edited by sender/i, "Yalnızca kendi mesajını düzenleyebilirsin."],
  [/can only be deleted by sender/i, "Yalnızca kendi mesajını silebilirsin."],
  [/message body is required/i, "Mesaj boş olamaz."],
  [/message is too long/i, "Mesaj çok uzun."],
  [/direct message to self/i, "Kendine mesaj gönderemezsin."],
  [/^(cursor )?message not found/i, "Mesaj bulunamadı."],
  [/emote must be at most (\d+) ?KB/i, (m) => `Ses dosyası çok büyük (en fazla ${m[1]} KB).`],
  [/emote limit reached \((\d+)\)/i, (m) => `Ses sınırına ulaştın (${m[1]}).`],
  [/not your emote/i, "Bu ses sana ait değil."],
  [/emote not found/i, "Ses bulunamadı."],
  [/default lobby cannot be modified/i, "Varsayılan oda değiştirilemez ya da silinemez."],
  [/lobby is locked/i, "Bu oda kilitli."],
  [/lobby is full/i, "Oda dolu."],
  [/banned from lobby/i, "Bu odadan yasaklandın."],
  [/lobby not found/i, "Oda bulunamadı."],
  [/invalid lobby name/i, "Geçersiz oda adı."],
  [/join the room first/i, "Önce odaya katılmalısın."],
  [/cannot call self/i, "Kendini arayamazsın."],
  [/user not found/i, "Kullanıcı bulunamadı."],
  [/current password is incorrect/i, "Mevcut şifre yanlış."],
  [/invalid email|valid email address/i, "Geçerli bir e-posta adresi gir."],
  [/bio must be/i, "Hakkında alanı en fazla 240 karakter olabilir."],
  [/displayName must be/i, "Görünen ad 3 ile 32 karakter arasında olmalı."],
  [/displayName contains invalid/i, "Görünen ad geçersiz karakter içeriyor."],
  [/image (must be|format|could not)/i, "Görsel okunamadı ya da biçimi desteklenmiyor."],
  [/session has been revoked/i, "Oturumun sonlandırılmış. Tekrar giriş yap."],
  [/no active session|^unauthorized$/i, "Oturum bulunamadı. Tekrar giriş yap."],
];

// A sentence that is plain ASCII and carries one of the words a refusal or a
// library error is made of. Turkish text without special letters ("Oda dolu")
// has none of them.
const LOOKS_ENGLISH =
  /^[\x20-\x7e]+$/;
const ENGLISH_WORDS =
  /\b(is|are|not|must|invalid|failed|cannot|could|required|found|unauthorized|too|only|limit|missing|unavailable|exceeded|expired|permission|denied|error|session|request|body|server|internal|unexpected|abort\w*|timeout|network|fetch|device|reading|stream)\b/i;

/**
 * A backend or library message as a person should read it: the Turkish
 * sentence for a known one, the text itself when it already is Turkish, and
 * null for English nobody has translated (the caller says its own sentence).
 */
export const translateBackendMessage = (message: string): string | null => {
  const text = message.trim();
  for (const [pattern, turkish] of BACKEND_MESSAGES) {
    const match = pattern.exec(text);
    if (match) {
      return typeof turkish === "string" ? turkish : turkish(match);
    }
  }
  return LOOKS_ENGLISH.test(text) && ENGLISH_WORDS.test(text) ? null : text;
};
