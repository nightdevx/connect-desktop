import type { GunlineUpgrade } from "../../../gunline";

const RARITY_LABEL: Record<GunlineUpgrade["rarity"], string> = {
  common: "SIRADAN",
  rare: "NADİR",
  epic: "DESTANSI",
};

interface UpgradeOfferProps {
  wave: number;
  offer: readonly GunlineUpgrade[];
  onPick: (id: string) => void;
}

export function UpgradeOffer({ wave, offer, onPick }: UpgradeOfferProps) {
  return (
    <div className="ct-gl-offer" role="dialog" aria-label="Yükseltme seç">
      <span className="ct-gl-offer-title">{wave}. DALGA TEMİZ</span>
      <span className="ct-gl-offer-note">Bir yükseltme seç</span>
      <div className="ct-gl-offer-cards">
        {offer.map((upgrade, index) => (
          <button
            key={upgrade.id}
            type="button"
            className="ct-gl-offer-card"
            data-rarity={upgrade.rarity}
            onClick={() => onPick(upgrade.id)}
          >
            <span className="ct-gl-offer-rarity">{RARITY_LABEL[upgrade.rarity]}</span>
            <span className="ct-gl-offer-name">{upgrade.label}</span>
            <span className="ct-gl-offer-detail">{upgrade.detail}</span>
            <span className="ct-gl-offer-key">{index + 1}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
