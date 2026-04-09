import type { BrandAvg } from "../models/types";
import { barColorFn } from "../models/geo";

interface BrandChartProps {
  brandAverages: BrandAvg[];
  min: number;
  max: number;
  t: (key: string) => string;
}

export function BrandChart({ brandAverages, min, max, t }: BrandChartProps) {
  const topN = Math.min(12, brandAverages.length);
  const top = brandAverages.slice(0, topN);
  const brandMin = brandAverages[0]?.avg ?? 0;
  const brandMax = brandAverages[brandAverages.length - 1]?.avg ?? 0;

  return (
    <div>
      <h2 className="section-title">
        {t("brandAvg")} ({t("top")} {topN})
      </h2>
      <div className="bar-chart">
        {top.map((b) => {
          const pct = ((b.avg - min) / (max - min || 1)) * 75 + 25;
          return (
            <div key={b.name} className="bar-row">
              <div className="bar-label" title={b.name}>
                {b.name}
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{
                    width: `${pct}%`,
                    background: barColorFn(b.avg, brandMin, brandMax),
                  }}
                >
                  {b.count}
                </div>
              </div>
              <div className="bar-value">{b.avg.toFixed(1)}&cent;</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
