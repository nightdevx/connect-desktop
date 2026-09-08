export interface GameActivity {
  name: string;
  startedAt: string;
}

export const KNOWN_GAME_PROCESSES: Readonly<Record<string, string>> = {
  valorant: "VALORANT",
  "valorant-win64-shipping": "VALORANT",
  cs2: "Counter-Strike 2",
  csgo: "Counter-Strike: Global Offensive",
  r5apex: "Apex Legends",
  r5apex_dx12: "Apex Legends",
  overwatch: "Overwatch 2",
  destiny2: "Destiny 2",
  rainbowsix: "Rainbow Six Siege",
  rainbowsix_vulkan: "Rainbow Six Siege",
  modernwarfare: "Call of Duty: Modern Warfare",
  cod: "Call of Duty",
  blackopscoldwar: "Call of Duty: Black Ops Cold War",
  bf2042: "Battlefield 2042",
  bf1: "Battlefield 1",
  bfv: "Battlefield V",
  discovery: "THE FINALS",
  paladins: "Paladins",
  hunt: "Hunt: Showdown",
  escapefromtarkov: "Escape from Tarkov",
  splitgate: "Splitgate",
  titanfall2: "Titanfall 2",
  doometernalx64vk: "DOOM Eternal",
  halo_infinite: "Halo Infinite",
  "deltaforceclient-win64-shipping": "Delta Force",

  tslgame: "PUBG: Battlegrounds",
  fortniteclient: "Fortnite",
  "fortniteclient-win64-shipping": "Fortnite",
  rust: "Rust",
  rustclient: "Rust",
  dayz: "DayZ",
  "7daystodie": "7 Days to Die",
  valheim: "Valheim",
  projectzomboid: "Project Zomboid",
  projectzomboid64: "Project Zomboid",
  arkascended: "ARK: Survival Ascended",
  shootergame: "ARK: Survival Evolved",
  palworld: "Palworld",
  "palworld-win64-shipping": "Palworld",
  "fsd-win64-shipping": "Deep Rock Galactic",

  "league of legends": "League of Legends",
  leagueclient: "League of Legends",
  dota2: "Dota 2",
  smite: "SMITE",
  "starcraft ii": "StarCraft II",
  sc2: "StarCraft II",
  civilizationvi: "Civilization VI",
  civilizationvii: "Civilization VII",
  aoe2de_s: "Age of Empires II: DE",
  relicardennes: "Age of Empires IV",
  warhammer3: "Total War: WARHAMMER III",
  stellaris: "Stellaris",
  eu4: "Europa Universalis IV",
  hoi4: "Hearts of Iron IV",
  ck3: "Crusader Kings III",
  cities2: "Cities: Skylines II",
  cities: "Cities: Skylines",
  factorio: "Factorio",
  factorygame: "Satisfactory",
  rimworldwin64: "RimWorld",

  wow: "World of Warcraft",
  wowclassic: "World of Warcraft Classic",
  ffxiv_dx11: "Final Fantasy XIV",
  "gw2-64": "Guild Wars 2",
  newworld: "New World",
  lostark: "Lost Ark",
  blackdesert64: "Black Desert Online",
  eldenring: "ELDEN RING",
  nightreign: "ELDEN RING NIGHTREIGN",
  darksoulsiii: "Dark Souls III",
  sekiro: "Sekiro: Shadows Die Twice",
  armoredcore6: "ARMORED CORE VI",
  cyberpunk2077: "Cyberpunk 2077",
  witcher3: "The Witcher 3",
  bg3: "Baldur's Gate 3",
  bg3_dx11: "Baldur's Gate 3",
  starfield: "Starfield",
  skyrimse: "Skyrim Special Edition",
  tesv: "Skyrim",
  fallout4: "Fallout 4",
  fallout76: "Fallout 76",
  "diablo iv": "Diablo IV",
  "diablo ii resurrected": "Diablo II: Resurrected",
  pathofexile: "Path of Exile",
  pathofexile_x64: "Path of Exile",
  pathofexile2: "Path of Exile 2",
  pathofexilesteam: "Path of Exile",
  genshinimpact: "Genshin Impact",
  yuanshen: "Genshin Impact",
  starrail: "Honkai: Star Rail",
  zenlesszonezero: "Zenless Zone Zero",
  wutheringwaves: "Wuthering Waves",
  monsterhunterwilds: "Monster Hunter Wilds",
  monsterhunterworld: "Monster Hunter: World",
  monsterhunterrise: "Monster Hunter Rise",
  hogwartslegacy: "Hogwarts Legacy",
  re4: "Resident Evil 4",
  re8: "Resident Evil Village",
  hades2: "Hades II",
  hades: "Hades",
  hollow_knight: "Hollow Knight",
  hollow_knight_silksong: "Hollow Knight: Silksong",
  stardew: "Stardew Valley",
  stardewvalley: "Stardew Valley",
  terraria: "Terraria",
  noita: "Noita",

  f1_24: "F1 24",
  f1_25: "F1 25",
  forzahorizon5: "Forza Horizon 5",
  assettocorsa: "Assetto Corsa",
  acc: "Assetto Corsa Competizione",
  "beamng.drive": "BeamNG.drive",
  eurotrucks2: "Euro Truck Simulator 2",
  amtrucks: "American Truck Simulator",
  rocketleague: "Rocket League",
  fc25: "EA SPORTS FC 25",
  fc24: "EA SPORTS FC 24",
  fifa23: "FIFA 23",
  nba2k25: "NBA 2K25",
  pes2021: "eFootball PES 2021",
  efootball: "eFootball",

  javaw: "Minecraft",
  minecraft: "Minecraft",
  minecraftlauncher: "Minecraft",
  amongus: "Among Us",
  phasmophobia: "Phasmophobia",
  "lethal company": "Lethal Company",
  lethalcompany: "Lethal Company",
  "content warning": "Content Warning",
  repo: "R.E.P.O.",
  gmod: "Garry's Mod",
  hl2: "Half-Life 2",
  portal2: "Portal 2",
  left4dead2: "Left 4 Dead 2",
  payday2_win32_release: "PAYDAY 2",
  payday3: "PAYDAY 3",
  gta5: "Grand Theft Auto V",
  gta5_enhanced: "Grand Theft Auto V",
  playgtav: "Grand Theft Auto V",
  rdr2: "Red Dead Redemption 2",
  fallguys_client_game: "Fall Guys",
  fallguys_client: "Fall Guys",
  brawlhalla: "Brawlhalla",
  seaofthieves: "Sea of Thieves",
  athena: "Sea of Thieves",
  itstakestwo: "It Takes Two",
  splitfiction: "Split Fiction",
  gtfo: "GTFO",
  raft: "Raft",
  subnautica: "Subnautica",
  robloxplayerbeta: "Roblox",

  tekken8: "TEKKEN 8",
  "polaris-win64-shipping": "TEKKEN 8",
  streetfighter6: "Street Fighter 6",
  mk1: "Mortal Kombat 1",
};

export function normalizeProcessName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const basename = trimmed.split(/[\\/]/).pop() ?? "";
  return basename.toLowerCase().replace(/\.exe$/, "");
}

export function matchKnownGame(processNames: readonly string[]): string | null {
  for (const raw of processNames) {
    const key = normalizeProcessName(raw);
    if (!key) {
      continue;
    }

    const title = KNOWN_GAME_PROCESSES[key];
    if (title) {
      return title;
    }
  }

  return null;
}
