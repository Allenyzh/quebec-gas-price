import { useState, useEffect, useCallback, useMemo } from "react";
import type { Station, Lang } from "../models/types";
import { fetchStations } from "../models/api";
import {
  getGasTypes,
  getRegions,
  filterByGas,
  filterByRegion,
  computeStats,
  computeBrandAverages,
  computeDistribution,
  defaultGasType,
} from "../models/stations";
import { getTranslator, getSavedLang, saveLang } from "../models/i18n";

export function useStations() {
  const [allStations, setAllStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLangState] = useState<Lang>(getSavedLang);
  const [gasType, setGasType] = useState("__all__");
  const [region, setRegion] = useState("__all__");
  const [radiusKm, setRadiusKm] = useState(5);

  const t = useMemo(() => getTranslator(lang), [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    saveLang(l);
    document.documentElement.lang = l === "zh" ? "zh-CN" : l;
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;
  }, [lang]);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    const spinStart = Date.now();
    try {
      const data = await fetchStations();
      setAllStations(data);
      const types = getGasTypes(data);
      setGasType(defaultGasType(types));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      // Ensure spinner completes at least one full rotation (700ms)
      const elapsed = Date.now() - spinStart;
      const remaining = Math.max(0, 700 - elapsed);
      if (isRefresh && remaining > 0) {
        await new Promise((r) => setTimeout(r, remaining));
      }
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const gasTypes = useMemo(() => getGasTypes(allStations), [allStations]);
  const regions = useMemo(() => getRegions(allStations), [allStations]);

  const gasStations = useMemo(
    () => filterByGas(allStations, gasType),
    [allStations, gasType]
  );

  const filteredStations = useMemo(
    () =>
      filterByRegion(gasStations, region).sort(
        (a, b) => a.price - b.price
      ),
    [gasStations, region]
  );

  const stats = useMemo(
    () => computeStats(filteredStations),
    [filteredStations]
  );

  const brandAverages = useMemo(
    () => computeBrandAverages(filteredStations),
    [filteredStations]
  );

  const distribution = useMemo(() => {
    if (!stats) return null;
    const prices = filteredStations.map((s) => s.price);
    return computeDistribution(prices, stats.min, stats.max);
  }, [filteredStations, stats]);

  const regionStationCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    gasStations.forEach((s) => {
      counts[s.region] = (counts[s.region] || 0) + 1;
    });
    return counts;
  }, [gasStations]);

  const gasTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allStations.forEach((s) => {
      counts[s.type] = (counts[s.type] || 0) + 1;
    });
    return counts;
  }, [allStations]);

  const refresh = useCallback(() => loadData(true), [loadData]);

  return {
    allStations,
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
  };
}
