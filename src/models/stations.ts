import type { Station, StationStats, BrandAvg, SortCol } from "./types";

export function getGasTypes(stations: Station[]): string[] {
  return [...new Set(stations.map((s) => s.type))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "fr"));
}

export function getRegions(stations: Station[]): string[] {
  return [...new Set(stations.map((s) => s.region))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "fr"));
}

export function filterByGas(
  stations: Station[],
  gasType: string
): Station[] {
  return gasType === "__all__"
    ? stations
    : stations.filter((s) => s.type === gasType);
}

export function filterByRegion(
  stations: Station[],
  region: string
): Station[] {
  return region === "__all__"
    ? stations
    : stations.filter((s) => s.region === region);
}

export function computeStats(stations: Station[]): StationStats | null {
  if (!stations.length) return null;
  const sorted = [...stations].sort((a, b) => a.price - b.price);
  const prices = sorted.map((s) => s.price);
  const min = prices[0];
  const max = prices[prices.length - 1];
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const median =
    prices.length % 2 === 0
      ? (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2
      : prices[Math.floor(prices.length / 2)];
  const spread = max - min;
  const regionCount = new Set(stations.map((s) => s.region)).size;

  return {
    min,
    max,
    avg,
    median,
    spread,
    regionCount,
    total: stations.length,
    cheapest: sorted[0],
    mostExpensive: sorted[sorted.length - 1],
  };
}

export function computeBrandAverages(stations: Station[]): BrandAvg[] {
  const brandMap: Record<string, { prices: number[]; count: number }> = {};
  stations.forEach((s) => {
    const b = s.brand || "Unknown";
    if (!brandMap[b]) brandMap[b] = { prices: [], count: 0 };
    brandMap[b].prices.push(s.price);
    brandMap[b].count++;
  });
  return Object.entries(brandMap)
    .map(([name, d]) => ({
      name,
      avg: d.prices.reduce((a, b) => a + b, 0) / d.prices.length,
      count: d.count,
    }))
    .sort((a, b) => a.avg - b.avg);
}

export function computeDistribution(
  prices: number[],
  min: number,
  max: number,
  bucketCount = 15
): { buckets: number[]; bucketSize: number } {
  const bucketSize = (max - min) / bucketCount || 1;
  const buckets = Array(bucketCount).fill(0) as number[];
  prices.forEach((p) => {
    let idx = Math.floor((p - min) / bucketSize);
    if (idx >= bucketCount) idx = bucketCount - 1;
    buckets[idx]++;
  });
  return { buckets, bucketSize };
}

export function priceClass(
  p: number,
  min: number,
  max: number
): string {
  const t = (p - min) / (max - min || 1);
  return t < 0.33 ? "price-cheap" : t < 0.66 ? "price-mid" : "price-high";
}

export function sortStations(
  stations: Station[],
  col: SortCol,
  asc: boolean
): Station[] {
  return [...stations].sort((a, b) => {
    const va = a[col];
    const vb = b[col];
    const cmp =
      typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb));
    return asc ? cmp : -cmp;
  });
}

export function defaultGasType(gasTypes: string[]): string {
  return (
    gasTypes.find(
      (g) => g.normalize("NFC") === "R\u00e9gulier".normalize("NFC")
    ) ||
    gasTypes[0] ||
    "__all__"
  );
}
