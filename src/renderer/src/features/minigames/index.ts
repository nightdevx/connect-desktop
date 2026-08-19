// Single-player games: the two panels the workspace shell mounts, and nothing
// else.
//
// No service, no hook, no wire types -- unlike free-games, this page talks to
// nothing. Every game runs in the renderer, the rules live in minigames-logic
// and the only state that outlives a session is a personal best in
// localStorage. Adding a networked game later means adding a service here; it
// does not mean changing anything below.
export { MinigamesMainPanel } from "./components/minigames-main-panel";
export { MinigamesSidebarPanel } from "./components/minigames-sidebar-panel";
