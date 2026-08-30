import type { AbilityId, AbilitySpec } from "./types";

export const ABILITIES: Record<AbilityId, AbilitySpec> = {
  airstrike: {
    id: "airstrike",
    label: "Hava Desteği",
    detail: "Seçtiğin şeridi baştan sona tarar.",
    cooldown: 22,
    duration: 0,
    radius: 1.4,
    power: 6,
    aimed: true,
  },
  mortar: {
    id: "mortar",
    label: "Havan Barajı",
    detail: "Üç saniye sonra geniş alana düşer.",
    cooldown: 18,
    duration: 0,
    radius: 3.2,
    power: 9,
    aimed: true,
  },
  smoke: {
    id: "smoke",
    label: "Sis Perdesi",
    detail: "Dört saniye düşman ateşi isabet etmez.",
    cooldown: 26,
    duration: 4,
    radius: 0,
    power: 0,
    aimed: false,
  },
  reinforce: {
    id: "reinforce",
    label: "Takviye",
    detail: "Müfrezeye anında er katılır.",
    cooldown: 34,
    duration: 0,
    radius: 0,
    power: 5,
    aimed: false,
  },
  adrenaline: {
    id: "adrenaline",
    label: "Adrenalin",
    detail: "Altı saniye çift atış hızı.",
    cooldown: 24,
    duration: 6,
    radius: 0,
    power: 2,
    aimed: false,
  },
};

export const ABILITY_ORDER: readonly AbilityId[] = [
  "airstrike",
  "mortar",
  "smoke",
  "reinforce",
  "adrenaline",
];

export function isAbilityId(value: string): value is AbilityId {
  return (ABILITY_ORDER as readonly string[]).includes(value);
}
