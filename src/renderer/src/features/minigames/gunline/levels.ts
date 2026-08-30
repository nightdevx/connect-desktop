import type { RulesGunline } from "../difficulty";
import { ENEMY_SPECS, kindsForWave } from "./enemies";
import { levelReward } from "./economy";
import { hashSeed, nextRandom, pickRandom } from "./rng";
import {
  BOSS_WAVE,
  CAMPAIGN_LEVELS,
  CHAPTER_SIZE,
  SPAWN_INTERVAL_FLOOR,
  WAVE_BASE_HEALTH,
  WAVE_HEALTH_GROWTH,
} from "./tuning";
import type {
  EnemyKind,
  GunlineLevel,
  ModifierId,
  Objective,
  ObjectiveId,
  TerrainId,
  WaveScript,
} from "./types";

export function waveHealth(wave: number, rules: RulesGunline): number {
  return WAVE_BASE_HEALTH * Math.pow(WAVE_HEALTH_GROWTH, wave - 1) * rules.enemyHealth;
}

export function waveSizeOf(wave: number): number {
  return Math.round(4 + wave * 2);
}

export function spawnIntervalOf(wave: number, rules: RulesGunline): number {
  return Math.max(SPAWN_INTERVAL_FLOOR, 1.1 - wave * 0.038) / rules.spawnRate;
}

export function spawnSpreadOf(wave: number): number {
  return Math.min(5.2, 2 + wave * 0.45);
}

export function isBossWave(wave: number): boolean {
  return wave % BOSS_WAVE === 0;
}

export interface ChapterSpec {
  id: number;
  name: string;
  terrain: TerrainId;
  detail: string;
  modifiers: readonly ModifierId[];
  names: readonly string[];
}

export const CHAPTER_SPECS: readonly ChapterSpec[] = [
  {
    id: 1,
    name: "Eğitim Sahası",
    terrain: "range",
    detail: "Talim alanı. Hattı tutmayı burada öğrenirsin.",
    modifiers: [],
    names: [
      "İlk Nöbet",
      "Atış Talimi",
      "Kapı Tatbikatı",
      "Zırhlı Hedef",
      "Manga Komutanı",
      "Gece Devriyesi",
      "Sızma Denemesi",
      "Havadan Tehdit",
      "Çift Şerit",
      "Talim Sonu",
    ],
  },
  {
    id: 2,
    name: "Çöl Hattı",
    terrain: "desert",
    detail: "Kum, sıcak ve açık arazi. Görüş aldatır.",
    modifiers: ["sandstorm"],
    names: [
      "Kum Duvarı",
      "Kuru Vadi",
      "Kervan Yolu",
      "Susuz Mevzi",
      "Çöl Komutanı",
      "Zırhlı Konvoy",
      "Serap Hattı",
      "Kum Fırtınası",
      "Tel Örgü",
      "Vaha Savunması",
    ],
  },
  {
    id: 3,
    name: "Şehir Harabesi",
    terrain: "urban",
    detail: "Dar sokak, yıkık duvar, her köşede kalkan.",
    modifiers: ["surge"],
    names: [
      "Ana Cadde",
      "Yıkık Köprü",
      "Meydan",
      "Kalkanlı Hat",
      "Şehir Komutanı",
      "Kapalı Çarşı",
      "Metro Girişi",
      "Çatı Nişancıları",
      "Enkaz Barikatı",
      "Son Sokak",
    ],
  },
  {
    id: 4,
    name: "Orman Sınırı",
    terrain: "forest",
    detail: "Sis, pusu ve alçaktan gelen droneler.",
    modifiers: ["fog"],
    names: [
      "Sınır Karakolu",
      "Sisli Patika",
      "Dere Geçidi",
      "Pusu Hattı",
      "Orman Komutanı",
      "Drone Sürüsü",
      "Kesik Ağaçlar",
      "Gece Ormanı",
      "Tahliye Noktası",
      "Sınır Taşı",
    ],
  },
  {
    id: 5,
    name: "Kar Cephesi",
    terrain: "snow",
    detail: "Havan sesi, buz ve karanlık.",
    modifiers: ["night", "rain"],
    names: [
      "Buz Geçidi",
      "Kar Siperi",
      "Havan Ateşi",
      "Donmuş Göl",
      "Kar Komutanı",
      "Tipi",
      "Terk Edilmiş Üs",
      "Uzun Gece",
      "Son Konvoy",
      "Zirve Mevzisi",
    ],
  },
  {
    id: 6,
    name: "Sanayi Bölgesi",
    terrain: "industrial",
    detail: "Parazit, kıt mühimmat, çok fazlı komutanlar.",
    modifiers: ["scarce", "surge"],
    names: [
      "Ambar Kapısı",
      "Boru Hattı",
      "Parazit Kulesi",
      "Döküm Salonu",
      "Fabrika Komutanı",
      "Vardiya Değişimi",
      "Yüksek Fırın",
      "Kablo Ağı",
      "Son Vardiya",
      "Cephe Hattı",
    ],
  },
];

const OBJECTIVE_LABELS: Record<ObjectiveId, string> = {
  hold: "Hattı tut",
  noleak: "Sızdırma",
  timed: "Zamana karşı",
  convoy: "Konvoyu koru",
  zone: "Bölgeyi tut",
  extract: "Tahliyeyi bekle",
};

export function objectiveLabel(objective: Objective): string {
  switch (objective.kind) {
    case "hold":
      return `${objective.value} dalgayı temizle`;
    case "noleak":
      return `En fazla ${objective.value} sızma`;
    case "timed":
      return `${objective.value} saniyede bitir`;
    case "convoy":
      return "Konvoy geçene kadar koru";
    case "zone":
      return `${objective.value} saniye bölgede kal`;
    case "extract":
      return `${objective.value} saniye daya`;
    default:
      return OBJECTIVE_LABELS[objective.kind];
  }
}

export const MODIFIER_LABELS: Record<ModifierId, string> = {
  night: "Gece görüşü",
  sandstorm: "Kum fırtınası",
  scarce: "Mühimmat kıtlığı",
  fog: "Yoğun sis",
  rain: "Yağmur",
  surge: "Düşman takviyesi",
};

export const MODIFIER_DETAILS: Record<ModifierId, string> = {
  night: "Görüş daralır, saçılma artar.",
  sandstorm: "Rüzgâr mermiyi savurur.",
  scarce: "Atış yavaş ama hasar yüksek.",
  fog: "Uzak hedefler geç görünür.",
  rain: "Kapı şarjı yavaşlar.",
  surge: "Dalgalar daha kalabalık ve sık.",
};

function objectiveFor(levelId: number, cursor: { seed: number }, waves: number): Objective {
  if (levelId % CHAPTER_SIZE === 5) {
    return { kind: "timed", value: 90 + Math.floor(levelId / 4) * 5 };
  }
  if (levelId % CHAPTER_SIZE === 0) {
    return { kind: "extract", value: 60 + Math.floor(levelId / 5) * 5 };
  }
  if (levelId >= 7 && levelId % 7 === 0) {
    return { kind: "noleak", value: Math.max(0, 3 - Math.floor(levelId / 20)) };
  }
  if (levelId >= 13 && levelId % 9 === 4) {
    return { kind: "convoy", value: 100 };
  }
  if (levelId >= 16 && levelId % 11 === 5) {
    return { kind: "zone", value: 35 + Math.floor(levelId / 6) * 3 };
  }
  nextRandom(cursor);
  return { kind: "hold", value: waves };
}

function modifiersFor(levelId: number, chapter: ChapterSpec, cursor: { seed: number }): ModifierId[] {
  if (chapter.modifiers.length === 0) {
    return [];
  }
  const step = levelId % CHAPTER_SIZE;
  if (step === 0 || step === 5) {
    return [...chapter.modifiers];
  }
  if (step % 2 === 1) {
    return [pickRandom(cursor, chapter.modifiers)];
  }
  return [];
}

function wavesFor(levelId: number, cursor: { seed: number }): WaveScript[] {
  const count = Math.min(8, 3 + Math.floor(levelId / 6));
  const pool = kindsForWave(levelId);
  const scripts: WaveScript[] = [];

  for (let index = 0; index < count; index += 1) {
    const picks: EnemyKind[] = [];
    const width = Math.min(pool.length, 2 + Math.floor(index / 2));
    for (let slot = 0; slot < width; slot += 1) {
      const kind = pickRandom(cursor, pool);
      if (!picks.includes(kind)) {
        picks.push(kind);
      }
    }
    if (picks.length === 0) {
      picks.push("militia");
    }

    scripts.push({
      kinds: picks,
      count: Math.round(waveSizeOf(index + 1) * (1 + levelId * 0.035)),
      interval: Math.max(SPAWN_INTERVAL_FLOOR, 1.05 - levelId * 0.008 - index * 0.03),
      healthScale: 1 + index * 0.12,
      boss: index === count - 1 && levelId % BOSS_WAVE === 0 ? "commander" : null,
    });
  }

  return scripts;
}

export function levelScoreCeiling(level: GunlineLevel): number {
  let total = 0;
  for (const wave of level.waves) {
    const best = Math.max(...wave.kinds.map((kind) => ENEMY_SPECS[kind].score));
    total += wave.count * (best + level.id * 2);
    if (wave.boss) {
      total += ENEMY_SPECS[wave.boss].score + level.id * 2;
    }
  }
  return total + 100 * level.waves.length * level.id;
}

function buildLevel(levelId: number): GunlineLevel {
  const cursor = { seed: hashSeed(`gunline-level-${levelId}`) };
  const chapterIndex = Math.floor((levelId - 1) / CHAPTER_SIZE);
  const chapter = CHAPTER_SPECS[Math.min(chapterIndex, CHAPTER_SPECS.length - 1)];
  const waves = wavesFor(levelId, cursor);
  const objective = objectiveFor(levelId, cursor, waves.length);

  const level: GunlineLevel = {
    id: levelId,
    chapter: chapter.id,
    name: chapter.names[(levelId - 1) % CHAPTER_SIZE] ?? `Bölüm ${levelId}`,
    terrain: chapter.terrain,
    objective,
    corridor: {
      rows: Math.min(10, 4 + Math.floor(levelId / 8)),
      spacing: 5.4,
    },
    waves,
    modifiers: modifiersFor(levelId, chapter, cursor),
    stars: { two: 0, three: 0 },
    reward: levelReward(levelId),
  };

  const ceiling = levelScoreCeiling(level);
  level.stars = {
    two: Math.round(ceiling * 0.32),
    three: Math.round(ceiling * 0.58),
  };

  return level;
}

const LEVELS: readonly GunlineLevel[] = Array.from({ length: CAMPAIGN_LEVELS }, (_, index) =>
  buildLevel(index + 1),
);

export function allLevels(): readonly GunlineLevel[] {
  return LEVELS;
}

export function levelById(id: number): GunlineLevel | null {
  return LEVELS[id - 1] ?? null;
}

export function levelsOfChapter(chapter: number): readonly GunlineLevel[] {
  return LEVELS.filter((level) => level.chapter === chapter);
}

export function chapterSpec(chapter: number): ChapterSpec {
  return CHAPTER_SPECS[chapter - 1] ?? CHAPTER_SPECS[0];
}

export function enemyRoster(level: GunlineLevel): EnemyKind[] {
  const seen = new Set<EnemyKind>();
  for (const wave of level.waves) {
    for (const kind of wave.kinds) {
      seen.add(kind);
    }
    if (wave.boss) {
      seen.add(wave.boss);
    }
  }
  return [...seen];
}
