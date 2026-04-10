import { useCallback, useMemo } from "react";
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

function App() {
  const {
    loading,
    refreshing,
    error,
    lang,
    setLang,
    t,
    gasType,
    setGasType,
    gasTypes,
    gasTypeCounts,
    region,
    setRegion,
    regions,
    regionStationCounts,
    radiusKm,
    setRadiusKm,
    gasStations,
    filteredStations,
    stats,
    brandAverages,
    distribution,
    refresh,
  } = useStations();

  const { navTarget, openNavModal, closeNavModal } = useNavModal();

  const onRegionDetected = useCallback(
    (detectedRegion: string) => {
      if (regions.includes(detectedRegion)) {
        setRegion(detectedRegion);
      }
    },
    [regions, setRegion],
  );

  const { state: nearbyState, geoPos, setGeoPos } = useNearby(
    gasStations,
    radiusKm,
    onRegionDetected,
  );

  const table = useTable(filteredStations);

  const subtitle = useMemo(() => {
    if (!stats) return t("loading");
    const now = new Date();
    const dateLoc = lang === "zh" ? "zh-CN" : "fr-CA";
    const regionLabel = region === "__all__" ? t("allRegions") : region;
    return `<a href="https://www.regie-energie.qc.ca/fr"  target="_blank" rel="noopener">${t("source")}</a> \u00b7 <span class="subtitle-break"></span>${regionLabel} \u00b7 ${now.toLocaleDateString(dateLoc)} ${now.toLocaleTimeString(dateLoc, { hour: "2-digit", minute: "2-digit" })} \u00b7 ${stats.total} ${t("stations").toLowerCase()}`;
  }, [stats, lang, region, t]);

  const headerProps = {
    t,
    lang,
    onLangChange: setLang,
    radiusKm,
    onRadiusChange: setRadiusKm,
    onRefresh: refresh,
    refreshing,
  };

  if (loading) {
    return (
      <>
        <Header
          {...headerProps}
          gasTypes={[]}
          gasType=""
          gasTypeCounts={{}}
          onGasTypeChange={() => {}}
          regions={[]}
          region="__all__"
          regionStationCounts={{}}
          gasStationTotal={0}
          onRegionChange={() => {}}
          subtitle={t("loading")}
        />
        <main className="container">
          <div className="loading">
            <div className="spinner" />
            <br />
            <span>{t("fetching")}</span>
          </div>
        </main>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Header
          {...headerProps}
          gasTypes={[]}
          gasType=""
          gasTypeCounts={{}}
          onGasTypeChange={() => {}}
          regions={[]}
          region="__all__"
          regionStationCounts={{}}
          gasStationTotal={0}
          onRegionChange={() => {}}
          subtitle={t("loading")}
        />
        <main className="container">
          <div className="loading" style={{ color: "var(--danger)" }}>
            {t("loadFail")}: {error}
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <ConsentBanner t={t} />
      <Header
        {...headerProps}
        gasTypes={gasTypes}
        gasType={gasType}
        gasTypeCounts={gasTypeCounts}
        onGasTypeChange={setGasType}
        regions={regions}
        region={region}
        regionStationCounts={regionStationCounts}
        gasStationTotal={gasStations.length}
        onRegionChange={setRegion}
        subtitle={subtitle}
      />
      <main className="container">
        <NearbyBanner state={nearbyState} t={t} onNavigate={openNavModal} />

        {stats ? (
          <>
            <MetricsStrip stats={stats} t={t} />

            <div className="two-col anim-in anim-d1">
              <BrandChart
                brandAverages={brandAverages}
                min={stats.min}
                max={stats.max}
                t={t}
              />
              {distribution && (
                <DistributionChart
                  buckets={distribution.buckets}
                  bucketSize={distribution.bucketSize}
                  min={stats.min}
                  t={t}
                />
              )}
            </div>

            <StationMap
              stations={filteredStations}
              stats={stats}
              t={t}
              onNavigate={openNavModal}
              geoPos={geoPos}
              onGeoUpdate={setGeoPos}
            />

            <StationTable
              stations={filteredStations}
              filtered={table.filtered}
              totalCount={table.totalCount}
              search={table.search}
              onSearchChange={table.setSearch}
              sortCol={table.sortCol}
              sortAsc={table.sortAsc}
              onSort={table.handleSort}
              avg={stats.avg}
              min={stats.min}
              max={stats.max}
              region={region}
              t={t}
            />
          </>
        ) : (
          <p style={{ color: "var(--text-tertiary)", padding: "20px 0" }}>
            {t("noData")}
          </p>
        )}
      </main>

      {navTarget && (
        <NavModal target={navTarget} t={t} onClose={closeNavModal} />
      )}
    </>
  );
}

export default App;
