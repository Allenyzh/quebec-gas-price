interface DistributionChartProps {
  buckets: number[];
  bucketSize: number;
  min: number;
  t: (key: string) => string;
}

export function DistributionChart({
  buckets,
  bucketSize,
  min,
  t,
}: DistributionChartProps) {
  const maxBucket = Math.max(...buckets);
  const bucketCount = buckets.length;

  return (
    <div>
      <h2 className="section-title">{t("priceDist")}</h2>
      <div className="dist-chart">
        {buckets.map((c, i) => {
          const h = maxBucket ? (c / maxBucket) * 100 : 0;
          const lo = (min + i * bucketSize).toFixed(1);
          const hi = (min + (i + 1) * bucketSize).toFixed(1);
          return (
            <div
              key={i}
              className="dist-bar"
              style={{ height: `${Math.max(h, 2)}%` }}
            >
              <span className="tooltip">
                {lo}&ndash;{hi}&cent;: {c}
              </span>
            </div>
          );
        })}
      </div>
      <div className="dist-labels">
        {buckets.map((_, i) => (
          <span key={i}>
            {i % 3 === 0 || i === bucketCount - 1
              ? (min + i * bucketSize).toFixed(1)
              : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
