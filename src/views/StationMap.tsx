import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import type { Station, StationStats } from "../models/types";
import type { NavTarget } from "../controllers/useNavModal";
import { priceToColor } from "../models/geo";
import { createMapRouteLoader } from "../models/mapRoutes";

interface StationMapProps {
  stations: Station[];
  stats: StationStats;
  t: (key: string) => string;
  onNavigate: (target: NavTarget) => void;
  geoPos: { lat: number; lng: number } | null;
  onLocateRequest?: () => void;
  routingEnabled?: boolean;
  comparePrices?: boolean;
  locating?: boolean;
}

const CLUSTER_THRESHOLD = 300;
const CARTO_API_KEY = import.meta.env.VITE_CARTO_API_KEY?.trim();

function createMarkerIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" fill="${color}" stroke="white" stroke-width="1.5" opacity="0.92"/></svg>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -8],
  });
}

const navSvg =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;flex-shrink:0"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>';

const userPosIcon = L.divIcon({
  className: "",
  html: `<div class="user-pos-wrapper"><div class="user-pos-ring"></div><div class="user-pos-dot"></div></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]!);
}

function clearRoute(map: L.Map, ref: React.MutableRefObject<L.Polyline | null>) {
  if (ref.current) {
    map.removeLayer(ref.current);
    ref.current = null;
  }
}

export function StationMap({
  stations,
  stats,
  t,
  onNavigate,
  geoPos,
  onLocateRequest,
  routingEnabled = true,
  comparePrices = true,
  locating = false,
}: StationMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.LayerGroup | L.MarkerClusterGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const routeRef = useRef<L.Polyline | null>(null);
  const geoPosRef = useRef(geoPos);
  const onNavigateRef = useRef(onNavigate);
  const locateRequestedRef = useRef(false);
  const [routeLoader] = useState(createMapRouteLoader);
  const [basemapFailed, setBasemapFailed] = useState(false);

  useEffect(() => {
    geoPosRef.current = routingEnabled ? geoPos : null;
    routeLoader.cancel();
    if (mapRef.current) clearRoute(mapRef.current, routeRef);
  }, [geoPos, routingEnabled, routeLoader]);

  // Keep ref in sync with prop
  useEffect(() => {
    onNavigateRef.current = onNavigate;
  }, [onNavigate]);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true, maxZoom: 19 }).setView(
      [46.8, -71.2],
      7,
    );
    if (CARTO_API_KEY) {
      let tileLoadFailed = false;
      L.tileLayer(
        `https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(CARTO_API_KEY)}`,
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attribution/">CARTO</a>',
          maxZoom: 19,
        },
      )
        .on("loading", () => {
          tileLoadFailed = false;
        })
        .on("tileerror", () => {
          tileLoadFailed = true;
          setBasemapFailed(true);
        })
        .on("load", () => setBasemapFailed(tileLoadFailed))
        .addTo(map);
    }

    // Event delegation for nav buttons inside popups
    map.getContainer().addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest(
        "[data-nav-lat]",
      ) as HTMLElement | null;
      if (!btn) return;
      e.preventDefault();
      onNavigateRef.current({
        lat: Number(btn.dataset.navLat),
        lng: Number(btn.dataset.navLng),
        label: btn.dataset.navLabel || "",
        brand: btn.dataset.navBrand || "",
        price: Number(btn.dataset.navPrice),
        fuelType: btn.dataset.navType || "",
      });
    });

    mapRef.current = map;

    // Route: draw on popup open, clear on popup close
    map.on("popupopen", (e: L.PopupEvent) => {
      routeLoader.cancel();
      clearRoute(map, routeRef);
      const latlng = e.popup.getLatLng();
      const geo = geoPosRef.current;
      if (!latlng || !geo) return;
      routeLoader.load(geo, latlng).then((coords) => {
        if (!coords || mapRef.current !== map || !e.popup.isOpen()) return;
        clearRoute(map, routeRef);
        routeRef.current = L.polyline(coords, {
          color: "#4285f4",
          weight: 5,
          opacity: 0.75,
          lineCap: "round",
        }).addTo(map);
        // Animate: progressively draw the line over 5s
        const pathEl = routeRef.current.getElement() as SVGPathElement | null;
        if (pathEl) {
          const len = pathEl.getTotalLength();
          pathEl.style.strokeDasharray = `${len}`;
          pathEl.style.strokeDashoffset = `${len}`;
          pathEl.style.transition = "none";
          // Force reflow then start transition
          pathEl.getBoundingClientRect();
          pathEl.style.transition = "stroke-dashoffset 5s cubic-bezier(.25,.1,.25,1)";
          pathEl.style.strokeDashoffset = "0";
        }
      });
    });
    map.on("popupclose", () => {
      routeLoader.cancel();
      clearRoute(map, routeRef);
    });

    return () => {
      routeLoader.cancel();
      clearRoute(map, routeRef);
      map.remove();
      mapRef.current = null;
    };
  }, [routeLoader]);

  // Update markers when stations change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (markersRef.current) {
      routeLoader.cancel();
      clearRoute(map, routeRef);
      map.removeLayer(markersRef.current);
      markersRef.current = null;
    }

    const mapStations = stations.filter((s) => s.lat && s.lng);
    if (!mapStations.length) return;

    const { min, max, avg, total } = stats;
    const sortedByPrice = [...stations].sort((a, b) => a.price - b.price);
    const rankMap = new Map(sortedByPrice.map((station, index) => [station, index + 1]));
    const groups: Station[][] = [];
    if (comparePrices) {
      mapStations.forEach((station) => groups.push([station]));
    } else {
      // One popup exposes every fuel at a coordinate, rather than hiding pins
      // beneath the last fuel marker added for the same station.
      const byCoordinates = new Map<string, Station[]>();
      mapStations.forEach((station) => {
        const key = `${station.lat},${station.lng}`;
        const group = byCoordinates.get(key);
        if (group) group.push(station);
        else byCoordinates.set(key, [station]);
      });
      groups.push(...byCoordinates.values());
    }

    function makeMarker(group: Station[]) {
      const s = group[0];
      const color = comparePrices ? priceToColor(s.price, min, max) : "#64748b";
      const marker = L.marker([s.lat, s.lng], {
        icon: createMarkerIcon(color),
        title: `${s.brand} ${s.address}`,
      });
      (marker as unknown as Record<string, number>)._stationPrice = s.price;
      const fuelEntries = group.map((station, index) => {
        const rankIdx = rankMap.get(station) || 1;
        const diff = station.price - avg;
        const diffStr = diff >= 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
        const label = escapeHtml(`${station.brand} ${station.address}`);
        return `<section style="${index ? "border-top:1px solid #ddd;padding-top:10px;margin-top:10px" : ""}">
          <div class="map-popup-brand">${escapeHtml(station.brand)}</div>
          <div style="font-size:0.75rem;font-weight:600">${escapeHtml(station.type)}</div>
          <div class="map-popup-price" style="color:${color}">${station.price.toFixed(1)}\u00a2/L</div>
          <div class="map-popup-addr">${escapeHtml(station.address)}</div>
          <div style="font-size:0.7rem;color:#888;margin-top:2px">${escapeHtml(station.region)}</div>
          ${comparePrices ? `<div class="map-popup-rank" style="color:${color}">#${rankIdx}/${total} (${diffStr}\u00a2)</div>` : ""}
          <div class="map-popup-nav"><button class="nav-link" data-nav-lat="${station.lat}" data-nav-lng="${station.lng}" data-nav-label="${label}" data-nav-brand="${escapeHtml(station.brand)}" data-nav-price="${station.price}" data-nav-type="${escapeHtml(station.type)}">${navSvg} ${escapeHtml(t("navigate"))}</button></div>
        </section>`;
      }).join("");
      marker.bindPopup(
        `<div style="min-width:170px;font-family:Plus Jakarta Sans,system-ui,sans-serif">${fuelEntries}</div>`,
        { closeButton: false, maxHeight: 320 },
      );
      return marker;
    }

    const useCluster = groups.length > CLUSTER_THRESHOLD;

    if (useCluster) {
      const cluster = L.markerClusterGroup({
        maxClusterRadius: 55,
        disableClusteringAtZoom: 13,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        chunkedLoading: true,
        iconCreateFunction: (clusterObj) => {
          const children = clusterObj.getAllChildMarkers();
          const count = children.length;
          const sorted = comparePrices ? children
            .map((m) => (m as unknown as Record<string, number>)._stationPrice)
            .sort((a, b) => a - b) : [];
          const medP =
            !comparePrices ? 0 : count % 2 === 0
              ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2
              : sorted[Math.floor(count / 2)];
          const bg = comparePrices ? priceToColor(medP, min, max) : "#64748b";
          const size = count < 20 ? 40 : count < 100 ? 48 : 56;
          return L.divIcon({
            html: `<div class="marker-cluster-custom" style="width:${size}px;height:${size}px;background:${bg}">
              <span class="cluster-count">${count}</span>
              ${comparePrices ? `<span class="cluster-price">${escapeHtml(t("clusterMed"))} ${medP.toFixed(1)}\u00a2</span>` : ""}
            </div>`,
            className: "",
            iconSize: L.point(size, size),
          });
        },
      });
      groups.forEach((group) => cluster.addLayer(makeMarker(group)));
      map.addLayer(cluster);
      markersRef.current = cluster;
    } else {
      const group = L.layerGroup();
      groups.forEach((stationsAtPin) => makeMarker(stationsAtPin).addTo(group));
      group.addTo(map);
      markersRef.current = group;
    }

    map.invalidateSize();
    map.fitBounds(
      L.latLngBounds(
        mapStations.map((s) => [s.lat, s.lng] as [number, number]),
      ),
      { padding: [30, 30] },
    );
  }, [stations, stats, t, comparePrices, routeLoader]);

  // Show user position dot on map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (userMarkerRef.current) {
      map.removeLayer(userMarkerRef.current);
      userMarkerRef.current = null;
    }
    if (routingEnabled && geoPos) {
      userMarkerRef.current = L.marker([geoPos.lat, geoPos.lng], {
        icon: userPosIcon,
        zIndexOffset: 9999,
        interactive: false,
      }).addTo(map);
      if (locateRequestedRef.current) {
        map.setView([geoPos.lat, geoPos.lng], 13, { animate: true });
        locateRequestedRef.current = false;
      }
    }
  }, [geoPos, routingEnabled]);

  const handleLocate = useCallback(() => {
    if (locating) return;
    locateRequestedRef.current = true;
    onLocateRequest?.();
  }, [onLocateRequest, locating]);

  const mapStationCount = comparePrices
    ? stations.filter((s) => s.lat && s.lng).length
    : new Set(stations.filter((s) => s.lat && s.lng).map((s) => `${s.lat},${s.lng}`)).size;

  return (
    <div className="map-section anim-in anim-d2">
      <h2 className="section-title">{t("stationMap")}</h2>
      {(!CARTO_API_KEY || basemapFailed) && (
        <p className="map-notice" role="status">
          {t("mapUnavailable")}
        </p>
      )}
      <div style={{ position: "relative" }}>
        <div
          ref={containerRef}
          id="map"
          style={{
            height: "clamp(350px, 40vw, 560px)",
            borderRadius: "var(--radius)",
            zIndex: 1,
            border: "1px solid var(--border)",
          }}
        />
        <button
          className={`locate-btn${locating ? " locating" : ""}`}
          onClick={handleLocate}
          aria-disabled={locating}
          aria-busy={locating}
          title={t("myLocation")}
          aria-label={t("myLocation")}
        >
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
            <circle cx="12" cy="12" r="8" />
          </svg>
        </button>
      </div>
      <div className="map-legend">
        {comparePrices && <>
          <span>{t("legendLow")}</span>
          <div className="legend-gradient" />
          <span>{t("legendHigh")}</span>
        </>}
        <span style={{ marginLeft: "auto" }}>
          {mapStationCount} {t("pins")}
        </span>
      </div>
    </div>
  );
}
