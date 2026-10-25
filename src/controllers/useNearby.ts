import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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

interface GeoPosition {
  lat: number;
  lng: number;
}

interface LocationSession {
  enabled: boolean;
}

type LocationResult =
  | { session: LocationSession; status: "ok"; position: GeoPosition }
  | { session: LocationSession; status: "error" };

interface NearbyResult {
  session: LocationSession;
  stations: Station[];
  radiusKm: number;
  position: GeoPosition;
  state: NearbyState;
}

export function useNearby(
  gasStations: Station[],
  radiusKm: number,
  onRegionDetected?: (region: string) => void,
  locationEnabled = true,
) {
  // A new permission session never reuses a position from before it was disabled.
  const session = useMemo(() => ({ enabled: locationEnabled }), [locationEnabled]);
  const activeSessionRef = useRef<LocationSession | null>(null);
  const locationAttemptRef = useRef<object | null>(null);
  const hasDetectedRegionRef = useRef(false);
  const [locationResult, setLocationResult] = useState<LocationResult | null>(null);
  const [nearbyResult, setNearbyResult] = useState<NearbyResult | null>(null);
  const locationSupported = typeof navigator !== "undefined" && !!navigator.geolocation;

  const currentLocation = locationEnabled && locationResult?.session === session
    ? locationResult
    : null;
  const geoPos = currentLocation?.status === "ok" ? currentLocation.position : null;

  const setGeoPos = useCallback((position: GeoPosition) => {
    if (!locationEnabled || activeSessionRef.current !== session) return;
    // Also invalidate a pending browser request when the position is set explicitly.
    locationAttemptRef.current = null;
    setLocationResult({ session, status: "ok", position });
  }, [locationEnabled, session]);

  const requestLocation = useCallback(() => {
    if (!locationEnabled || !locationSupported || activeSessionRef.current !== session) return;
    const attempt = {};
    locationAttemptRef.current = attempt;
    const isCurrent = () => activeSessionRef.current === session && locationAttemptRef.current === attempt;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!isCurrent()) return;
        setLocationResult({
          session,
          status: "ok",
          position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        });
      },
      () => {
        if (isCurrent()) setLocationResult({ session, status: "error" });
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }, [locationEnabled, locationSupported, session]);

  useEffect(() => {
    if (!locationEnabled) return;
    activeSessionRef.current = session;
    requestLocation();
    return () => {
      activeSessionRef.current = null;
      locationAttemptRef.current = null;
    };
  }, [locationEnabled, session, requestLocation]);

  useEffect(() => {
    if (!locationEnabled || !geoPos || !gasStations.length) return;
    const position = geoPos;
    const controller = new AbortController();
    const { signal } = controller;
    const publish = (state: NearbyState) => {
      if (!signal.aborted) {
        setNearbyResult({ session, stations: gasStations, radiusKm, position, state });
      }
    };

    async function computeNearby() {
      const withDist = gasStations
        .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng) && s.lat !== 0 && s.lng !== 0)
        .map((s) => ({ ...s, dist: haversine(position.lat, position.lng, s.lat, s.lng) }));

      // Initialize the region once; later filter and radius changes preserve user choices.
      const nearest = [...withDist].sort((a, b) => a.dist - b.dist)[0];
      if (!hasDetectedRegionRef.current && nearest?.region && onRegionDetected) {
        hasDetectedRegionRef.current = true;
        onRegionDetected(nearest.region);
      }

      const candidates = withDist
        .filter((s) => s.dist <= radiusKm)
        .sort((a, b) => a.price - b.price || a.dist - b.dist)
        .slice(0, 50);
      if (!candidates.length) {
        publish({ status: "none", radiusKm });
        return;
      }

      try {
        const osrmDists = await fetchOsrmDistances(
          position.lng,
          position.lat,
          candidates.map((s) => ({ lng: s.lng, lat: s.lat })),
          signal,
        );
        if (signal.aborted) return;
        if (osrmDists) {
          const top5: StationWithDist[] = candidates
            .flatMap((s, i) => {
              const dist = osrmDists[i];
              return typeof dist === "number" && Number.isFinite(dist) && dist >= 0 && dist <= radiusKm
                ? [{ ...s, dist }]
                : [];
            })
            .sort((a, b) => a.price - b.price || a.dist - b.dist)
            .slice(0, 5);
          publish(top5.length
            ? { status: "ok", top5, straightLine: false, radiusKm }
            : { status: "none", radiusKm });
        } else {
          publish({ status: "ok", top5: candidates.slice(0, 5), straightLine: true, radiusKm });
        }
      } catch {
        // Cancellation belongs to the previous inputs and must not publish a fallback.
        if (!signal.aborted) {
          publish({ status: "ok", top5: candidates.slice(0, 5), straightLine: true, radiusKm });
        }
      }
    }

    void computeNearby();
    return () => controller.abort();
  }, [locationEnabled, session, geoPos, gasStations, radiusKm, onRegionDetected]);

  // Match the inputs during render, so stale prices disappear before effect cleanup runs.
  let state: NearbyState;
  if (!locationEnabled || !gasStations.length) {
    state = { status: "idle" };
  } else if (!locationSupported || currentLocation?.status === "error") {
    state = { status: "error", message: "nearbyError" };
  } else if (nearbyResult?.session === session && nearbyResult.stations === gasStations
    && nearbyResult.radiusKm === radiusKm && nearbyResult.position === geoPos) {
    state = nearbyResult.state;
  } else {
    state = { status: "loading" };
  }

  return { state, geoPos, setGeoPos, requestLocation };
}
