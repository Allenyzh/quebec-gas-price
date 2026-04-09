import type { StationStats } from "../models/types";

interface MetricsStripProps {
  stats: StationStats;
  t: (key: string) => string;
}

export function MetricsStrip({ stats, t }: MetricsStripProps) {
  const regionWord =
    stats.regionCount > 1 ? t("regions") : t("region");

  return (
    <div className="metrics anim-in">
      <div className="metric metric--low">
        <div className="metric-label">{t("lowest")}</div>
        <div className="metric-value">{stats.min.toFixed(1)}&cent;</div>
        <div
          className="metric-sub"
          title={`${stats.cheapest.brand} \u2014 ${stats.cheapest.address}`}
        >
          {stats.cheapest.brand}
        </div>
      </div>
      <div className="metric metric--high">
        <div className="metric-label">{t("highest")}</div>
        <div className="metric-value">{stats.max.toFixed(1)}&cent;</div>
        <div
          className="metric-sub"
          title={`${stats.mostExpensive.brand} \u2014 ${stats.mostExpensive.address}`}
        >
          {stats.mostExpensive.brand}
        </div>
      </div>
      <div className="metric">
        <div className="metric-label">{t("average")}</div>
        <div className="metric-value">{stats.avg.toFixed(1)}&cent;</div>
        <div className="metric-sub">
          {t("median")} {stats.median.toFixed(1)}&cent;
        </div>
      </div>
      <div className="metric">
        <div className="metric-label">{t("spread")}</div>
        <div className="metric-value">{stats.spread.toFixed(1)}&cent;</div>
        <div className="metric-sub">{t("spreadSub")}</div>
      </div>
      <div className="metric">
        <div className="metric-label">{t("stations")}</div>
        <div className="metric-value">{stats.total}</div>
        <div className="metric-sub">
          {stats.regionCount} {regionWord}
        </div>
      </div>
    </div>
  );
}
