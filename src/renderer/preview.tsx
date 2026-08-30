import { createRoot } from "react-dom/client";
import { ConfigProvider, theme } from "antd";
import "./src/styles/global.css";
import { findMinigame } from "@/features/minigames";

const seeded = {
  version: 1,
  xp: 2400,
  supplies: 5800,
  ammo: 15900,
  credits: 902,
  stars: { "1": 3, "2": 3, "3": 2, "4": 3, "5": 1, "6": 2, "7": 3, "8": 1 },
  best: { "1": 4200, "2": 6100 },
  upgrades: { "fp-damage": 3, "fp-rate": 1, "mp-start": 2, "log-loot": 1 },
  weapons: ["pistol", "smg", "shotgun", "rifle"],
  attachments: ["barrel-compensator", "optic-reflex"],
  loadout: {
    weapon: "rifle",
    attachments: ["optic-reflex"],
    abilities: ["airstrike", "reinforce"],
  },
  medals: ["first-blood", "kills-1k"],
  missionDay: "",
  missionProgress: {},
  missionClaimed: [],
  totals: { runs: 34, kills: 4820, bosses: 6, levels: 8, leaks: 41, perfect: 3 },
};

localStorage.setItem("ct.minigames.gunline.profile", JSON.stringify(seeded));

function Preview() {
  const entry = findMinigame("gunline");
  if (!entry) {
    return <p>gunline yok</p>;
  }
  const Board = entry.Component;
  return (
    <div className="ct-minigames-page">
      <div className="ct-minigames-grid">
        <Board currentUserId="preview" difficulty="normal" />
      </div>
    </div>
  );
}

const host = document.getElementById("root");
if (host) {
  createRoot(host).render(
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      <Preview />
    </ConfigProvider>,
  );
}
