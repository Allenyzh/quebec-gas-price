import type { NearbyState } from "../controllers/useNearby";
import type { NavTarget } from "../controllers/useNavModal";
import { formatDist } from "../models/geo";
import { NavIcon } from "./icons";

interface NearbyBannerProps {
  state: NearbyState;
  t: (key: string) => string;
  onNavigate: (target: NavTarget) => void;
}

function SkeletonNearby() {
  return (
    <div className="skel-nearby">
      <div className="text-[1.8rem] shrink-0 leading-none">&#xFE0E;&#x26FD;</div>
      <div className="skel-lines">
        <div className="skel" style={{ width: 100, height: 10 }} />
        <div className="skel" style={{ width: 140, height: 28 }} />
        <div className="skel" style={{ width: 200, height: 12 }} />
        <div className="skel" style={{ width: 160, height: 12 }} />
      </div>
      <div className="skel-others">
        <div className="skel" style={{ width: 180, height: 14 }} />
        <div className="skel" style={{ width: 180, height: 14 }} />
        <div className="skel" style={{ width: 180, height: 14 }} />
        <div className="skel" style={{ width: 180, height: 14 }} />
      </div>
    </div>
  );
}

export function NearbyBanner({ state, t, onNavigate }: NearbyBannerProps) {
  if (state.status === "idle") return null;

  if (state.status === "loading") return <SkeletonNearby />;

  if (state.status === "error") {
    return (
      <div className="nearby-banner error-state">
        <div className="nearby-icon">&#x26FD;&#xFE0E;</div>
        <div className="nearby-main">
          <div className="nearby-title">{t("nearbyError")}</div>
          <div className="nearby-detail">{t("nearbyErrorDetail")}</div>
        </div>
      </div>
    );
  }

  if (state.status === "none") {
    return (
      <div className="nearby-banner error-state">
        <div className="nearby-icon">&#x26FD;&#xFE0E;</div>
        <div className="nearby-main">
          <div className="nearby-title">
            {t("nearbyTitle").replace("{r}", String(state.radiusKm))}
          </div>
          <div className="nearby-detail">
            {t("nearbyNone").replace("{r}", String(state.radiusKm))}
          </div>
        </div>
      </div>
    );
  }

  const { top5, straightLine, radiusKm } = state;
  const cheapest = top5[0];
  const others = top5.slice(1);
  const awayStr = t("nearbyAway");

  return (
    <>
      <div className="nearby-banner">
        <div className="nearby-icon">&#xFE0E;&#x26FD;</div>
        <div className="nearby-main">
          <div className="nearby-title">
            {t("nearbyTitle").replace("{r}", String(radiusKm))}
          </div>
          <div className="nearby-price">
            {cheapest.price.toFixed(1)}&cent;/L
          </div>
          <div className="nearby-detail">
            <strong>{cheapest.brand}</strong> &middot; {cheapest.address}
            <br />
            {cheapest.region} &middot; {formatDist(cheapest.dist)}
            {awayStr ? " " + awayStr : ""}
            <br />
            <button
              type="button"
              className="nav-link"
              onClick={() =>
                onNavigate({ lat: cheapest.lat, lng: cheapest.lng, label: cheapest.brand + " " + cheapest.address, brand: cheapest.brand, price: cheapest.price, dist: cheapest.dist })
              }
            >
              <NavIcon /> {t("navigate")}
            </button>
          </div>
        </div>
        <div className="nearby-others">
          {others.map((s, i) => (
            <div key={i} className="nearby-other">
              <span className="other-price">{s.price.toFixed(1)}&cent;</span>
              <span className="other-brand" title={s.brand}>
                {s.brand}
              </span>
              <span className="other-dist">{formatDist(s.dist)}</span>
              <button
                type="button"
                className="nav-link"
                style={{ padding: "2px 8px", fontSize: "0.65rem", borderWidth: 1 }}
                onClick={() =>
                  onNavigate({ lat: s.lat, lng: s.lng, label: s.brand + " " + s.address, brand: s.brand, price: s.price, dist: s.dist })
                }
              >
                <NavIcon />
              </button>
            </div>
          ))}
        </div>
      </div>
      {straightLine && (
        <div className="text-[0.68rem] text-(--text-tertiary) mt-1.5 italic">
          {t("straightLine")}
        </div>
      )}
    </>
  );
}
