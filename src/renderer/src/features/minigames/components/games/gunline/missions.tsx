import { claimMission, totalStars, type GunlineProfile, type Mission } from "../../../gunline";
import { IconCredits } from "./icons";
import { Meter, Section } from "./shell";

interface MissionsPanelProps {
  profile: GunlineProfile;
  missions: Mission[];
  onChange: (profile: GunlineProfile) => void;
}

export function MissionsPanel({ profile, missions, onChange }: MissionsPanelProps) {
  return (
    <div className="ct-gl-body">
      <Section title="Günlük görevler">
        <div className="ct-gl-tiles">
          {missions.map((mission) => {
            const progress = Math.min(mission.target, profile.missionProgress[mission.id] ?? 0);
            const claimed = profile.missionClaimed.includes(mission.id);
            const done = progress >= mission.target;

            return (
              <button
                key={mission.id}
                type="button"
                className="ct-gl-tile"
                data-state={claimed ? "locked" : done ? "active" : "owned"}
                disabled={!done || claimed}
                onClick={() => onChange(claimMission(profile, mission))}
              >
                <span className="ct-gl-tile-head">
                  <span className="ct-gl-tile-name">{mission.label}</span>
                  <span className="ct-gl-price" data-tone="gold">
                    <IconCredits className="ct-gl-price-icon" />
                    {claimed ? "alındı" : mission.credits}
                  </span>
                </span>
                <Meter ratio={progress / mission.target} tone={done ? "green" : "blue"} />
                <span className="ct-gl-tile-note">
                  {progress}/{mission.target}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Sicil">
        <div className="ct-gl-stat-row">
          <span className="ct-gl-stat">
            <span className="ct-gl-stat-label">Görev</span>
            <span className="ct-gl-stat-value">{profile.totals.runs}</span>
          </span>
          <span className="ct-gl-stat">
            <span className="ct-gl-stat-label">Vuruş</span>
            <span className="ct-gl-stat-value">{profile.totals.kills}</span>
          </span>
          <span className="ct-gl-stat">
            <span className="ct-gl-stat-label">Komutan</span>
            <span className="ct-gl-stat-value">{profile.totals.bosses}</span>
          </span>
        </div>
        <div className="ct-gl-stat-row">
          <span className="ct-gl-stat">
            <span className="ct-gl-stat-label">Bölüm</span>
            <span className="ct-gl-stat-value">{profile.totals.levels}</span>
          </span>
          <span className="ct-gl-stat">
            <span className="ct-gl-stat-label">Yıldız</span>
            <span className="ct-gl-stat-value">{totalStars(profile)}</span>
          </span>
          <span className="ct-gl-stat">
            <span className="ct-gl-stat-label">Sızmasız</span>
            <span className="ct-gl-stat-value">{profile.totals.perfect}</span>
          </span>
        </div>
      </Section>
    </div>
  );
}
