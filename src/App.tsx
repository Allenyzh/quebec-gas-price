import { useCallback, useMemo, useRef, useState } from "react";
import { useStations } from "./controllers/useStations";
import { useNearby } from "./controllers/useNearby";
import { useTable } from "./controllers/useTable";
import { useNavModal } from "./controllers/useNavModal";
import { Header } from "./views/Header";
import { NearbyBanner } from "./views/NearbyBanner";
import { MetricsStrip } from "./views/MetricsStrip";
import { BrandChart } from "./views/BrandChart";
import { DistributionChart } from "./views/DistributionChart";
import { StationMap } from "./views/StationMap";
import { StationTable } from "./views/StationTable";
import { NavModal } from "./views/NavModal";
import { ConsentBanner } from "./views/ConsentBanner";

const LOCATION_KEY = "fuel-location-osrm-enabled";

function App() {
  const {
    loading, refreshing, error, hasLoadedData,
    lang, setLang, t,
    gasType, setGasType, gasTypes, gasTypeCounts,
    region, setRegion, regions, regionStationCounts,
    radiusKm, setRadiusKm, gasStations, filteredStations,
    stats, brandAverages, distribution, refresh,
  } = useStations();

  const [locationEnabled, setLocationEnabled] = useState(
    () => localStorage.getItem(LOCATION_KEY) !== "0",
  );
  const [privacyOpen, setPrivacyOpen] = useState(
    () => !localStorage.getItem("fuel-consent-dismissed"),
  );
  const onLocationEnabledChange = useCallback((enabled: boolean) => {
    localStorage.setItem(LOCATION_KEY, enabled ? "1" : "0");
    setLocationEnabled(enabled);
  }, []);

  const { navTarget, openNavModal, closeNavModal } = useNavModal();
  const regionWasSelected = useRef(false);
  const onRegionChange = useCallback((selectedRegion: string) => {
    regionWasSelected.current = true;
    setRegion(selectedRegion);
  }, [setRegion]);
  const onRegionDetected = useCallback((detectedRegion: string) => {
    if (!regionWasSelected.current && regions.includes(detectedRegion)) {
      setRegion(detectedRegion);
    }
  }, [regions, setRegion]);

  // Mixed fuels can be browsed together, but their prices are not comparable.
  const comparePrices = gasType !== "__all__";
  const nearbyStations = useMemo(
    () => comparePrices ? gasStations : [],
    [comparePrices, gasStations],
  );
  const { state: nearbyState, geoPos, requestLocation } = useNearby(
    nearbyStations, radiusKm, onRegionDetected, locationEnabled,
  );
  const onLocateRequest = () => {
    if (locationEnabled) requestLocation();
    else setPrivacyOpen(true);
  };
  const table = useTable(filteredStations);

  const subtitle = useMemo(() => {
    if (!stats) return hasLoadedData ? t("noData") : t(loading ? "loading" : "loadFail");
    const now = new Date();
    const dateLoc = lang === "zh" ? "zh-CN" : lang === "fr" ? "fr-CA" : "en-CA";
    const regionLabel = region === "__all__" ? t("allRegions") : region;
    const countLabel = t(comparePrices ? "stations" : "fuelPrices").toLowerCase();
    return `<a href="https://www.regie-energie.qc.ca/fr" target="_blank" rel="noopener">${t("source")}</a> · <span class="subtitle-break"></span>${regionLabel} · ${now.toLocaleDateString(dateLoc)} ${now.toLocaleTimeString(dateLoc, { hour: "2-digit", minute: "2-digit" })} · ${stats.total} ${countLabel}`;
  }, [stats, lang, region, t, comparePrices, hasLoadedData, loading]);

  return (
    <>
      <ConsentBanner
        t={t}
        open={privacyOpen}
        onOpenChange={setPrivacyOpen}
        locationEnabled={locationEnabled}
        onLocationEnabledChange={onLocationEnabledChange}
      />
      <Header
        t={t} lang={lang} onLangChange={setLang}
        radiusKm={radiusKm} onRadiusChange={setRadiusKm}
        onRefresh={refresh} refreshing={refreshing} loading={loading}
        gasTypes={gasTypes} gasType={gasType} gasTypeCounts={gasTypeCounts}
        onGasTypeChange={setGasType}
        regions={regions} region={region}
        regionStationCounts={regionStationCounts}
        gasStationTotal={gasStations.length} onRegionChange={onRegionChange}
        subtitle={subtitle}
      />
      <main className="container">
        {loading ? (
          <div className="loading" role="status">
            <div className="spinner" aria-hidden="true" />
            <br />
            <span>{t("fetching")}</span>
          </div>
        ) : error && !hasLoadedData ? (
          <div className="loading" role="alert">
            <p style={{ color: "var(--danger)" }}>{t("loadFail")}: {error}</p>
            <button type="button" className="nav-link" onClick={refresh}>
              {t("retry")}
            </button>
          </div>
        ) : (
          <>
            {error && (
              <div className="map-notice" role="alert">
                {t("refreshFail")}{" "}
                <button type="button" className="nav-link" onClick={refresh} disabled={refreshing}>
                  {t("retry")}
                </button>
              </div>
            )}
            {!comparePrices ? (
              <p className="map-notice">{t("allFuelsNotice")}</p>
            ) : !locationEnabled ? (
              <div className="map-notice">
                {t("locationOptional")}{" "}
                <button type="button" className="nav-link" onClick={() => setPrivacyOpen(true)}>
                  {t("enableNearby")}
                </button>
              </div>
            ) : (
              <NearbyBanner state={nearbyState} t={t} onNavigate={openNavModal} />
            )}
            {stats ? (
              <>
                {comparePrices && (
                  <>
                    <MetricsStrip stats={stats} t={t} />
                    <div className="two-col anim-in anim-d1">
                      <BrandChart brandAverages={brandAverages} min={stats.min} max={stats.max} t={t} />
                      {distribution && (
                        <DistributionChart buckets={distribution.buckets} bucketSize={distribution.bucketSize} min={stats.min} t={t} />
                      )}
                    </div>
                  </>
                )}
                <StationMap
                  stations={filteredStations} stats={stats} t={t}
                  onNavigate={openNavModal} geoPos={geoPos}
                  routingEnabled={locationEnabled} onLocateRequest={onLocateRequest}
                  locating={nearbyState.status === "loading" && !geoPos}
                  comparePrices={comparePrices}
                />
                <StationTable
                  stations={filteredStations} filtered={table.filtered}
                  totalCount={table.totalCount} search={table.search}
                  onSearchChange={table.setSearch} sortCol={table.sortCol}
                  sortAsc={table.sortAsc} onSort={table.handleSort}
                  avg={stats.avg} min={stats.min} max={stats.max}
                  region={region} onNavigate={openNavModal} t={t}
                  comparePrices={comparePrices}
                />
              </>
            ) : (
              <p style={{ color: "var(--text-tertiary)", padding: "20px 0" }}>{t("noData")}</p>
            )}
          </>
        )}
      </main>
      {navTarget && <NavModal target={navTarget} t={t} onClose={closeNavModal} />}
    </>
  );
}

export default App;
