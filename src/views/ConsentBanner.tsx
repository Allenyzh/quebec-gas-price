import { useState, useEffect } from "react";

const STORAGE_KEY = "fuel-consent-dismissed";

interface ConsentBannerProps {
  t: (key: string) => string;
}

export function ConsentBanner({ t }: ConsentBannerProps) {
  const [visible, setVisible] = useState(
    () => !localStorage.getItem(STORAGE_KEY),
  );

  useEffect(() => {
    if (visible) {
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.inset = "0";
      document.body.style.width = "100%";
    } else {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.inset = "";
      document.body.style.width = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.inset = "";
      document.body.style.width = "";
    };
  }, [visible]);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  };

  return (
    <>
      {visible && (
        <div className="consent-overlay">
          <div className="consent-banner">
            <p className="consent-msg">{t("consentMsg")}</p>
            <button className="consent-btn" onClick={dismiss}>
              {t("consentOk")}
            </button>
          </div>
        </div>
      )}
      {!visible && (
        <button
          className="consent-reopen"
          onClick={() => setVisible(true)}
          aria-label="Privacy info"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4m0-4h.01"/>
          </svg>
        </button>
      )}
    </>
  );
}
