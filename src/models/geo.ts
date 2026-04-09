export function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type MapProvider = "apple" | "google" | "waze";

export function navUrl(
  lat: number,
  lng: number,
  label?: string,
  provider: MapProvider = "apple"
): string {
  const q = encodeURIComponent(label || `${lat},${lng}`);
  switch (provider) {
    case "google":
      return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=&query=${q}`;
    case "waze":
      return `https://www.waze.com/ul?ll=${lat},${lng}&navigate=yes`;
    case "apple":
    default:
      return `https://maps.apple.com/?daddr=${lat},${lng}&q=${q}`;
  }
}

export function formatDist(d: number): string {
  return d < 1 ? `${Math.round(d * 1000)}m` : `${d.toFixed(1)}km`;
}

export function priceToColor(p: number, mn: number, mx: number): string {
  const t = Math.min(Math.max((p - mn) / (mx - mn || 1), 0), 1);
  let r: number, g: number, b: number;
  if (t < 0.5) {
    const u = t * 2;
    r = Math.round(55 + u * 145);
    g = Math.round(140 - u * 30);
    b = Math.round(80 - u * 40);
  } else {
    const u = (t - 0.5) * 2;
    r = Math.round(200 + u * 30);
    g = Math.round(110 - u * 60);
    b = Math.round(40 + u * 30);
  }
  return `rgb(${r},${g},${b})`;
}

export function barColorFn(val: number, mnV: number, mxV: number): string {
  const t = (val - mnV) / (mxV - mnV || 1);
  const r = Math.round(55 + t * 175);
  const g = Math.round(140 - t * 90);
  const b = Math.round(80 - t * 10);
  return `rgb(${r},${g},${b})`;
}
