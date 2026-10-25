import { navUrl } from "../models/geo";
import { formatDist } from "../models/geo";
import type { MapProvider } from "../models/geo";
import type { NavTarget } from "../controllers/useNavModal";
import { X } from 'lucide-react';
import { useId, useRef } from "react";
import { useModalFocus } from "../controllers/useModalFocus";

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
  const { lat, lng, label, brand, price, dist, fuelType } = target;
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useModalFocus(dialogRef, true, onClose);
  const distStr = dist != null ? ` | ${formatDist(dist)}` : "";
  const subtitle = `${brand}${fuelType ? ` · ${fuelType}` : ""} · ${price.toFixed(1)}\u00a2/L${distStr}`;

  return (
    <div className="nav-modal-overlay" onClick={onClose}>
      <div
        className="nav-modal"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="nav-modal-title" id={titleId}>{t("navigate")}</h2>
        <div className="nav-modal-subtitle" id={descriptionId}>{subtitle}</div>
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
        <button type="button" className="nav-modal-cancel" onClick={onClose} aria-label={t("close")}>
          <X aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
