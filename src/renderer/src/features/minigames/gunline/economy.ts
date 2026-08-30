import { hashSeed, nextRandom } from "./rng";
import { CAMPAIGN_LEVELS } from "./tuning";
import type { GunlineProfile, LevelReward, RunSummary } from "./types";

export const RANKS: readonly string[] = [
  "Er",
  "Onbaşı",
  "Çavuş",
  "Üstçavuş",
  "Başçavuş",
  "Astsubay",
  "Teğmen",
  "Üsteğmen",
  "Yüzbaşı",
  "Binbaşı",
  "Yarbay",
  "Albay",
];

export function xpForRank(index: number): number {
  if (index <= 0) {
    return 0;
  }
  return Math.round(320 * Math.pow(index, 1.62));
}

export interface RankProgress {
  index: number;
  label: string;
  current: number;
  next: number;
  ratio: number;
}

export function rankProgress(xp: number): RankProgress {
  let index = 0;
  while (index + 1 < RANKS.length && xp >= xpForRank(index + 1)) {
    index += 1;
  }
  const current = xpForRank(index);
  const next = index + 1 < RANKS.length ? xpForRank(index + 1) : current;
  const span = Math.max(1, next - current);
  return {
    index,
    label: RANKS[index],
    current,
    next,
    ratio: next === current ? 1 : Math.min(1, (xp - current) / span),
  };
}

export function levelReward(levelId: number): LevelReward {
  return {
    supplies: 60 + levelId * 14,
    ammo: 40 + levelId * 9,
    credits: 5 + Math.floor(levelId / 3),
    xp: 80 + levelId * 12,
  };
}

export function rewardCeilingRatio(): number {
  const first = levelReward(1);
  const last = levelReward(CAMPAIGN_LEVELS);
  return last.supplies / first.supplies;
}

export function scaleReward(reward: LevelReward, stars: number, loot: number): LevelReward {
  const factor = (1 + Math.max(0, stars - 1) * 0.15) * Math.max(1, loot);
  return {
    supplies: Math.round(reward.supplies * factor),
    ammo: Math.round(reward.ammo * factor),
    credits: Math.round(reward.credits * (1 + Math.max(0, stars - 1) * 0.25)),
    xp: Math.round(reward.xp * factor),
  };
}

export type MissionId = "kills" | "levels" | "stars" | "noleak" | "boss" | "gates";

export interface Mission {
  id: MissionId;
  label: string;
  target: number;
  credits: number;
}

const MISSION_TEMPLATES: readonly { id: MissionId; label: string; low: number; high: number; credits: number }[] = [
  { id: "kills", label: "düşman düşür", low: 60, high: 200, credits: 12 },
  { id: "levels", label: "bölüm tamamla", low: 1, high: 4, credits: 15 },
  { id: "stars", label: "yıldız topla", low: 2, high: 6, credits: 18 },
  { id: "noleak", label: "sızmasız dalga bitir", low: 2, high: 8, credits: 20 },
  { id: "boss", label: "komutan devir", low: 1, high: 3, credits: 25 },
  { id: "gates", label: "iyi kapıdan geç", low: 4, high: 14, credits: 10 },
];

export function todayKey(now: Date): string {
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dailyMissions(dayKey: string): Mission[] {
  const cursor = { seed: hashSeed(`gunline-mission-${dayKey}`) };
  const pool = [...MISSION_TEMPLATES];
  const picked: Mission[] = [];

  while (picked.length < 3 && pool.length > 0) {
    const index = Math.floor(nextRandom(cursor) * pool.length) % pool.length;
    const template = pool[index];
    pool.splice(index, 1);
    const target = Math.round(
      template.low + nextRandom(cursor) * (template.high - template.low),
    );
    picked.push({
      id: template.id,
      label: `${target} ${template.label}`,
      target,
      credits: template.credits,
    });
  }

  return picked;
}

export interface Medal {
  id: string;
  label: string;
  detail: string;
  earned: (profile: GunlineProfile) => boolean;
}

export const MEDALS: readonly Medal[] = [
  {
    id: "first-blood",
    label: "İlk Temas",
    detail: "İlk bölümü tamamla.",
    earned: (profile) => profile.totals.levels >= 1,
  },
  {
    id: "ten-levels",
    label: "Manga Komutanı",
    detail: "On bölüm tamamla.",
    earned: (profile) => profile.totals.levels >= 10,
  },
  {
    id: "half-campaign",
    label: "Cephe Gazisi",
    detail: "Otuz bölüm tamamla.",
    earned: (profile) => profile.totals.levels >= 30,
  },
  {
    id: "full-campaign",
    label: "Cephe Hattı",
    detail: "Altmış bölümün tamamını bitir.",
    earned: (profile) => profile.totals.levels >= CAMPAIGN_LEVELS,
  },
  {
    id: "kills-1k",
    label: "Bin Vuruş",
    detail: "Toplam bin düşman düşür.",
    earned: (profile) => profile.totals.kills >= 1000,
  },
  {
    id: "kills-10k",
    label: "Ateş Hattı",
    detail: "Toplam on bin düşman düşür.",
    earned: (profile) => profile.totals.kills >= 10000,
  },
  {
    id: "boss-10",
    label: "Komutan Avcısı",
    detail: "On komutan devir.",
    earned: (profile) => profile.totals.bosses >= 10,
  },
  {
    id: "perfect-5",
    label: "Delinmez Hat",
    detail: "Beş bölümü sızmasız bitir.",
    earned: (profile) => profile.totals.perfect >= 5,
  },
  {
    id: "stars-60",
    label: "Yıldızlı Sicil",
    detail: "Altmış yıldız topla.",
    earned: (profile) => totalStars(profile) >= 60,
  },
  {
    id: "stars-150",
    label: "Üç Yıldız",
    detail: "Yüz elli yıldız topla.",
    earned: (profile) => totalStars(profile) >= 150,
  },
  {
    id: "rank-officer",
    label: "Subay",
    detail: "Teğmen rütbesine ulaş.",
    earned: (profile) => rankProgress(profile.xp).index >= 6,
  },
  {
    id: "rank-colonel",
    label: "Albay",
    detail: "En yüksek rütbeye ulaş.",
    earned: (profile) => rankProgress(profile.xp).index >= RANKS.length - 1,
  },
];

export function totalStars(profile: GunlineProfile): number {
  let total = 0;
  for (const value of Object.values(profile.stars)) {
    total += value;
  }
  return total;
}

export function earnedMedals(profile: GunlineProfile): Medal[] {
  return MEDALS.filter((medal) => medal.earned(profile));
}

export function missionDelta(summary: RunSummary, mission: Mission): number {
  switch (mission.id) {
    case "kills":
      return summary.kills;
    case "levels":
      return summary.won ? 1 : 0;
    case "stars":
      return summary.stars;
    case "noleak":
      return summary.leaks === 0 && summary.won ? 1 : 0;
    case "boss":
      return summary.bosses;
    default:
      return 0;
  }
}
