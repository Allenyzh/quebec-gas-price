import { useState, useEffect, useId, useRef } from "react";
import { useModalFocus } from "../controllers/useModalFocus";

const STORAGE_KEY = "fuel-consent-dismissed";
const MOTION_KEY = "fuel-reduce-motion";

function applyMotionPref(on: boolean) {
  document.documentElement.classList.toggle("reduced-motion", on);
}

interface ConsentBannerProps {
  t: (key: string) => string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationEnabled: boolean;
  onLocationEnabledChange: (enabled: boolean) => void;
}

export function ConsentBanner({
  t,
  open,
  onOpenChange,
  locationEnabled,
  onLocationEnabledChange,
}: ConsentBannerProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const descriptionId = useId();
  const [reduceMotion, setReduceMotion] = useState(
    () => localStorage.getItem(MOTION_KEY) === "1",
  );

  useEffect(() => {
    applyMotionPref(reduceMotion);
  }, [reduceMotion]);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    onOpenChange(false);
  };
  useModalFocus(dialogRef, open, dismiss);

  const toggleMotion = () => {
    const next = !reduceMotion;
    setReduceMotion(next);
    localStorage.setItem(MOTION_KEY, next ? "1" : "0");
  };

  return (
    <>
      {open && (
        <div className="consent-overlay">
          <div
            className="consent-banner"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={t("privacyInfo")}
            aria-describedby={descriptionId}
            tabIndex={-1}
          >
            <p className="consent-msg" id={descriptionId}>{t("consentMsg")}</p>
            <label className="consent-toggle consent-location-toggle">
              <input
                type="checkbox"
                checked={locationEnabled}
                onChange={(event) => onLocationEnabledChange(event.target.checked)}
              />
              <span>{t("enableLocation")}</span>
            </label>
            <label className="consent-toggle">
              <input
                type="checkbox"
                checked={reduceMotion}
                onChange={toggleMotion}
              />
              <span>{t("reduceMotion")}</span>
            </label>
            <button type="button" className="consent-btn" onClick={dismiss}>
              {t("consentOk")}
            </button>
          </div>
        </div>
      )}
        <button
          type="button"
          className="consent-reopen"
          hidden={open}
          onClick={() => onOpenChange(true)}
          aria-label={t("privacyInfo")}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4m0-4h.01"/>
          </svg>
        </button>
    </>
  );
}
