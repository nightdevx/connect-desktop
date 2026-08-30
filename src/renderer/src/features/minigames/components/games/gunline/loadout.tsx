import { useState } from "react";
import {
  ABILITIES,
  ABILITY_ORDER,
  ATTACHMENTS,
  WEAPONS,
  WEAPON_ORDER,
  abilitySlots,
  purchaseAttachment,
  purchaseWeapon,
  setLoadout,
  type AbilityId,
  type GunlineProfile,
} from "../../../gunline";
import { IconAmmo, IconLock } from "./icons";
import { Segmented } from "./shell";

type Slice = "weapon" | "attachment" | "ability";

const SLICES: readonly { id: Slice; label: string }[] = [
  { id: "weapon", label: "Silah" },
  { id: "attachment", label: "Ataşman" },
  { id: "ability", label: "Destek" },
];

interface LoadoutPanelProps {
  profile: GunlineProfile;
  onChange: (profile: GunlineProfile) => void;
}

export function LoadoutPanel({ profile, onChange }: LoadoutPanelProps) {
  const [slice, setSlice] = useState<Slice>("weapon");
  const slots = abilitySlots(profile);

  const pickWeapon = (id: (typeof WEAPON_ORDER)[number]): void => {
    if (!profile.weapons.includes(id)) {
      onChange(purchaseWeapon(profile, id));
      return;
    }
    onChange(setLoadout(profile, { ...profile.loadout, weapon: id }));
  };

  const toggleAttachment = (id: string): void => {
    if (!profile.attachments.includes(id)) {
      onChange(purchaseAttachment(profile, id));
      return;
    }
    const attachment = ATTACHMENTS.find((item) => item.id === id);
    const owned = profile.loadout.attachments;
    const next = owned.includes(id)
      ? owned.filter((item) => item !== id)
      : [
          ...owned.filter(
            (item) => ATTACHMENTS.find((entry) => entry.id === item)?.slot !== attachment?.slot,
          ),
          id,
        ];
    onChange(setLoadout(profile, { ...profile.loadout, attachments: next }));
  };

  const toggleAbility = (id: AbilityId): void => {
    const current = profile.loadout.abilities;
    const next = current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id].slice(-slots);
    onChange(setLoadout(profile, { ...profile.loadout, abilities: next }));
  };

  return (
    <div className="ct-gl-body">
      <Segmented value={slice} options={SLICES} onSelect={setSlice} />

      {slice === "weapon" ? (
        <div className="ct-gl-tiles">
          {WEAPON_ORDER.map((id) => {
            const weapon = WEAPONS[id];
            const owned = profile.weapons.includes(id);
            const active = profile.loadout.weapon === id;
            const state = active ? "active" : owned ? "owned" : profile.ammo >= weapon.cost ? "buy" : "locked";
            return (
              <button
                key={id}
                type="button"
                className="ct-gl-tile"
                data-state={state}
                onClick={() => pickWeapon(id)}
                disabled={!owned && profile.ammo < weapon.cost}
              >
                <span className="ct-gl-tile-head">
                  <span className="ct-gl-tile-name">{weapon.label}</span>
                  {owned ? null : (
                    <span className="ct-gl-price">
                      <IconAmmo className="ct-gl-price-icon" />
                      {weapon.cost}
                    </span>
                  )}
                </span>
                <span className="ct-gl-tile-note">{weapon.detail}</span>
                <span className="ct-gl-tile-stats">
                  <span className="ct-gl-kv">
                    <span className="ct-gl-kv-key">Hasar</span>
                    <span className="ct-gl-kv-value">{weapon.damage}</span>
                  </span>
                  <span className="ct-gl-kv">
                    <span className="ct-gl-kv-key">Atış</span>
                    <span className="ct-gl-kv-value">{weapon.interval.toFixed(2)}s</span>
                  </span>
                  <span className="ct-gl-kv">
                    <span className="ct-gl-kv-key">Delme</span>
                    <span className="ct-gl-kv-value">{weapon.pierce}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {slice === "attachment" ? (
        <div className="ct-gl-tiles">
          {ATTACHMENTS.map((attachment) => {
            const owned = profile.attachments.includes(attachment.id);
            const active = profile.loadout.attachments.includes(attachment.id);
            const state = active ? "active" : owned ? "owned" : profile.ammo >= attachment.cost ? "buy" : "locked";
            return (
              <button
                key={attachment.id}
                type="button"
                className="ct-gl-tile"
                data-state={state}
                onClick={() => toggleAttachment(attachment.id)}
                disabled={!owned && profile.ammo < attachment.cost}
              >
                <span className="ct-gl-tile-head">
                  <span className="ct-gl-tile-name">{attachment.label}</span>
                  {owned ? (
                    <span className="ct-gl-slotmark">{attachment.slot}</span>
                  ) : (
                    <span className="ct-gl-price">
                      <IconAmmo className="ct-gl-price-icon" />
                      {attachment.cost}
                    </span>
                  )}
                </span>
                <span className="ct-gl-tile-note">{attachment.detail}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {slice === "ability" ? (
        <>
          <p className="ct-gl-hint">
            {profile.loadout.abilities.length}/{slots} yuva dolu
            {slots < 4 ? " — kışlada yuva açılır" : ""}
          </p>
          <div className="ct-gl-tiles">
            {ABILITY_ORDER.map((id) => {
              const spec = ABILITIES[id];
              const active = profile.loadout.abilities.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  className="ct-gl-tile"
                  data-state={active ? "active" : "owned"}
                  onClick={() => toggleAbility(id)}
                >
                  <span className="ct-gl-tile-head">
                    <span className="ct-gl-tile-name">{spec.label}</span>
                    <span className="ct-gl-slotmark">{spec.cooldown}s</span>
                  </span>
                  <span className="ct-gl-tile-note">{spec.detail}</span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {slice !== "ability" && profile.ammo === 0 ? (
        <p className="ct-gl-hint">
          <IconLock className="ct-gl-hint-icon" />
          Mühimmat bölüm bitirerek kazanılır.
        </p>
      ) : null}
    </div>
  );
}
