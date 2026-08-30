import { SQUAD_CLASSES, SQUAD_CLASS_ORDER, type AbilityId, type GunlineLevel } from "../../../gunline";
import { IconAmmo, IconClose, IconSkull, IconSupplies } from "./icons";
import type { GunlineHud } from "./hud-model";

interface RunHudProps {
  hud: GunlineHud;
  level: GunlineLevel | null;
  banner: string;
  onAbility: (id: AbilityId) => void;
  onExit: () => void;
}

export function RunHud({ hud, level, banner, onAbility, onExit }: RunHudProps) {
  const composition = SQUAD_CLASS_ORDER.filter((cls) => hud.roster[cls] > 0);

  return (
    <div className="ct-gl-hud">
      <div className="ct-gl-hud-top">
        <span className="ct-gl-troops" data-low={hud.units <= 3 ? "yes" : "no"}>
          <span className="ct-gl-troops-value">{hud.units}</span>
          <span className="ct-gl-troops-label">er</span>
        </span>

        <div className="ct-gl-wallet" data-compact="yes">
          <span className="ct-gl-coin" data-kind="supplies">
            <span className="ct-gl-coin-badge">
              <IconSupplies className="ct-gl-icon" />
            </span>
            <span className="ct-gl-coin-value">{hud.supplies}</span>
          </span>
          <span className="ct-gl-coin" data-kind="ammo">
            <span className="ct-gl-coin-badge">
              <IconAmmo className="ct-gl-icon" />
            </span>
            <span className="ct-gl-coin-value">{hud.kills}</span>
          </span>
          <span className="ct-gl-coin" data-kind="leaks">
            <span className="ct-gl-coin-badge">
              <IconSkull className="ct-gl-icon" />
            </span>
            <span className="ct-gl-coin-value">{hud.leaks}</span>
          </span>
        </div>

        <button type="button" className="ct-gl-exit" onClick={onExit} aria-label="Çık">
          <IconClose className="ct-gl-icon" />
        </button>
      </div>

      <div className="ct-gl-goal">
        <span className="ct-gl-goal-label">
          {level ? hud.objective.label : `${hud.wave}. dalga`}
        </span>
        {level ? (
          <span className="ct-gl-goal-track">
            <span
              className="ct-gl-goal-fill"
              style={{ width: `${Math.max(0, Math.min(100, hud.objective.ratio * 100))}%` }}
            />
          </span>
        ) : null}
      </div>

      <span className="ct-gl-banner" data-phase={hud.phase} key={banner}>
        {banner}
      </span>

      {hud.remaining > 0 ? (
        <span className="ct-gl-counter">
          <span className="ct-gl-counter-value">{hud.remaining}</span>
          <span className="ct-gl-counter-label">kalan</span>
        </span>
      ) : null}

      {hud.armor > 0 || composition.length > 1 ? (
        <div className="ct-gl-squadbar">
          {composition.map((cls) => (
            <span key={cls} className="ct-gl-chip" title={SQUAD_CLASSES[cls].detail}>
              {SQUAD_CLASSES[cls].label} {hud.roster[cls]}
            </span>
          ))}
          {hud.armor > 0 ? (
            <span className="ct-gl-chip" data-kind="armor">
              Zırh {hud.armor}
            </span>
          ) : null}
        </div>
      ) : null}

      {hud.abilities.length > 0 ? (
        <div className="ct-gl-abilities">
          {hud.abilities.map((ability, index) => (
            <button
              key={ability.id}
              type="button"
              className="ct-gl-ability"
              data-ready={ability.ready >= 1 ? "yes" : "no"}
              onClick={() => onAbility(ability.id)}
              disabled={ability.ready < 1}
            >
              <span
                className="ct-gl-ability-sweep"
                style={{ height: `${Math.round(ability.ready * 100)}%` }}
              />
              <span className="ct-gl-ability-name">{ability.label}</span>
              <span className="ct-gl-ability-key">{index + 1}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
