import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import type { Station, StationStats } from "../models/types";
import type { NavTarget } from "../controllers/useNavModal";
import { priceToColor } from "../models/geo";

interface StationMapProps {
  stations: Station[];
  stats: StationStats;
  t: (key: string) => string;
  onNavigate: (target: NavTarget) => void;
  geoPos: { lat: number; lng: number } | null;
}

const CLUSTER_THRESHOLD = 300;

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

async function fetchRoute(
  fromLat: number, fromLng: number, toLat: number, toLng: number,
): Promise<[number, number][] | null> {
  try {
    const resp = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`,
    );
    const data = await resp.json();
    if (data.code !== "Ok" || !data.routes?.[0]) return null;
    return data.routes[0].geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng] as [number, number],
    );
  } catch {
    return null;
  }
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
}: StationMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.LayerGroup | L.MarkerClusterGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const routeRef = useRef<L.Polyline | null>(null);
  const geoPosRef = useRef(geoPos);
  const onNavigateRef = useRef(onNavigate);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    geoPosRef.current = geoPos;
  }, [geoPos]);

  // Keep ref in sync with prop
  useEffect(() => {
    onNavigateRef.current = onNavigate;
  }, [onNavigate]);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true }).setView(
      [46.8, -71.2],
      7,
    );
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
      },
    ).addTo(map);

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
      });
    });

    mapRef.current = map;

    // Route: draw on popup open, clear on popup close
    map.on("popupopen", (e: L.PopupEvent) => {
      const latlng = e.popup.getLatLng();
      const geo = geoPosRef.current;
      if (!latlng || !geo) return;
      fetchRoute(geo.lat, geo.lng, latlng.lat, latlng.lng).then((coords) => {
        if (!coords) return;
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
    map.on("popupclose", () => clearRoute(map, routeRef));

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update markers when stations change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (markersRef.current) {
      map.removeLayer(markersRef.current);
      markersRef.current = null;
    }

    const mapStations = stations.filter((s) => s.lat && s.lng);
    if (!mapStations.length) return;

    const { min, max, avg, total } = stats;
    const sortedByPrice = [...stations].sort((a, b) => a.price - b.price);

    function makeMarker(s: Station) {
      const rankIdx = sortedByPrice.indexOf(s) + 1;
      const color = priceToColor(s.price, min, max);
      const diff = s.price - avg;
      const diffStr = diff >= 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
      const label = s.brand + " " + s.address;
      const marker = L.marker([s.lat, s.lng], {
        icon: createMarkerIcon(color),
      });
      (marker as unknown as Record<string, number>)._stationPrice = s.price;
      marker.bindPopup(
        `<div style="min-width:170px;font-family:Plus Jakarta Sans,system-ui,sans-serif">
          <div class="map-popup-brand">${s.brand}</div>
          <div class="map-popup-price" style="color:${color}">${s.price.toFixed(1)}\u00a2/L</div>
          <div class="map-popup-addr">${s.address}</div>
          <div style="font-size:0.7rem;color:#888;margin-top:2px">${s.region}</div>
          <div class="map-popup-rank" style="background:${color}18;color:${color}">#${rankIdx}/${total} (${diffStr}\u00a2)</div>
          <div class="map-popup-nav"><button class="nav-link" data-nav-lat="${s.lat}" data-nav-lng="${s.lng}" data-nav-label="${label.replace(/"/g, "&quot;")}" data-nav-brand="${s.brand.replace(/"/g, "&quot;")}" data-nav-price="${s.price}">${navSvg} ${t("navigate")}</button></div>
        </div>`,
        { closeButton: false },
      );
      return marker;
    }

    const useCluster = mapStations.length > CLUSTER_THRESHOLD;

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
          const sorted = children
            .map((m) => (m as unknown as Record<string, number>)._stationPrice)
            .sort((a, b) => a - b);
          const medP =
            count % 2 === 0
              ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2
              : sorted[Math.floor(count / 2)];
          const bg = priceToColor(medP, min, max);
          const size = count < 20 ? 40 : count < 100 ? 48 : 56;
          return L.divIcon({
            html: `<div class="marker-cluster-custom" style="width:${size}px;height:${size}px;background:${bg}">
              <span class="cluster-count">${count}</span>
              <span class="cluster-price">${t("clusterMed")} ${medP.toFixed(1)}\u00a2</span>
            </div>`,
            className: "",
            iconSize: L.point(size, size),
          });
        },
      });
      mapStations.forEach((s) => cluster.addLayer(makeMarker(s)));
      map.addLayer(cluster);
      markersRef.current = cluster;
    } else {
      const group = L.layerGroup();
      mapStations.forEach((s) => makeMarker(s).addTo(group));
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
  }, [stations, stats, t]);

  // Show user position dot on map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (userMarkerRef.current) {
      map.removeLayer(userMarkerRef.current);
      userMarkerRef.current = null;
    }
    if (geoPos) {
      userMarkerRef.current = L.marker([geoPos.lat, geoPos.lng], {
        icon: userPosIcon,
        zIndexOffset: 9999,
        interactive: false,
      }).addTo(map);
    }
  }, [geoPos]);

  const handleLocate = useCallback(() => {
    if (!navigator.geolocation || !mapRef.current) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude: lat, longitude: lng } = pos.coords;
        const map = mapRef.current;
        if (!map) return;
        // Update user marker
        if (userMarkerRef.current) map.removeLayer(userMarkerRef.current);
        userMarkerRef.current = L.marker([lat, lng], {
          icon: userPosIcon,
          zIndexOffset: 9999,
          interactive: false,
        }).addTo(map);
        map.setView([lat, lng], 13, { animate: true });
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  const mapStationCount = stations.filter((s) => s.lat && s.lng).length;

  return (
    <div className="map-section anim-in anim-d2">
      <h2 className="section-title">{t("stationMap")}</h2>
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
          title="My location"
          aria-label="My location"
        >
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
            <circle cx="12" cy="12" r="8" />
          </svg>
        </button>
      </div>
      <div className="map-legend">
        <span>{t("legendLow")}</span>
        <div className="legend-gradient" />
        <span>{t("legendHigh")}</span>
        <span style={{ marginLeft: "auto" }}>
          {mapStationCount} {t("pins")}
        </span>
      </div>
    </div>
  );
}
