/**
 * A zod failure as a Turkish sentence.
 *
 * Every IPC handler parses its payload with zod before the request goes out.
 * When that fails, `ZodError.message` is the issue list as pretty-printed JSON
 * (`[ { "origin": "string", "code": "too_small", ... } ]`), and the generic
 * error path put it into a toast as it was. The admin panel showed it most:
 * a short reason or a bad date there died as a wall of braces.
 *
 * Duck-typed on `issues` so the shared folder does not import zod.
 */

interface IssueLike {
  code?: string;
  path?: unknown[];
  origin?: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
  format?: string;
}

// What a field is called to the person who typed it. Unknown keys fall back
// to a neutral phrase rather than the key name, which is code vocabulary.
const FIELD_LABELS: Record<string, string> = {
  reason: "Gerekçe",
  userId: "Kullanıcı",
  peerId: "Kullanıcı",
  username: "Kullanıcı adı",
  displayName: "Görünen ad",
  password: "Şifre",
  newPassword: "Yeni şifre",
  currentPassword: "Mevcut şifre",
  email: "E-posta",
  code: "Kod",
  totpCode: "Doğrulama kodu",
  body: "Mesaj",
  name: "Ad",
  title: "Başlık",
  cidr: "IP adresi",
  until: "Bitiş zamanı",
  expiresAt: "Bitiş zamanı",
  maxUses: "Kullanım sayısı",
  lobbyId: "Oda",
  tableId: "Masa",
  capacity: "Kişi sayısı",
  bio: "Hakkında",
  dataUrl: "Dosya",
  role: "Rol",
};

const labelOf = (issue: IssueLike): string => {
  const key = [...(issue.path ?? [])].reverse().find((part) => typeof part === "string");
  return (typeof key === "string" && FIELD_LABELS[key]) || "Girilen bilgi";
};

const sentenceFor = (issue: IssueLike): string => {
  const label = labelOf(issue);
  const min = Number(issue.minimum);
  const max = Number(issue.maximum);
  const isText = issue.origin === "string";

  switch (issue.code) {
    case "too_small":
      if (isText) {
        return min <= 1 ? `${label} boş olamaz.` : `${label} en az ${min} karakter olmalı.`;
      }
      return `${label} en az ${min} olmalı.`;
    case "too_big":
      return isText
        ? `${label} en fazla ${max} karakter olabilir.`
        : `${label} en fazla ${max} olabilir.`;
    case "invalid_format":
      return issue.format === "email"
        ? "Geçerli bir e-posta adresi gir."
        : `${label} biçimi geçersiz.`;
    default:
      return `${label} geçersiz.`;
  }
};

/** The sentence for a ZodError, or null when `error` is not one. */
export const describeValidationError = (error: unknown): string | null => {
  const issues = (error as { issues?: unknown })?.issues;
  if (!Array.isArray(issues) || issues.length === 0) {
    return null;
  }

  // Two at most: a third sentence is a form's worth of noise in a toast.
  return [...new Set((issues as IssueLike[]).slice(0, 2).map(sentenceFor))].join(" ");
};
