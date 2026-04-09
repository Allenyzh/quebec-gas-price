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

export async function fetchStations(): Promise<Station[]> {
  const resp = await fetch("https://regieessencequebec.ca/stations.geojson.gz");
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
  distances: number[][];
}

export async function fetchOsrmDistances(
  originLng: number,
  originLat: number,
  destinations: Array<{ lng: number; lat: number }>
): Promise<number[] | null> {
  const coords =
    `${originLng},${originLat};` +
    destinations.map((d) => `${d.lng},${d.lat}`).join(";");
  try {
    const resp = await fetch(
      `https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&annotations=distance`
    );
    const data: OsrmTableResponse = await resp.json();
    if (data.code !== "Ok") return null;
    return data.distances[0].slice(1).map((d) => d / 1000);
  } catch {
    return null;
  }
}
