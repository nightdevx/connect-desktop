import { useState } from "react";
import {
  MEDALS,
  META_BRANCHES,
  canAfford,
  nodeUnlocked,
  nodesOfBranch,
  purchaseNode,
  rankProgress,
  type GunlineProfile,
  type MetaBranch,
} from "../../../gunline";
import { IconLock } from "./icons";
import { GameButton, Meter, Section, Segmented } from "./shell";

interface BarracksProps {
  profile: GunlineProfile;
  onChange: (profile: GunlineProfile) => void;
  onReset: () => void;
}

const BRANCHES: readonly { id: MetaBranch; label: string }[] = [
  { id: "firepower", label: "Ateş" },
  { id: "manpower", label: "İnsan" },
  { id: "gear", label: "Teçhizat" },
  { id: "logistics", label: "Lojistik" },
];

export function Barracks({ profile, onChange, onReset }: BarracksProps) {
  const [branch, setBranch] = useState<MetaBranch>("firepower");
  const rank = rankProgress(profile.xp);

  return (
    <div className="ct-gl-body">
      <div className="ct-gl-rankcard">
        <div className="ct-gl-rankcard-head">
          <span className="ct-gl-rankcard-name">{rank.label}</span>
          <span className="ct-gl-rankcard-count">{profile.xp} XP</span>
        </div>
        <Meter ratio={rank.ratio} tone="gold" />
      </div>

      <Segmented value={branch} options={BRANCHES} onSelect={setBranch} />
      <p className="ct-gl-hint">{META_BRANCHES[branch].detail}</p>

      <div className="ct-gl-tiles">
        {nodesOfBranch(branch).map((node) => {
          const level = profile.upgrades[node.id] ?? 0;
          const maxed = level >= node.max;
          const price = node.cost(level);
          const unlocked = nodeUnlocked(profile, node);
          const affordable = canAfford(profile, price);

          return (
            <button
              key={node.id}
              type="button"
              className="ct-gl-tile"
              data-state={maxed ? "active" : unlocked && affordable ? "owned" : "locked"}
              disabled={maxed || !unlocked || !affordable}
              onClick={() => onChange(purchaseNode(profile, node.id))}
            >
              <span className="ct-gl-tile-head">
                <span className="ct-gl-tile-name">{node.label}</span>
                <span className="ct-gl-pips">
                  {Array.from({ length: node.max }, (_, slot) => (
                    <span
                      key={slot}
                      className="ct-gl-pip"
                      data-filled={slot < level ? "yes" : "no"}
                    />
                  ))}
                </span>
              </span>
              <span className="ct-gl-tile-note">{node.detail}</span>
              <span className="ct-gl-tile-stats">
                {maxed ? (
                  <span className="ct-gl-kv" data-done="yes">
                    <span className="ct-gl-kv-value">Tamam</span>
                  </span>
                ) : !unlocked ? (
                  <span className="ct-gl-kv">
                    <IconLock className="ct-gl-kv-icon" />
                    <span className="ct-gl-kv-value">Önce üsttekini al</span>
                  </span>
                ) : (
                  <>
                    <span className="ct-gl-kv">
                      <span className="ct-gl-kv-key">Erzak</span>
                      <span className="ct-gl-kv-value">{price.supplies}</span>
                    </span>
                    <span className="ct-gl-kv">
                      <span className="ct-gl-kv-key">Mühimmat</span>
                      <span className="ct-gl-kv-value">{price.ammo}</span>
                    </span>
                    {price.credits > 0 ? (
                      <span className="ct-gl-kv">
                        <span className="ct-gl-kv-key">Künye</span>
                        <span className="ct-gl-kv-value">{price.credits}</span>
                      </span>
                    ) : null}
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <Section title="Madalyalar">
        <div className="ct-gl-tags">
          {MEDALS.map((medal) => (
            <span
              key={medal.id}
              className="ct-gl-tag"
              data-earned={profile.medals.includes(medal.id) ? "yes" : "no"}
              title={medal.detail}
            >
              {medal.label}
            </span>
          ))}
        </div>
      </Section>

      <GameButton tone="danger" onClick={onReset}>
        Sicili sıfırla
      </GameButton>
    </div>
  );
}
