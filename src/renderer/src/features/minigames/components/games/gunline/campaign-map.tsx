import {
  CHAPTER_SPECS,
  levelUnlocked,
  levelsOfChapter,
  objectiveLabel,
  rankProgress,
  totalStars,
  type GunlineProfile,
} from "../../../gunline";
import { IconInfinity, IconLock, IconSkull } from "./icons";
import { GameButton, Meter, Stars } from "./shell";

interface CampaignMapProps {
  profile: GunlineProfile;
  onPick: (levelId: number) => void;
  onEndless: () => void;
}

const LANES = [1, 0, 2, 1, 2, 0, 1, 2, 0, 1];

export function CampaignMap({ profile, onPick, onEndless }: CampaignMapProps) {
  const rank = rankProgress(profile.xp);
  const stars = totalStars(profile);

  return (
    <div className="ct-gl-body">
      <div className="ct-gl-rankcard">
        <div className="ct-gl-rankcard-head">
          <span className="ct-gl-rankcard-name">{rank.label}</span>
          <span className="ct-gl-rankcard-stars">
            <Stars filled={3} size="sm" />
            <span className="ct-gl-rankcard-count">{stars}</span>
          </span>
        </div>
        <Meter ratio={rank.ratio} tone="gold" />
      </div>

      <GameButton tone="gold" wide onClick={onEndless}>
        <IconInfinity className="ct-gl-btn-icon" />
        Sonsuz mod
      </GameButton>

      {CHAPTER_SPECS.map((chapter) => {
        const levels = levelsOfChapter(chapter.id);
        const open = levels.some((level) => levelUnlocked(profile, level.id));
        const earned = levels.reduce(
          (total, level) => total + (profile.stars[`${level.id}`] ?? 0),
          0,
        );

        return (
          <section key={chapter.id} className="ct-gl-chapter" data-open={open ? "yes" : "no"}>
            <header className="ct-gl-ribbon" data-terrain={chapter.terrain}>
              <span className="ct-gl-ribbon-name">{chapter.name}</span>
              <span className="ct-gl-ribbon-count">{earned}/{levels.length * 3}</span>
            </header>
            <p className="ct-gl-chapter-note">{chapter.detail}</p>

            <ol className="ct-gl-path">
              {levels.map((level, index) => {
                const starCount = profile.stars[`${level.id}`] ?? 0;
                const unlocked = levelUnlocked(profile, level.id);
                const boss = level.id % 5 === 0;

                return (
                  <li
                    key={level.id}
                    className="ct-gl-path-row"
                    data-lane={LANES[index % LANES.length]}
                  >
                    <button
                      type="button"
                      className="ct-gl-node"
                      data-state={unlocked ? (starCount > 0 ? "done" : "open") : "locked"}
                      data-boss={boss ? "yes" : "no"}
                      disabled={!unlocked}
                      onClick={() => onPick(level.id)}
                      title={objectiveLabel(level.objective)}
                    >
                      <span className="ct-gl-node-disc">
                        {unlocked ? (
                          boss ? (
                            <IconSkull className="ct-gl-node-glyph" />
                          ) : (
                            <span className="ct-gl-node-id">{level.id}</span>
                          )
                        ) : (
                          <IconLock className="ct-gl-node-glyph" />
                        )}
                      </span>
                      <span className="ct-gl-node-name">{level.name}</span>
                      <Stars filled={starCount} />
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
