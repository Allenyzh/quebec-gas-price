import { useState, useMemo } from "react";
import type { Station, SortCol } from "../models/types";
import { sortStations } from "../models/stations";

export function useTable(stations: Station[]) {
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<SortCol>("price");
  const [sortAsc, setSortAsc] = useState(true);

  const sorted = useMemo(
    () => sortStations(stations, sortCol, sortAsc),
    [stations, sortCol, sortAsc]
  );

  const filtered = useMemo(() => {
    if (!search) return sorted;
    const q = search.toLowerCase();
    return sorted.filter(
      (s) =>
        (s.brand + s.address + s.region).toLowerCase().includes(q)
    );
  }, [sorted, search]);

  const handleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(true);
    }
  };

  // Reset search when stations change
  const resetSearch = () => setSearch("");

  return {
    search,
    setSearch,
    sortCol,
    sortAsc,
    filtered,
    handleSort,
    resetSearch,
    totalCount: stations.length,
  };
}
