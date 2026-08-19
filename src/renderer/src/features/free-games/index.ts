// Free-game offers: the page, its data, and the shapes both are built from.
//
// The wire types live in @shared/free-games because main normalises there;
// what this barrel exposes is the renderer half — the hook that reads what main
// has gathered, and the two panels the workspace shell mounts.
export { FreeGamesMainPanel } from "./components/free-games-main-panel";
export { FreeGamesSidebarPanel } from "./components/free-games-sidebar-panel";
export { useFreeGames, type FreeGamesController } from "./use-free-games";
export { freeGamesService } from "./service";
