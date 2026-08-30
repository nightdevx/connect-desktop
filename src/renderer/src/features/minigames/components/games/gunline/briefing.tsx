import {
  ABILITIES,
  ENEMY_SPECS,
  WEAPONS,
  MODIFIER_DETAILS,
  MODIFIER_LABELS,
  chapterSpec,
  enemyRoster,
  objectiveDetail,
  objectiveLabel,
  type GunlineLevel,
  type GunlineProfile,
} from "../../../gunline";
import { IconFlag, IconWeapon } from "./icons";
import { GameButton, Section, Stars } from "./shell";

interface BriefingProps {
  level: GunlineLevel;
  profile: GunlineProfile;
  onStart: () => void;
  onLoadout: () => void;
}

export function Briefing({ level, profile, onStart, onLoadout }: BriefingProps) {
  const chapter = chapterSpec(level.chapter);
  const best = profile.best[`${level.id}`] ?? 0;
  const stars = profile.stars[`${level.id}`] ?? 0;

  return (
    <>
      <div className="ct-gl-body">
        <div className="ct-gl-hero" data-terrain={level.terrain}>
          <span className="ct-gl-hero-badge">{level.id}</span>
          <span className="ct-gl-hero-chapter">{chapter.name}</span>
          <span className="ct-gl-hero-name">{level.name}</span>
          <Stars filled={stars} size="lg" />
        </div>

        <div className="ct-gl-objective">
          <IconFlag className="ct-gl-objective-icon" />
          <span className="ct-gl-objective-text">
            <span className="ct-gl-objective-main">{objectiveLabel(level.objective)}</span>
            <span className="ct-gl-objective-note">{objectiveDetail(level.objective)}</span>
          </span>
        </div>

        <div className="ct-gl-stat-row">
          <span className="ct-gl-stat">
            <span className="ct-gl-stat-label">Dalga</span>
            <span className="ct-gl-stat-value">{level.waves.length}</span>
          </span>
          <span className="ct-gl-stat">
            <span className="ct-gl-stat-label">Kapı</span>
            <span className="ct-gl-stat-value">{level.corridor.rows}</span>
          </span>
          <span className="ct-gl-stat">
            <span className="ct-gl-stat-label">Rekor</span>
            <span className="ct-gl-stat-value">{best || "—"}</span>
          </span>
        </div>

        <Section title="Yıldız eşiği">
          <div className="ct-gl-thresholds">
            <span className="ct-gl-threshold">
              <Stars filled={2} />
              <span className="ct-gl-threshold-value">{level.stars.two}</span>
            </span>
            <span className="ct-gl-threshold">
              <Stars filled={3} />
              <span className="ct-gl-threshold-value">{level.stars.three}</span>
            </span>
          </div>
        </Section>

        <Section title="Karşındakiler">
          <div className="ct-gl-tags">
            {enemyRoster(level).map((kind) => (
              <span
                key={kind}
                className="ct-gl-tag"
                data-boss={ENEMY_SPECS[kind].boss ? "yes" : "no"}
              >
                {ENEMY_SPECS[kind].label}
              </span>
            ))}
          </div>
        </Section>

        {level.modifiers.length > 0 ? (
          <Section title="Saha koşulları">
            <div className="ct-gl-tags">
              {level.modifiers.map((modifier) => (
                <span
                  key={modifier}
                  className="ct-gl-tag"
                  data-warn="yes"
                  title={MODIFIER_DETAILS[modifier]}
                >
                  {MODIFIER_LABELS[modifier]}
                </span>
              ))}
            </div>
          </Section>
        ) : null}

        <Section title="Teçhizatın">
          <div className="ct-gl-tags">
            <span className="ct-gl-tag" data-warn="yes">
              {WEAPONS[profile.loadout.weapon].label}
            </span>
            {profile.loadout.abilities.map((id) => (
              <span key={id} className="ct-gl-tag">
                {ABILITIES[id].label}
              </span>
            ))}
          </div>
        </Section>

        <Section title="Ödül">
          <div className="ct-gl-rewards">
            <span className="ct-gl-reward">Erzak {level.reward.supplies}</span>
            <span className="ct-gl-reward">Mühimmat {level.reward.ammo}</span>
            <span className="ct-gl-reward">Künye {level.reward.credits}</span>
            <span className="ct-gl-reward">XP {level.reward.xp}</span>
          </div>
        </Section>
      </div>

      <div className="ct-gl-dock">
        <GameButton tone="ghost" onClick={onLoadout}>
          <IconWeapon className="ct-gl-btn-icon" />
        </GameButton>
        <GameButton tone="primary" wide onClick={onStart}>
          Görevi başlat
        </GameButton>
      </div>
    </>
  );
}
