import type { Station } from "./types";

interface GeoJsonFeature {
  properties: {
    brand?: string;
    Name?: string;
    Address?: string;
    Region?: string;
    Prices?: Array<{ GasType?: string; Price?: string | number }>;
  };
  geometry?: {
    coordinates?: [number, number];
  };
}

interface GeoJsonResponse {
  features: GeoJsonFeature[];
}

export async function fetchStations(signal?: AbortSignal): Promise<Station[]> {
  const resp = await fetch("https://regieessencequebec.ca/stations.geojson.gz", { signal });
  if (!resp.ok) throw new Error(`Station data request failed (${resp.status})`);
  const data: GeoJsonResponse = await resp.json();

  return data.features
    .flatMap((f) =>
      (f.properties.Prices ?? []).map((p) => ({
        brand:
          f.properties.brand && f.properties.brand !== "Aucun"
            ? f.properties.brand
            : f.properties.Name ?? "",
        address: f.properties.Address ?? "",
        region: (f.properties.Region ?? "").normalize("NFC").trim(),
        type: (p.GasType ?? "").normalize("NFC").trim(),
        price: Number(String(p.Price ?? "").replace(/[^0-9.]/g, "")),
        lat: f.geometry?.coordinates?.[1] ?? 0,
        lng: f.geometry?.coordinates?.[0] ?? 0,
      }))
    )
    .filter((x) => x.type && Number.isFinite(x.price) && x.price > 0);
}

interface OsrmTableResponse {
  code: string;
  distances: Array<Array<number | null>>;
}

export async function fetchOsrmDistances(
  originLng: number,
  originLat: number,
  destinations: Array<{ lng: number; lat: number }>,
  signal?: AbortSignal,
): Promise<Array<number | null> | null> {
  if (!destinations.length) return [];
  const coords =
    `${originLng},${originLat};` +
    destinations.map((d) => `${d.lng},${d.lat}`).join(";");
  try {
    const resp = await fetch(
      `https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&annotations=distance`,
      { signal },
    );
    if (!resp.ok) return null;
    const data: OsrmTableResponse = await resp.json();
    if (data.code !== "Ok" || !Array.isArray(data.distances?.[0])) return null;
    const distances = data.distances[0].slice(1);
    if (distances.length !== destinations.length) return null;
    return distances.map((d) =>
      typeof d === "number" && Number.isFinite(d) && d >= 0 ? d / 1000 : null,
    );
  } catch (err) {
    if (signal?.aborted) throw err;
    return null;
  }
}
