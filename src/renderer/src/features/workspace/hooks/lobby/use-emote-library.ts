import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { CUSTOM_EMOTE_PREFIX, type CustomEmoteSummary } from "@shared/desktop-api-types";
import workspaceService from "../../services";
import { soundEffectManager } from "@/features/sound-effects";
import { getApiErrorMessage } from "../../workspace-utils";

// What the server accepts, restated here so a bad file is refused before it is
// read, base64-encoded and sent. The server enforces all of it again.
export const EMOTE_ACCEPTED_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
];

// 400_000 base64 characters is the server's ceiling; base64 costs 4 bytes per
// 3, so this is the largest raw file that can fit under it.
export const EMOTE_MAX_FILE_BYTES = 290_000;

// Not a server rule — the server cannot measure duration without decoding — but
// a soundboard clip that runs for a minute is a way to hold a room hostage, and
// the client is where the audio already is.
export const EMOTE_MAX_SECONDS = 12;

// maxEmoteNameLength in internal/lobby/emote_library.go. Restated rather than
// left as a bare 24 in the input, because the name is also SEEDED from the
// chosen file's name — and maxLength only bounds typing, not a value set in
// code, so a long filename used to reach the server and come back rejected.
export const EMOTE_MAX_NAME_LENGTH = 24;

const EMOTE_LIBRARY_KEY = ["emote-library"] as const;
const emoteSampleKey = (emoteId: string): [string, string] => [
  "emote-sample",
  emoteId,
];

interface EmoteLibraryResult {
  emotes: CustomEmoteSummary[];
  quota: number;
  used: number;
}

const EMPTY_LIBRARY: EmoteLibraryResult = { emotes: [], quota: 0, used: 0 };

/**
 * Fetches one sample and hands it to the audio manager.
 *
 * Outside React because it is called from the lobby stream handler, and cached
 * through react-query so a room hammering the same emote fetches it once. The
 * manager caches the DECODED buffer on top of that; this cache is what stops
 * the request.
 */
export const playCustomEmote = async (
  queryClient: QueryClient,
  reference: string,
): Promise<void> => {
  const emoteId = reference.startsWith(CUSTOM_EMOTE_PREFIX)
    ? reference.slice(CUSTOM_EMOTE_PREFIX.length)
    : reference;

  try {
    const result = await queryClient.fetchQuery({
      queryKey: emoteSampleKey(emoteId),
      queryFn: () => workspaceService.getEmoteSample({ emoteId }),
      // A sample never changes: the id is minted per upload, and a deleted
      // emote is a different id if it comes back.
      staleTime: Number.POSITIVE_INFINITY,
      gcTime: 60 * 60_000,
      retry: false,
    });

    if (!result.ok || !result.data) {
      return;
    }

    await soundEffectManager.playSample(emoteId, result.data.dataUrl);
  } catch {
    // A sound that will not load is silence. Nothing here is worth a toast:
    // the emote was somebody else's action, not this user's.
  }
};

export interface EmoteLibraryController {
  emotes: CustomEmoteSummary[];
  quota: number;
  used: number;
  isLoading: boolean;
  isUploading: boolean;
  upload: (name: string, dataUrl: string) => Promise<boolean>;
  remove: (emoteId: string) => Promise<boolean>;
  /** Call when the board is opened. See below for why nothing else refetches. */
  refresh: () => void;
  canUploadMore: boolean;
}

export const useEmoteLibrary = (): EmoteLibraryController => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: EMOTE_LIBRARY_KEY,
    queryFn: () => workspaceService.listEmotes(),
    // The board is shared: every upload lands in everybody's list, not just the
    // uploader's. Nothing pushes that -- there is no library event on the lobby
    // stream -- and the app turns refetchOnWindowFocus off globally, so this
    // query is fetched once on mount and then never again for as long as the
    // client runs. A staleTime alone therefore meant somebody else's upload was
    // invisible for the rest of the session, which is exactly what people
    // reported. `refresh` below is called when the board opens, which is the
    // only moment the answer is looked at.
    staleTime: 30_000,
  });

  const refresh = useCallback((): void => {
    void queryClient.invalidateQueries({ queryKey: EMOTE_LIBRARY_KEY });
  }, [queryClient]);

  const library =
    query.data?.ok && query.data.data ? query.data.data : EMPTY_LIBRARY;

  const uploadMutation = useMutation({
    mutationFn: (payload: { name: string; dataUrl: string }) =>
      workspaceService.uploadEmote(payload),
  });

  const upload = useCallback(
    async (name: string, dataUrl: string): Promise<boolean> => {
      const result = await uploadMutation.mutateAsync({ name, dataUrl });
      if (!result.ok || !result.data) {
        throw new Error(getApiErrorMessage(result.error));
      }

      await queryClient.invalidateQueries({ queryKey: EMOTE_LIBRARY_KEY });
      return true;
    },
    [queryClient, uploadMutation],
  );

  const remove = useCallback(
    async (emoteId: string): Promise<boolean> => {
      const result = await workspaceService.deleteEmote({ emoteId });
      if (!result.ok) {
        throw new Error(getApiErrorMessage(result.error));
      }

      // Both caches: the request cache and the decoded buffer. Without the
      // second one an id that came back would play the deleted sound.
      queryClient.removeQueries({ queryKey: emoteSampleKey(emoteId) });
      soundEffectManager.forgetSample(emoteId);
      await queryClient.invalidateQueries({ queryKey: EMOTE_LIBRARY_KEY });
      return true;
    },
    [queryClient],
  );

  return {
    emotes: library.emotes,
    quota: library.quota,
    used: library.used,
    isLoading: query.isPending,
    isUploading: uploadMutation.isPending,
    upload,
    remove,
    refresh,
    canUploadMore: library.used < library.quota,
  };
};

/** Whether this user may delete a given emote. Owner or admin, same rule the
 *  server enforces. */
export const canDeleteEmote = (
  emote: CustomEmoteSummary,
  currentUserId: string,
  currentUserRole: string,
): boolean => emote.ownerId === currentUserId || currentUserRole === "admin";
