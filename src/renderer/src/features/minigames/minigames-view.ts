import { create } from "zustand";
import { MINIGAME_IDS, type MinigameId } from "@/store/minigame-scores";

/**
 * Which half of the Odak Oyunlar page is on screen: the game list, or the game
 * that is selected.
 *
 * Presentation only, and only read under Odak: the old page has no list and
 * always shows the selected game. Its own store because the list, the sidebar
 * and the live tables all open a game, and they are three components the shell
 * mounts apart. Not persisted: the app opens on the list.
 */
export const useMinigamesView = create<{ browsing: boolean }>(() => ({ browsing: true }));

/** Show the selected game's page. Called with every way of picking a game. */
export const showMinigame = (): void => useMinigamesView.setState({ browsing: false });

/** Back to the list. */
export const showMinigameList = (): void => useMinigamesView.setState({ browsing: true });

/**
 * One of eight tile colours per game (odak-oyunlar.css), so a game wears the
 * same colour on its card, its table row and its page header.
 */
export const gameTone = (id: MinigameId): number => MINIGAME_IDS.indexOf(id) % 8;
