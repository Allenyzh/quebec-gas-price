export interface RoutePoint {
  lat: number;
  lng: number;
}

export type RouteCoordinates = [number, number][];

interface RouteResponse {
  code?: string;
  routes?: Array<{ geometry?: { coordinates?: [number, number][] } }>;
}

export function createMapRouteLoader() {
  const cache = new Map<string, RouteCoordinates>();
  let generation = 0;
  let activeRequest: AbortController | null = null;

  function cancel() {
    generation++;
    activeRequest?.abort();
    activeRequest = null;
  }

  async function load(from: RoutePoint, to: RoutePoint): Promise<RouteCoordinates | null> {
    cancel();
    const requestGeneration = generation;
    const controller = new AbortController();
    activeRequest = controller;
    const key = [from.lat, from.lng, to.lat, to.lng]
      .map((n) => n.toFixed(4))
      .join(",");

    try {
      let coords = cache.get(key);
      if (!coords) {
        const response = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`,
          { signal: controller.signal },
        );
        if (!response.ok) return null;
        const data: RouteResponse = await response.json();
        const points = data.routes?.[0]?.geometry?.coordinates;
        if (data.code !== "Ok" || !points || points.length < 2) return null;
        if (points.some((point) => point.length < 2 || !point.every(Number.isFinite))) return null;
        coords = points.map(([lng, lat]) => [lat, lng]);
        if (generation !== requestGeneration || controller.signal.aborted) return null;
        cache.set(key, coords);
      }

      // Also yield for cached routes so closing a popup in this turn invalidates them.
      await Promise.resolve();
      return generation === requestGeneration && !controller.signal.aborted ? coords : null;
    } catch {
      return null;
    } finally {
      if (generation === requestGeneration) activeRequest = null;
    }
  }

  return { load, cancel };
}
