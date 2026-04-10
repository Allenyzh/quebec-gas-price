import { useState, useEffect, useCallback, useRef } from "react";
import type { Station, StationWithDist } from "../models/types";
import { haversine } from "../models/geo";
import { fetchOsrmDistances } from "../models/api";

export type NearbyState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "none"; radiusKm: number }
  | {
      status: "ok";
      top5: StationWithDist[];
      straightLine: boolean;
      radiusKm: number;
    };

export function useNearby(
  gasStations: Station[],
  radiusKm: number,
  onRegionDetected?: (region: string) => void
) {
  const [state, setState] = useState<NearbyState>({ status: "idle" });
  const [geoPos, setGeoPos] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const geoPosRef = useRef(geoPos);
  geoPosRef.current = geoPos;

  const computeNearby = useCallback(
    async (lat: number, lng: number) => {
      setState({ status: "loading" });

      const withDist = gasStations
        .filter((s) => s.lat && s.lng)
        .map((s) => ({
          ...s,
          dist: haversine(lat, lng, s.lat, s.lng),
        }));

      // Auto-detect nearest region
      const nearest = [...withDist].sort((a, b) => a.dist - b.dist)[0];
      if (nearest?.region && onRegionDetected) {
        onRegionDetected(nearest.region);
      }

      const inRadius = withDist.filter((s) => s.dist <= radiusKm);
      if (!inRadius.length) {
        setState({ status: "none", radiusKm });
        return;
      }

      const candidates = inRadius
        .sort((a, b) => a.price - b.price)
        .slice(0, 50);

      const osrmDists = await fetchOsrmDistances(
        lng,
        lat,
        candidates.map((s) => ({ lng: s.lng, lat: s.lat }))
      );

      if (osrmDists) {
        const top5 = candidates
          .map((s, i) => ({ ...s, dist: osrmDists[i] }))
          .filter((s) => s.dist <= radiusKm)
          .sort((a, b) => a.price - b.price || a.dist - b.dist)
          .slice(0, 5);
        if (!top5.length) {
          setState({ status: "none", radiusKm });
          return;
        }
        setState({ status: "ok", top5, straightLine: false, radiusKm });
      } else {
        const top5 = candidates.slice(0, 5);
        setState({ status: "ok", top5, straightLine: true, radiusKm });
      }
    },
    [gasStations, radiusKm, onRegionDetected]
  );

  // Request geolocation on mount
  useEffect(() => {
    if (!navigator.geolocation) {
      setState({
        status: "error",
        message: "nearbyError",
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoPos({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {
        setState({
          status: "error",
          message: "nearbyError",
        });
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  }, []);

  // Recompute when geoPos, gasStations, or radius changes
  useEffect(() => {
    if (geoPos && gasStations.length > 0) {
      computeNearby(geoPos.lat, geoPos.lng);
    }
  }, [geoPos, computeNearby]);

  return { state, geoPos, setGeoPos };
}
