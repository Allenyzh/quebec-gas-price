import type { Lang } from "../models/types";
import { RefreshIcon } from "./icons";

interface HeaderProps {
  t: (key: string) => string;
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  gasTypes: string[];
  gasType: string;
  gasTypeCounts: Record<string, number>;
  onGasTypeChange: (type: string) => void;
  regions: string[];
  region: string;
  regionStationCounts: Record<string, number>;
  gasStationTotal: number;
  onRegionChange: (region: string) => void;
  radiusKm: number;
  onRadiusChange: (km: number) => void;
  onRefresh: () => void;
  refreshing: boolean;
  subtitle: string;
}

const LANGS: Lang[] = ["en", "fr", "zh"];
const LANG_LABELS: Record<Lang, string> = { en: "EN", fr: "FR", zh: "中" };
const RADII = [5, 10, 15, 25, 50];

export function Header({
  t,
  lang,
  onLangChange,
  gasTypes,
  gasType,
  gasTypeCounts,
  onGasTypeChange,
  regions,
  region,
  regionStationCounts,
  gasStationTotal,
  onRegionChange,
  radiusKm,
  onRadiusChange,
  onRefresh,
  refreshing,
  subtitle,
}: HeaderProps) {
  return (
    <header className="header">
      <div className="header-left">
        <h1 className="font-display text-[clamp(1.5rem,1.2rem+1.5vw,2.5rem)] font-black tracking-tight leading-[1.15] text-(--text-primary)">
          {t("title")}
        </h1>
        <p
          className="text-(--text-tertiary) mt-1.5 text-[0.8rem] font-medium"
          dangerouslySetInnerHTML={{ __html: subtitle }}
        />
      </div>
      <div className="header-controls">
        <div className="lang-switcher" role="group" aria-label="Language">
          {LANGS.map((l) => (
            <button
              key={l}
              className={`lang-btn${l === lang ? " active" : ""}`}
              onClick={() => onLangChange(l)}
            >
              {LANG_LABELS[l]}
            </button>
          ))}
        </div>
        <button
          className={`refresh-btn${refreshing ? " spinning" : ""}`}
          aria-label={t("refresh")}
          title={t("refresh")}
          disabled={refreshing}
          onClick={onRefresh}
        >
          <RefreshIcon />
        </button>
        <select
          className="region-select"
          aria-label={t("selectFuel")}
          value={gasType}
          onChange={(e) => onGasTypeChange(e.target.value)}
        >
          <option value="__all__">{t("allFuels")}</option>
          {gasTypes.map((g) => (
            <option key={g} value={g}>
              {g} ({gasTypeCounts[g] || 0})
            </option>
          ))}
        </select>
        <select
          className="region-select"
          aria-label={t("selectRegion")}
          value={region}
          onChange={(e) => onRegionChange(e.target.value)}
        >
          <option value="__all__">
            {t("allRegions")} ({gasStationTotal})
          </option>
          {regions.map((r) => {
            const count = regionStationCounts[r] || 0;
            if (count === 0) return null;
            return (
              <option key={r} value={r}>
                {r} ({count})
              </option>
            );
          })}
        </select>
        <select
          className="region-select"
          aria-label={t("nearbyRadius")}
          value={radiusKm}
          onChange={(e) => onRadiusChange(Number(e.target.value))}
        >
          {RADII.map((r) => (
            <option key={r} value={r}>
              {r} km
            </option>
          ))}
        </select>
      </div>
    </header>
  );
}
