import type { ApiErrorPayload } from "@shared/desktop-api-types";

// Turkish, end-user wording for every failure the login and register forms can
// hit — including the ones that never reach the backend at all.
//
// This exists because both forms used to render the backend's own message
// verbatim (`Giriş başarısız: ${result.error.message}`), and those messages are
// written for developers and in English: "username must be 3-32 chars and
// contain only a-z, 0-9, underscore, dash or dot", "invalid credentials",
// "failed to hash password". A Turkish user got either English jargon or the
// literal string "Bilinmeyen hata", and in neither case learned what to change.
//
// Keyed on `code`, never on `message`. Codes are the backend's stable contract;
// message text is prose that gets reworded.

export type AuthErrorField = "username" | "email" | "password";

export interface AuthErrorInfo {
  /** One line: what happened. */
  title: string;
  /** Exactly why it happened, in the user's terms. */
  detail: string;
  /** What to do next. Omitted when there is nothing the user can do. */
  hint?: string;
  /** Which input to mark, when the cause is one specific field. */
  field?: AuthErrorField;
  /** true when trying the same thing again could plausibly work. */
  retryable: boolean;
}

// Wording rule for everything below: title says what happened, detail says why
// in ONE short sentence, hint says what to do. No paragraphs — an error message
// nobody finishes reading is the same as no error message.

// Anything the user cannot act on: the request never got a verdict, so the
// credentials they typed are still unproven.
const TRANSPORT: Record<string, AuthErrorInfo> = {
  BACKEND_UNREACHABLE: {
    title: "Sunucuya bağlanılamadı",
    detail: "Bilgileriniz kontrol bile edilmedi.",
    hint: "İnternet bağlantınızı kontrol edip tekrar deneyin.",
    retryable: true,
  },
  REQUEST_TIMEOUT: {
    title: "Sunucu yanıt vermedi",
    detail: "İstek zaman aşımına uğradı.",
    hint: "Tekrar deneyin. Kayıt sırasındaysa önce giriş yapmayı deneyin.",
    retryable: true,
  },
  REQUEST_FAILED: {
    title: "Sunucudan geçersiz yanıt",
    detail: "Yanıt okunamadı; sunucu sürümü eski olabilir.",
    hint: "Sorun sürerse uygulamayı güncelleyin.",
    retryable: true,
  },
  UNEXPECTED_ERROR: {
    title: "Beklenmeyen hata",
    detail: "Uygulama içinde bir sorun çıktı.",
    hint: "Tekrar deneyin.",
    retryable: true,
  },
};

// The backend answered, and the answer was "no". These say precisely why.
const LOGIN: Record<string, AuthErrorInfo> = {
  INVALID_CREDENTIALS: {
    title: "Kullanıcı adı veya şifre hatalı",
    // Deliberately not "böyle bir kullanıcı yok": telling an outsider which
    // usernames exist lets them build a list of real accounts to attack. The
    // backend answers both cases identically, and the message says so in one
    // line rather than pretending to know which half was wrong.
    detail: "Güvenlik için hangisinin yanlış olduğu söylenmez.",
    hint: "Yazımı kontrol edin ya da “Şifremi Unuttum”u kullanın.",
    field: "password",
    retryable: true,
  },
  USER_BANNED: {
    title: "Hesabınız yasaklı",
    detail: "Şifreniz doğru olsa da giriş yapılamaz.",
    hint: "Sunucu yöneticisine ulaşın.",
    retryable: false,
  },
  ACCOUNT_DEACTIVATED: {
    title: "Hesap kapatılmış",
    detail: "Bu hesapla oturum açılamıyor.",
    hint: "Sunucu yöneticisine ulaşın.",
    retryable: false,
  },
};

const REGISTER: Record<string, AuthErrorInfo> = {
  INVALID_EMAIL: {
    title: "E-posta geçersiz",
    detail: "Adres e-posta biçiminde değil.",
    hint: "Örnek: ad@example.com",
    field: "email",
    retryable: true,
  },
  INVALID_USERNAME: {
    title: "Kullanıcı adı geçersiz",
    detail: "3-32 karakter; sadece küçük harf, rakam ve _ - . olabilir.",
    hint: "Örnek: ayse_yilmaz",
    field: "username",
    retryable: true,
  },
  USERNAME_RESERVED: {
    title: "Bu ad ayrılmış",
    detail: "Sistem için ayrılmış adlardan biri.",
    hint: "Başka bir ad seçin.",
    field: "username",
    retryable: true,
  },
  INVALID_PASSWORD: {
    title: "Şifre geçersiz",
    detail: "En az 8 karakter olmalı.",
    hint: "Türkçe karakter ve emoji fazladan yer kaplar.",
    field: "password",
    retryable: true,
  },
  USERNAME_ALREADY_EXISTS: {
    title: "Bu kullanıcı adı alınmış",
    detail: "Aynı adla başka bir hesap var.",
    hint: "Hesap sizinse giriş yapın.",
    field: "username",
    retryable: true,
  },
  EMAIL_ALREADY_EXISTS: {
    title: "Bu e-posta kayıtlı",
    detail: "Bu adresle açılmış bir hesap var.",
    hint: "Hesap sizinse giriş yapın.",
    field: "email",
    retryable: true,
  },
};

// Distinct 5xx codes, one message: the cause is on the server and the user can
// do exactly the same thing about all of them. The code still reaches the
// screen so it can be reported.
const SERVER_FAULT_CODES = new Set([
  "AUTH_PERSISTENCE_ERROR",
  "HASH_FAILED",
  "USER_CREATE_FAILED",
  "USER_LOOKUP_FAILED",
  "TOKEN_ISSUE_FAILED",
  "TOKEN_STORE_FAILED",
  "OTP_CREATE_FAILED",
  "EMAIL_SEND_FAILED",
]);

const SERVER_FAULT: AuthErrorInfo = {
  title: "Sunucu hatası",
  detail: "Sorun sunucuda; girdiğiniz bilgilerle ilgisi yok.",
  hint: "Birkaç dakika sonra tekrar deneyin.",
  retryable: true,
};

const TOO_MANY_REQUESTS: AuthErrorInfo = {
  title: "Çok fazla deneme",
  detail: "Güvenlik için istekler geçici olarak durduruldu.",
  hint: "Bir dakika bekleyin.",
  retryable: true,
};

const VALIDATION: AuthErrorInfo = {
  title: "Bilgiler eksik veya hatalı",
  detail: "Sunucu alanlardan birini kabul etmedi.",
  hint: "Alanları kontrol edin.",
  retryable: true,
};

const UNKNOWN: AuthErrorInfo = {
  title: "Bilinmeyen hata",
  detail: "Sunucu tanınmayan bir hata döndürdü.",
  hint: "Tekrar deneyin.",
  retryable: true,
};

/**
 * Turns a backend/transport error into something worth showing a person.
 *
 * `context` picks the right table when a code means different things on the two
 * forms; unknown codes still get a usable message rather than a raw English one.
 */
export const describeAuthError = (
  error: ApiErrorPayload | undefined,
  context: "login" | "register",
): AuthErrorInfo => {
  const code = error?.code?.trim();

  if (!code) {
    return UNKNOWN;
  }

  if (TRANSPORT[code]) {
    return TRANSPORT[code];
  }

  if (code === "TOO_MANY_REQUESTS") {
    return TOO_MANY_REQUESTS;
  }

  const table = context === "login" ? LOGIN : REGISTER;
  if (table[code]) {
    return table[code];
  }

  // A register-only code can still arrive on the login form (and the reverse)
  // — for example a stale client hitting a reworked endpoint. Better the right
  // explanation from the other table than "bilinmeyen hata".
  const other = context === "login" ? REGISTER : LOGIN;
  if (other[code]) {
    return other[code];
  }

  if (SERVER_FAULT_CODES.has(code) || (error?.statusCode ?? 0) >= 500) {
    return SERVER_FAULT;
  }

  if (code === "VALIDATION_ERROR") {
    return VALIDATION;
  }

  return UNKNOWN;
};

/**
 * The short line for the app's status bar. The full explanation belongs on the
 * form, where the fields it talks about are.
 */
export const summarizeAuthError = (
  error: ApiErrorPayload | undefined,
  context: "login" | "register",
): string => describeAuthError(error, context).title;
