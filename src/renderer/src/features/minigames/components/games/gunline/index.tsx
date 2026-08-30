import { useCallback, useMemo, useState } from "react";
import { scoreKey } from "@/store/minigame-scores";
import { RULES_GUNLINE } from "../../../difficulty";
import {
  CAMPAIGN_LEVELS,
  MEDALS,
  baseBonus,
  bonusOf,
  levelById,
  levelUnlocked,
  rankProgress,
  recordRun,
  type GunlineLevel,
  type GunlineProfile,
  type LevelReward,
  type RunSummary,
} from "../../../gunline";
import { useRecordRun } from "../../../use-record-run";
import type { MinigameBoardProps } from "../../../board-props";
import { Barracks } from "./barracks";
import { Briefing } from "./briefing";
import { CampaignMap } from "./campaign-map";
import { GunlineBoard } from "./board";
import { LoadoutPanel } from "./loadout";
import { MissionsPanel } from "./missions";
import { GunlineResult } from "./result";
import { PhoneFrame, TabBar, TopBar, type TabId } from "./shell";
import { useGunlineProfile } from "./use-gunline-profile";

type Screen = "home" | "briefing" | "run";

interface Outcome {
  summary: RunSummary;
  reward: LevelReward;
  medals: string[];
}

function freshSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

export function Gunline({ difficulty }: MinigameBoardProps) {
  const rules = RULES_GUNLINE[difficulty];
  const { profile, dayKey, missions, update, reset } = useGunlineProfile();

  const [screen, setScreen] = useState<Screen>("home");
  const [tab, setTab] = useState<TabId>("map");
  const [levelId, setLevelId] = useState(1);
  const [endless, setEndless] = useState(false);
  const [seed, setSeed] = useState(freshSeed);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const level: GunlineLevel | null = endless ? null : levelById(levelId);
  const bonus = useMemo(() => (endless ? baseBonus() : bonusOf(profile)), [endless, profile]);
  const rank = rankProgress(profile.xp);

  const endlessScore = outcome && endless ? outcome.summary.score : 0;
  const isRecord = useRecordRun(
    scoreKey("gunline", difficulty),
    Boolean(outcome) && endless,
    endlessScore,
  );

  const finish = useCallback(
    (summary: RunSummary) => {
      if (endless) {
        setOutcome({ summary, reward: { supplies: 0, ammo: 0, credits: 0, xp: 0 }, medals: [] });
        return;
      }
      const result = recordRun(profile, summary, dayKey);
      update(result.profile);
      setOutcome({
        summary,
        reward: result.reward,
        medals: result.newMedals.map(
          (id) => MEDALS.find((medal) => medal.id === id)?.label ?? id,
        ),
      });
    },
    [endless, profile, dayKey, update],
  );

  const openLevel = useCallback((id: number) => {
    setEndless(false);
    setLevelId(id);
    setOutcome(null);
    setScreen("briefing");
  }, []);

  const launch = useCallback(() => {
    setOutcome(null);
    setSeed(freshSeed());
    setScreen("run");
  }, []);

  const startEndless = useCallback(() => {
    setEndless(true);
    setOutcome(null);
    setSeed(freshSeed());
    setScreen("run");
  }, []);

  const backHome = useCallback(() => {
    setEndless(false);
    setOutcome(null);
    setScreen("home");
    setTab("map");
  }, []);

  const changeProfile = useCallback(
    (next: GunlineProfile) => {
      update(next);
    },
    [update],
  );

  const nextLevel = useMemo(() => {
    if (endless || !outcome?.summary.won) {
      return null;
    }
    const candidate = outcome.summary.levelId + 1;
    if (candidate > CAMPAIGN_LEVELS) {
      return null;
    }
    return levelUnlocked(profile, candidate) ? candidate : null;
  }, [endless, outcome, profile]);

  if (screen === "run") {
    return (
      <PhoneFrame>
        <GunlineBoard
          key={`${endless ? "endless" : levelId}:${seed}`}
          mode={endless ? "endless" : "campaign"}
          level={level}
          rules={rules}
          loadout={endless ? { weapon: "pistol", attachments: [], abilities: [] } : profile.loadout}
          bonus={bonus}
          seed={seed}
          onFinish={finish}
          onExit={backHome}
          overlay={
            outcome ? (
              <GunlineResult
                summary={outcome.summary}
                reward={outcome.reward}
                medals={outcome.medals}
                isRecord={isRecord}
                onRetry={launch}
                onNext={
                  nextLevel
                    ? () => {
                        setLevelId(nextLevel);
                        setOutcome(null);
                        setSeed(freshSeed());
                      }
                    : null
                }
                onExit={backHome}
              />
            ) : undefined
          }
        />
      </PhoneFrame>
    );
  }

  if (screen === "briefing" && level) {
    return (
      <PhoneFrame>
        <TopBar
          rank={rank.label}
          level={rank.index}
          ratio={rank.ratio}
          supplies={profile.supplies}
          ammo={profile.ammo}
          credits={profile.credits}
          onBack={backHome}
        />
        <Briefing
          level={level}
          profile={profile}
          onStart={launch}
          onLoadout={() => {
            setScreen("home");
            setTab("loadout");
          }}
        />
      </PhoneFrame>
    );
  }

  return (
    <PhoneFrame>
      <TopBar
        rank={rank.label}
        level={rank.index}
        ratio={rank.ratio}
        supplies={profile.supplies}
        ammo={profile.ammo}
        credits={profile.credits}
      />
      {tab === "map" ? (
        <CampaignMap profile={profile} onPick={openLevel} onEndless={startEndless} />
      ) : null}
      {tab === "loadout" ? <LoadoutPanel profile={profile} onChange={changeProfile} /> : null}
      {tab === "barracks" ? (
        <Barracks profile={profile} onChange={changeProfile} onReset={reset} />
      ) : null}
      {tab === "missions" ? (
        <MissionsPanel profile={profile} missions={missions} onChange={changeProfile} />
      ) : null}
      <TabBar active={tab} onSelect={setTab} />
    </PhoneFrame>
  );
}
