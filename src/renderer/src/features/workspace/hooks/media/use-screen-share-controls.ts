import { useState, useCallback, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import {
  type LobbyStateMember,
  type ScreenCaptureSourceDescriptor,
} from "@shared/desktop-api-types";
import {
  resolveScreenContentMode,
  type LiveKitMediaSession,
} from "@/features/livekit";
import {
  startScreenCapture,
  startSystemLoopbackAudioTrack,
  stopActiveSystemLoopback,
  type ScreenShareContentMode,
  type ScreenShareQualityPreset,
  type ScreenShareSourceKind,
  getScreenShareQualityDimensions,
  getScreenShareQualityOption,
  getDefaultScreenShareQuality,
  getLowerScreenShareQuality
} from "@/features/screen-share";
import workspaceService from "../../services";
import { type StreamPreferences } from "../../components/settings/settings-main-panel-types";
import {
  readStreamPreferences,
  stopMediaStreamTracks,
} from "../../workspace-media-utils";
import {
  registerLiveScreenShareControls,
  type ScreenShareFrameRate,
} from "./live-screen-share";

interface UseScreenShareControlsParams {
  currentUserId: string;
  activeLobbyRef: MutableRefObject<string | null>;
  liveKitSessionRef: MutableRefObject<LiveKitMediaSession | null>;
  streamPreferences: StreamPreferences;
  // Same setter the settings panel writes through, so a framerate picked from
  // the toolbar menu and one picked in Ayarlar → Yayın cannot disagree.
  // Required, not optional: while it was optional WorkspaceShell simply never
  // passed it, persistFrameRate fell back to a bare localStorage write, and the
  // shell's own copy of the preferences went stale — Ayarlar → Yayın then
  // showed the old framerate and wrote it back over the new one.
  onSaveStreamPreferences: (next: StreamPreferences) => void;
  setStatus: (message: string, tone: "ok" | "warn" | "error") => void;
  patchLobbyMemberState: (
    userId: string,
    patch: Partial<Pick<LobbyStateMember, "screenSharing">>
  ) => void;
}

// A capture whose source died — the shared window was closed. Read through a
// helper rather than inline: TypeScript narrows `readyState` at the first check
// and then calls every later one impossible, even though the whole point is
// that an await sits between them and the OS can end the track in that gap.
const isTrackEnded = (track: MediaStreamTrack): boolean =>
  track.readyState === "ended";

// What the running share was started with, so the settings menu can re-capture
// it with one thing changed instead of asking the user everything again.
interface LiveScreenShareState {
  sourceId: string;
  quality: ScreenShareQualityPreset;
  frameRate: ScreenShareFrameRate;
  contentMode: ScreenShareContentMode;
  stream: MediaStream;
}

export const useScreenShareControls = ({
  currentUserId,
  activeLobbyRef,
  liveKitSessionRef,
  streamPreferences,
  onSaveStreamPreferences,
  setStatus,
  patchLobbyMemberState,
}: UseScreenShareControlsParams) => {
  const [screenEnabled, setScreenEnabledState] = useState(false);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [isScreenShareModalOpen, setIsScreenShareModalOpen] = useState(false);
  const [isLoadingScreenShareSources, setIsLoadingScreenShareSources] = useState(false);
  const [isStartingScreenShare, setIsStartingScreenShare] = useState(false);
  const [screenShareModalError, setScreenShareModalError] = useState<string | null>(null);
  const [screenShareSources, setScreenShareSources] = useState<ScreenCaptureSourceDescriptor[]>([]);
  const [selectedScreenShareSourceId, setSelectedScreenShareSourceId] = useState<string | null>(null);
  const [selectedScreenShareSourceKind, setSelectedScreenShareSourceKind] = useState<ScreenShareSourceKind>("screen");
  const [selectedScreenShareQuality, setSelectedScreenShareQuality] = useState<ScreenShareQualityPreset>(() =>
    getDefaultScreenShareQuality(readStreamPreferences().frameRate)
  );
  const [selectedScreenShareContentMode, setSelectedScreenShareContentMode] =
    useState<ScreenShareContentMode>("auto");
  const [captureSystemAudio, setCaptureSystemAudio] = useState(() => streamPreferences.captureSystemAudio);
  // The live value, for the code that runs after an await — same reason as the
  // camera hook's: the post-join sync runs several awaits after
  // resetLocalMediaCapture turned sharing off, and the render closure still said
  // it was on, so the new room got a screen-share badge with a dead "watch"
  // affordance behind it.
  const screenEnabledRef = useRef(false);
  screenEnabledRef.current = screenEnabled;
  const liveShareRef = useRef<LiveScreenShareState | null>(null);
  // Two overlapping swaps would both read the same "previous" stream and the
  // loser would stop a track the winner had just published.
  const isSwappingLiveShareRef = useRef(false);
  // Cancellation token for an in-flight settings swap: bumped by every teardown
  // and by every new swap. applyLiveScreenShareChange re-reads it after each of
  // its awaits and gives up if it no longer owns the share.
  const shareGenerationRef = useRef(0);
  // The newest preferences, not the snapshot a swap started with. persistFrameRate
  // runs about a second after the swap begins, and writing back the closed-over
  // object undid whatever Ayarlar → Yayın had saved in between — toggling
  // "Sistem sesini yakala" off during a quality change turned it straight back on
  // in both state and localStorage.
  const streamPreferencesRef = useRef(streamPreferences);
  streamPreferencesRef.current = streamPreferences;

  // Every teardown routes through here — the toolbar's stop button, the OS
  // overlay's onended, and resetLocalMediaCapture when a lobby is left — so it
  // is the one place that can cancel a swap that is still in flight. The bump
  // has to be synchronous: the `!screenEnabled` effect below runs a tick after
  // the click, and a swap's await could resume inside that gap and republish a
  // desktop the user had already stopped sharing.
  const setScreenEnabled = useCallback((enabled: boolean): void => {
    if (!enabled) {
      shareGenerationRef.current += 1;
    }
    setScreenEnabledState(enabled);
  }, []);

  const monitorScreenShareSources = useMemo(() => {
    return screenShareSources.filter((source) => source.kind === "screen");
  }, [screenShareSources]);

  const windowScreenShareSources = useMemo(() => {
    return screenShareSources.filter((source) => source.kind === "window");
  }, [screenShareSources]);

  const activeScreenShareSources = useMemo(() => {
    return selectedScreenShareSourceKind === "screen"
      ? monitorScreenShareSources
      : windowScreenShareSources;
  }, [monitorScreenShareSources, selectedScreenShareSourceKind, windowScreenShareSources]);

  const syncLobbyMediaState = useCallback(
    async (lobbyId: string): Promise<void> => {
      if (lobbyId.startsWith("call_")) return;
      if (screenEnabledRef.current) {
        const result = await workspaceService.setLobbyScreenSharing({
          lobbyId,
          enabled: true,
        });
        if (!result.ok) {
          setStatus(
            `Yayin durumu uygulanamadi: ${result.error?.message ?? "Bilinmeyen hata"}`,
            "warn"
          );
        }
      }
    },
    [setStatus]
  );

  // Shared by the share dialog and the toolbar's "ekran değiştir" menu: both
  // list the same sources, and the kind inference below is the only place that
  // knows a raw descriptor without a `kind` is a window.
  const fetchScreenShareSources = useCallback(async (): Promise<
    { sources: ScreenCaptureSourceDescriptor[]; error: string | null }
  > => {
    const result = await workspaceService.listScreenCaptureSources();
    if (!result.ok || !result.data) {
      return {
        sources: [],
        error: result.error?.message ?? "Yayin kaynaklari alinamadi",
      };
    }

    // The kind fallback stays even though the contract makes the field
    // required: it is derived from the id prefix, which is Electron's own
    // guarantee, so it costs nothing and covers a source arriving from a main
    // process that has not been restarted after an update.
    //
    // The `thumbnailDataUri` fallback that used to sit beside it is gone —
    // nothing in the app has ever produced that field, and reaching for it
    // needed an `any` that switched the type checker off for the whole mapper.
    const sources = result.data.sources.map((rawSource) => {
      const inferredKind: ScreenShareSourceKind = rawSource.id.startsWith(
        "screen:",
      )
        ? "screen"
        : "window";

      return {
        id: rawSource.id,
        name: rawSource.name || "Bilinmeyen Kaynak",
        kind: rawSource.kind ?? inferredKind,
        displayId: rawSource.displayId || null,
        previewDataUrl: rawSource.previewDataUrl ?? null,
      };
    });

    return { sources, error: null };
  }, []);

  const loadScreenShareSources = useCallback(async (): Promise<void> => {
    setIsLoadingScreenShareSources(true);
    setScreenShareModalError(null);

    const { sources, error } = await fetchScreenShareSources();
    if (error) {
      setScreenShareSources([]);
      setSelectedScreenShareSourceId(null);
      setScreenShareModalError(error);
      setIsLoadingScreenShareSources(false);
      return;
    }

    setScreenShareSources(sources);

    setSelectedScreenShareSourceId((previous) => {
      if (previous && sources.some((source) => source.id === previous)) return previous;
      const preferred = sources.find((source) => source.kind === "screen") ?? sources[0];
      return preferred?.id ?? null;
    });

    setSelectedScreenShareSourceKind(() => {
      const hasScreens = sources.some((source) => source.kind === "screen");
      return hasScreens ? "screen" : "window";
    });

    setIsLoadingScreenShareSources(false);
  }, [fetchScreenShareSources]);

  const handleScreenShareSourceKindChange = useCallback(
    (kind: ScreenShareSourceKind): void => {
      setSelectedScreenShareSourceKind(kind);
      const candidates = kind === "screen" ? monitorScreenShareSources : windowScreenShareSources;
      setSelectedScreenShareSourceId((previous) => {
        if (previous && candidates.some((source) => source.id === previous)) return previous;
        return candidates[0]?.id ?? null;
      });
    },
    [monitorScreenShareSources, windowScreenShareSources]
  );

  const closeScreenShareModal = useCallback((): void => {
    if (isStartingScreenShare) return;
    setIsScreenShareModalOpen(false);
    setScreenShareModalError(null);
  }, [isStartingScreenShare]);

  const openScreenShareModal = useCallback((): void => {
    const lobbyId = activeLobbyRef.current;
    if (!lobbyId) {
      setStatus("Ekran paylasimi icin once bir lobiye katil", "warn");
      return;
    }

    setSelectedScreenShareQuality(getDefaultScreenShareQuality(streamPreferences.frameRate));
    setCaptureSystemAudio(streamPreferences.captureSystemAudio);
    setIsScreenShareModalOpen(true);
    void loadScreenShareSources();
  }, [activeLobbyRef, setStatus, streamPreferences.frameRate, streamPreferences.captureSystemAudio, loadScreenShareSources]);

  // "Stop sharing" from the OS-level overlay, or a window that just closed.
  // Every capture the app publishes needs this, and the toolbar menu re-captures
  // behind the user's back, so it lives here rather than inline at the one call
  // site that used to have it.
  const attachScreenShareEndHandler = useCallback(
    (videoTrack: MediaStreamTrack | undefined): void => {
      if (!videoTrack) return;

      const handleSourceEnded = (): void => {
        const latestLobbyID = activeLobbyRef.current;
        setLocalScreenStream(null);
        setScreenEnabled(false);
        void stopActiveSystemLoopback();
        void liveKitSessionRef.current?.unpublishScreen();
        patchLobbyMemberState(currentUserId, { screenSharing: false });

        if (latestLobbyID && !latestLobbyID.startsWith("call_")) {
          void workspaceService.setLobbyScreenSharing({
            lobbyId: latestLobbyID,
            enabled: false,
          });
        }
      };

      videoTrack.onended = handleSourceEnded;

      // A capture can die before it is ever adopted: the window the user picked
      // closes inside the ~0.5-1.5s publish/replace await. Assigning `onended`
      // to a track that is already in the `ended` state never fires it — the
      // event was dispatched while there was no handler — so the share stayed
      // "on" forever, viewers frozen on the last frame. Callers therefore attach
      // LAST, after writing the state this teardown has to unwind.
      if (isTrackEnded(videoTrack)) {
        handleSourceEnded();
      }
    },
    [
      activeLobbyRef,
      currentUserId,
      liveKitSessionRef,
      patchLobbyMemberState,
      setScreenEnabled,
    ],
  );

  const startScreenShareFromModal = useCallback(async (): Promise<void> => {
    const lobbyId = activeLobbyRef.current;
    if (!lobbyId) {
      setStatus("Ekran paylasimi icin once bir lobiye katil", "warn");
      return;
    }

    const selectedSourceId = selectedScreenShareSourceId;
    if (!selectedSourceId) {
      setScreenShareModalError("Lütfen bir pencere veya monitör seç.");
      return;
    }

    const qualityOption = getScreenShareQualityOption(selectedScreenShareQuality);
    const dimensions = getScreenShareQualityDimensions(selectedScreenShareQuality);

    // Same cancellation token the swap path uses, for the same reason: every
    // teardown bumps it through setScreenEnabled(false), including the ones the
    // user never asked for — a peer leaving, a call ending, being kicked all run
    // resetLocalMediaCapture while this function is parked on an await.
    const generation = shareGenerationRef.current;
    const isCancelled = (): boolean => shareGenerationRef.current !== generation;

    setIsStartingScreenShare(true);
    setScreenShareModalError(null);

    try {
      const { stream, warning, sourceName } = await startScreenCapture({
        frameRate: qualityOption.frameRate,
        resolution: qualityOption.resolution,
        captureSystemAudio,
        sourceId: selectedSourceId,
      });

      const [videoTrack] = stream.getVideoTracks();

      // Await #1. Capturing takes 0.3-1s; publishing after a room transition
      // would hand the desktop to a room the user has already been removed from.
      const cancelledBeforePublish = isCancelled();
      if (cancelledBeforePublish || !videoTrack || isTrackEnded(videoTrack)) {
        stopMediaStreamTracks(stream);
        void stopActiveSystemLoopback();
        if (!cancelledBeforePublish) {
          setStatus("Seçilen kaynak yayına alınamadı, tekrar dene", "warn");
        }
        return;
      }

      const contentMode = resolveScreenContentMode(
        selectedScreenShareContentMode,
        qualityOption.frameRate,
      );
      const screenMode = contentMode === "motion" ? "motion" : "slides";

      try {
        await liveKitSessionRef.current?.publishScreenStream(stream, screenMode, {
          maxBitrateBps: qualityOption.maxBitrateBps,
          maxFramerate: qualityOption.frameRate,
          width: dimensions.width,
          height: dimensions.height,
        });
      } catch (error) {
        stopMediaStreamTracks(stream);
        void stopActiveSystemLoopback();
        throw error;
      }

      // Await #2. A teardown that landed while the publish was in flight has
      // already queued its unpublish behind it on the video queue, so the SFU
      // side unwinds itself — but nothing else stops this capture, and nothing
      // else keeps the UI from adopting a share the user no longer has.
      if (isCancelled()) {
        stopMediaStreamTracks(stream);
        void stopActiveSystemLoopback();
        return;
      }

      if (warning) setStatus(warning, "warn");
      else if (sourceName) setStatus(`Yayin baslatildi: ${sourceName}`, "ok");

      liveShareRef.current = {
        sourceId: selectedSourceId,
        quality: selectedScreenShareQuality,
        frameRate: qualityOption.frameRate,
        contentMode: selectedScreenShareContentMode,
        stream,
      };
      setLocalScreenStream(stream);
      setScreenEnabled(true);
      patchLobbyMemberState(currentUserId, { screenSharing: true });

      // Attached after the state above, never before: a window that closed
      // during the publish await gives us an already-ended track, and the
      // handler tears that share straight back down.
      attachScreenShareEndHandler(videoTrack);
      setIsScreenShareModalOpen(false);

      if (isTrackEnded(videoTrack)) {
        // The handler has already unpublished and told the lobby the share is
        // over; announcing "sharing: true" now would resurrect it server-side.
        setStatus("Seçilen kaynak kapandı, yayın durduruldu", "warn");
        return;
      }

      if (!lobbyId.startsWith("call_")) {
        const result = await workspaceService.setLobbyScreenSharing({
          lobbyId,
          enabled: true,
        });

        if (!result.ok) {
          setStatus(
            `Yayin durumu guncellenemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
            "warn"
          );
        }
      }
    } catch (error) {
      setStatus(
        `Ekran paylasimi baslatilamadi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
        "error"
      );
    } finally {
      setIsStartingScreenShare(false);
    }
  }, [
    activeLobbyRef,
    attachScreenShareEndHandler,
    currentUserId,
    liveKitSessionRef,
    patchLobbyMemberState,
    setScreenEnabled,
    setStatus,
    captureSystemAudio,
    selectedScreenShareSourceId,
    selectedScreenShareQuality,
    selectedScreenShareContentMode,
  ]);

  // Framerate is persisted through the settings panel's own setter so the two
  // pickers cannot drift apart. Quality is not: it is a per-share choice the
  // dialog already re-derives from the framerate every time it opens.
  const persistFrameRate = useCallback(
    (frameRate: ScreenShareFrameRate): void => {
      const next: StreamPreferences = {
        ...streamPreferencesRef.current,
        frameRate,
      };
      onSaveStreamPreferences(next);
    },
    [onSaveStreamPreferences],
  );

  /**
   * Applies one change — quality, framerate or source — to the share that is
   * already running.
   *
   * The capture itself has to be redone (a desktop capture's resolution and
   * framerate are fixed at getUserMedia time), but the publication is not:
   * replaceScreenStream swaps the track under the live sender, so viewers do
   * not see the stream drop and come back. Audio is deliberately not
   * re-captured — the system loopback is an independent pipeline that is
   * already published, and restarting it would put a hole in exactly the thing
   * this avoids.
   *
   * Every await here is a window in which the user can hit stop. `live` is read
   * once, before the first one, so without the generation check below the swap
   * would resume against a share that no longer exists and put the desktop back
   * on the SFU while the toolbar said "Ekranı Paylaş".
   */
  const applyLiveScreenShareChange = useCallback(
    async (change: {
      quality?: ScreenShareQualityPreset;
      frameRate?: ScreenShareFrameRate;
      sourceId?: string;
    }): Promise<void> => {
      const live = liveShareRef.current;
      if (!live || isSwappingLiveShareRef.current) return;

      const quality = change.quality ?? live.quality;
      const qualityOption = getScreenShareQualityOption(quality);
      const dimensions = getScreenShareQualityDimensions(quality);
      // A preset carries its own framerate, so picking one moves the framerate
      // with it; an explicit framerate choice then overrides it.
      const frameRate =
        change.frameRate ??
        (change.quality ? qualityOption.frameRate : live.frameRate);
      const sourceId = change.sourceId ?? live.sourceId;

      // Also bumped here, so a newer swap invalidates an older one instead of
      // the two racing to decide what is published.
      shareGenerationRef.current += 1;
      const generation = shareGenerationRef.current;
      const isCancelled = (): boolean =>
        shareGenerationRef.current !== generation || liveShareRef.current !== live;

      isSwappingLiveShareRef.current = true;

      let nextVideoTrack: MediaStreamTrack | undefined;
      try {
        const { stream, sourceName } = await startScreenCapture({
          frameRate,
          resolution: qualityOption.resolution,
          captureSystemAudio: false,
          sourceId,
        });

        [nextVideoTrack] = stream.getVideoTracks();
        if (!nextVideoTrack) {
          stopMediaStreamTracks(stream);
          throw new Error("Yeni yayın kaynağı görüntü üretmedi");
        }

        // Await #1. Capturing a desktop takes 0.3-1s and stop is one click away
        // the whole time; publishing this would hand viewers a screen the user
        // believes they already stopped sharing. A source that closed inside the
        // same window is just as unpublishable — replacing with an ended track
        // freezes every viewer on its last frame.
        const cancelledBeforeReplace = isCancelled();
        if (cancelledBeforeReplace || isTrackEnded(nextVideoTrack)) {
          nextVideoTrack.stop();
          if (!cancelledBeforeReplace) {
            setStatus("Seçilen kaynak kapandı, mevcut yayın sürüyor", "warn");
          }
          return;
        }

        // The already-published system audio track rides along, so the new
        // stream is what a reconnect would republish in full.
        live.stream.getAudioTracks().forEach((track) => stream.addTrack(track));

        const contentMode = resolveScreenContentMode(live.contentMode, frameRate);
        const screenMode = contentMode === "motion" ? "motion" : "slides";
        const publishQuality = {
          maxBitrateBps: qualityOption.maxBitrateBps,
          maxFramerate: frameRate,
          width: dimensions.width,
          height: dimensions.height,
        };

        const replaced = await liveKitSessionRef.current?.replaceScreenStream(
          stream,
          screenMode,
          publishQuality,
        );

        // Await #2. A stop that landed while this was queued unpublishes first
        // and `replaced` comes back false; one that landed after a successful
        // replace unpublishes straight after it. Either way this capture must
        // not be adopted.
        //
        // There is deliberately no publish fallback here. "Nothing published to
        // replace" and "the user just stopped sharing" are the same observation
        // from this side, so a replace that quietly became a publish is exactly
        // what put a stopped share back on the SFU. A reconnect republishes the
        // OLD capture from desiredScreenStream on its own, so the share
        // survives — only this one adjustment is lost.
        const cancelled = isCancelled();
        if (cancelled || !replaced) {
          nextVideoTrack.stop();
          if (!cancelled) {
            setStatus("Yayın ayarı uygulanamadı, mevcut yayın sürüyor", "warn");
          }
          return;
        }

        // Only the outgoing video: the audio track moved to the new stream and
        // is still published.
        live.stream.getVideoTracks().forEach((track) => {
          track.onended = null;
          track.stop();
        });

        liveShareRef.current = {
          sourceId,
          quality,
          frameRate,
          contentMode: live.contentMode,
          stream,
        };
        setSelectedScreenShareQuality(quality);
        setLocalScreenStream(stream);
        persistFrameRate(frameRate);

        // The source can still die inside the replace window: pick a window
        // from "Ekran Değiştir", close it within a second, and this track is
        // adopted already ended. It is the published one now, so the swap
        // cannot be abandoned — the share is torn down instead, and calling
        // this a success would leave viewers frozen on the last frame with the
        // toolbar still lit.
        const sourceEnded = isTrackEnded(nextVideoTrack);
        setStatus(
          sourceEnded
            ? "Seçilen kaynak kapandı, yayın durduruldu"
            : sourceName
              ? `Yayin guncellendi: ${sourceName}`
              : "Yayin guncellendi",
          sourceEnded ? "warn" : "ok",
        );

        // Attached last: for an ended track the handler fires synchronously and
        // has to unwind the state written just above, not race it.
        attachScreenShareEndHandler(nextVideoTrack);
      } catch (error) {
        // Only the new video track, never the whole stream: the still-published
        // system audio tracks were moved into it above, so stopping the stream
        // would cut the audio of a share that is still running. Without this the
        // failed capture kept running for the life of the process — CPU plus a
        // lit OS screen-capture indicator — and nothing in the UI could reach
        // it, because localScreenStream still pointed at the old stream.
        nextVideoTrack?.stop();
        setStatus(
          `Yayin ayari uygulanamadi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
          "error",
        );
      } finally {
        isSwappingLiveShareRef.current = false;
      }
    },
    [
      attachScreenShareEndHandler,
      liveKitSessionRef,
      persistFrameRate,
      setStatus,
    ],
  );

  /**
   * Turns system audio on or off on a share that is already running.
   *
   * Audio used to be decided once, in the start dialog: forgetting to tick
   * "Sistem sesini yakala" meant stopping the share and starting it again,
   * which drops the picture for everyone watching. Only the audio publication
   * is touched here — the video track and its SID survive untouched.
   *
   * The choice is also written back to the saved preference, so the next share
   * starts the way this one ended.
   */
  const applyLiveSystemAudio = useCallback(
    async (enabled: boolean): Promise<void> => {
      const session = liveKitSessionRef.current;
      if (!liveShareRef.current || !session) return;

      const persist = (value: boolean): void => {
        setCaptureSystemAudio(value);
        onSaveStreamPreferences({
          ...streamPreferencesRef.current,
          captureSystemAudio: value,
        });
      };

      if (!enabled) {
        const applied = await session.setScreenAudioTrack(null);
        // stop() does not dispatch "ended", so the track's own listener never
        // fires — the native capture has to be stopped by hand or WASAPI keeps
        // running for the life of the process.
        await stopActiveSystemLoopback();
        if (applied) {
          persist(false);
          setStatus("Yayın sesi kapatıldı", "ok");
        }
        return;
      }

      // Same cancellation token every other await in this hook uses: capturing
      // takes a moment and stop is one click away the whole time.
      const generation = shareGenerationRef.current;

      const track = await startSystemLoopbackAudioTrack();
      if (!track) {
        setStatus(
          "Sistem sesi bu cihazda yakalanamadı (yankısız ses modülü yüklenemedi)",
          "warn",
        );
        return;
      }

      if (shareGenerationRef.current !== generation) {
        track.stop();
        await stopActiveSystemLoopback();
        return;
      }

      const applied = await session.setScreenAudioTrack(track);
      if (!applied) {
        track.stop();
        await stopActiveSystemLoopback();
        return;
      }

      persist(true);
      setStatus("Yayın sesi açıldı", "ok");
    },
    [liveKitSessionRef, onSaveStreamPreferences, setStatus],
  );

  // Not every teardown runs the track's onended handler — stopMediaStreamTracks
  // clears it first, and leaving a lobby goes through resetLocalMediaCapture —
  // but all of them clear screenEnabled, so that is the honest single place to
  // forget what was being shared.
  useEffect(() => {
    if (!screenEnabled) {
      liveShareRef.current = null;
    }
  }, [screenEnabled]);

  useEffect(() => {
    const session = liveKitSessionRef.current;
    if (!session) {
      return;
    }

    session.setEncoderOverloadHandler((reason) => {
      const live = liveShareRef.current;
      if (!live) {
        return;
      }

      if (isSwappingLiveShareRef.current) {
        liveKitSessionRef.current?.resetEncoderOverloadNotice();
        return;
      }

      const cause =
        reason === "cpu"
          ? "İşlemci yayına yetişemiyor"
          : "Yükleme hızı yayına yetmiyor";
      const lower = getLowerScreenShareQuality(live.quality);

      if (!lower) {
        setStatus(`${cause}; kalite daha fazla düşürülemiyor.`, "warn");
        return;
      }

      setStatus(
        `${cause}, yayın kalitesi "${getScreenShareQualityOption(lower).label}" seviyesine düşürüldü.`,
        "warn",
      );

      void applyLiveScreenShareChange({ quality: lower }).finally(() => {
        liveKitSessionRef.current?.resetEncoderOverloadNotice();
      });
    });

    return () => {
      session.setEncoderOverloadHandler(null);
    };
  }, [applyLiveScreenShareChange, liveKitSessionRef, setStatus]);

  // The toolbar's stream menu lives four components away from this hook and
  // every file on the path is owned by something else, so the controls are
  // registered in a module slot instead of threaded through as props.
  useEffect(() => {
    return registerLiveScreenShareControls({
      getQuality: () => liveShareRef.current?.quality ?? selectedScreenShareQuality,
      getFrameRate: () => liveShareRef.current?.frameRate ?? streamPreferences.frameRate,
      getSourceId: () => liveShareRef.current?.sourceId ?? null,
      // Read off the live capture, so the menu shows what is actually being
      // broadcast rather than what the last start dialog was set to.
      isSystemAudioOn: () =>
        (liveShareRef.current?.stream.getAudioTracks().length ?? 0) > 0,
      listSources: async () => (await fetchScreenShareSources()).sources,
      changeQuality: (quality) => applyLiveScreenShareChange({ quality }),
      changeFrameRate: (frameRate) => applyLiveScreenShareChange({ frameRate }),
      changeSource: (sourceId) => applyLiveScreenShareChange({ sourceId }),
      setSystemAudio: applyLiveSystemAudio,
    });
  }, [
    applyLiveScreenShareChange,
    applyLiveSystemAudio,
    fetchScreenShareSources,
    selectedScreenShareQuality,
    streamPreferences.frameRate,
  ]);

  const handleScreenToggle = useCallback((): void => {
    const lobbyId = activeLobbyRef.current;
    if (!lobbyId) {
      setStatus("Ekran paylasimi icin once bir lobiye katil", "warn");
      return;
    }

    if (screenEnabled) {
      stopMediaStreamTracks(localScreenStream);
      void stopActiveSystemLoopback();
      setLocalScreenStream(null);
      setScreenEnabled(false);
      void liveKitSessionRef.current?.unpublishScreen();
      patchLobbyMemberState(currentUserId, { screenSharing: false });

      if (!lobbyId.startsWith("call_")) {
        void workspaceService.setLobbyScreenSharing({
          lobbyId,
          enabled: false,
        }).then((result) => {
          if (!result.ok) {
            setStatus(
              `Yayin durumu guncellenemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
              "warn"
            );
          }
        });
      }

      return;
    }

    openScreenShareModal();
    // currentUserId and setScreenEnabled are both stable for the life of the
    // session — the id comes from the authenticated user and the setter is a
    // []-dependency useCallback — so listing them would only add noise to a list
    // whose job is to say what actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeLobbyRef,
    screenEnabled,
    localScreenStream,
    liveKitSessionRef,
    patchLobbyMemberState,
    setStatus,
    openScreenShareModal,
  ]);

  return {
    screenEnabled,
    setScreenEnabled,
    localScreenStream,
    setLocalScreenStream,
    isScreenShareModalOpen,
    isLoadingScreenShareSources,
    isStartingScreenShare,
    screenShareModalError,
    screenShareSources,
    selectedScreenShareSourceId,
    setSelectedScreenShareSourceId,
    selectedScreenShareSourceKind,
    selectedScreenShareQuality,
    setSelectedScreenShareQuality,
    selectedScreenShareContentMode,
    setSelectedScreenShareContentMode,
    captureSystemAudio,
    setCaptureSystemAudio,
    monitorScreenShareSources,
    windowScreenShareSources,
    activeScreenShareSources,
    handleScreenToggle,
    handleScreenShareSourceKindChange,
    closeScreenShareModal,
    loadScreenShareSources,
    startScreenShareFromModal,
    syncLobbyMediaState,
  };
};




