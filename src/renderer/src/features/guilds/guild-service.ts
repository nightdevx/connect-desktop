import type { ApiErrorPayload } from "@shared/desktop-api-types";
import type { GuildAction, GuildCalls } from "@shared/guild-contracts";
import { toErrorMessage } from "@shared/error-message";

/** A refused /guilds call: the backend's code and its sentence. */
export class GuildCallError extends Error {
  public constructor(public readonly code: string, message: string) {
    super(message);
  }
}

// The backend's sentences are Turkish already but lower case and without a
// full stop; a few codes are worded for this screen instead.
const BY_CODE: Record<string, string> = {
  GUILD_CREATE_FAILED: "Sunucu kurulamadı. Biraz sonra tekrar dene.",
  INVITE_INVALID: "Bu kod geçersiz ya da süresi dolmuş.",
  FORBIDDEN: "Bunun için yetkin yok.",
};

const sentence = (text: string): string => {
  const trimmed = text.trim();
  const capital = trimmed.charAt(0).toLocaleUpperCase("tr-TR") + trimmed.slice(1);
  return /[.!?…]$/.test(capital) ? capital : `${capital}.`;
};

export const guildErrorMessage = (error: ApiErrorPayload | undefined): string =>
  (error?.code && BY_CODE[error.code]) || sentence(toErrorMessage(error, "Bir sorun oluştu"));

/** One /guilds call over IPC; throws GuildCallError when it is refused. */
export const callGuild = async <K extends GuildAction>(
  action: K,
  payload: GuildCalls[K]["in"],
): Promise<GuildCalls[K]["out"]> => {
  const result = await window.desktopApi.guilds(action, payload);
  if (!result.ok) {
    throw new GuildCallError(result.error?.code ?? "REQUEST_FAILED", guildErrorMessage(result.error));
  }
  return result.data as GuildCalls[K]["out"];
};

export const errorText = (error: unknown): string =>
  error instanceof GuildCallError ? error.message : toErrorMessage(error, "Bir sorun oluştu.");
