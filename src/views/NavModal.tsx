import { navUrl } from "../models/geo";
import { formatDist } from "../models/geo";
import type { MapProvider } from "../models/geo";
import type { NavTarget } from "../controllers/useNavModal";
import { X } from 'lucide-react';

interface NavModalProps {
  target: NavTarget;
  t: (key: string) => string;
  onClose: () => void;
}

const PROVIDERS: { key: MapProvider; name: string }[] = [
  { key: "apple", name: "Apple Maps" },
  { key: "google", name: "Google Maps" },
  { key: "waze", name: "Waze" },
];

export function NavModal({ target, t, onClose }: NavModalProps) {
  const { lat, lng, label, brand, price, dist } = target;
  const distStr = dist != null ? ` | ${formatDist(dist)}` : "";
  const subtitle = `${brand} ${price.toFixed(1)}\u00a2${distStr}`;

  return (
    <div className="nav-modal-overlay" onClick={onClose}>
      <div className="nav-modal" onClick={(e) => e.stopPropagation()}>
        <div className="nav-modal-title">{t("navigate")}</div>
        <div className="nav-modal-subtitle">{subtitle}</div>
        <div className="nav-modal-options">
          {PROVIDERS.map((p) => (
            <a
              key={p.key}
              className="nav-modal-option"
              href={navUrl(lat, lng, label, p.key)}
              target="_blank"
              rel="noopener"
              onClick={onClose}
            >
              <span>{p.name}</span>
            </a>
          ))}
        </div>
        <button className="nav-modal-cancel" onClick={onClose}>
          <X />
        </button>
      </div>
    </div>
  );
}
