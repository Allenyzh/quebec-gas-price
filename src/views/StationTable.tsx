import type { Station, SortCol } from "../models/types";
import { priceClass } from "../models/stations";

interface StationTableProps {
  stations: Station[];
  filtered: Station[];
  totalCount: number;
  search: string;
  onSearchChange: (value: string) => void;
  sortCol: SortCol;
  sortAsc: boolean;
  onSort: (col: SortCol) => void;
  avg: number;
  min: number;
  max: number;
  region: string;
  t: (key: string) => string;
}

const SORT_COLS: { key: SortCol; labelKey: string }[] = [
  { key: "brand", labelKey: "thBrand" },
  { key: "address", labelKey: "thAddress" },
  { key: "region", labelKey: "thRegion" },
  { key: "price", labelKey: "thPrice" },
];

export function StationTable({
  stations,
  filtered,
  totalCount,
  search,
  onSearchChange,
  sortCol,
  sortAsc,
  onSort,
  avg,
  min,
  max,
  region,
  t,
}: StationTableProps) {
  // Build a rank map from the original sorted-by-price stations
  const rankMap = new Map<Station, number>();
  const sortedByPrice = [...stations].sort((a, b) => a.price - b.price);
  sortedByPrice.forEach((s, i) => rankMap.set(s, i + 1));

  return (
    <div className="table-section anim-in anim-d3">
      <h2 className="section-title">
        {t("allStations")}
        {region && region !== "__all__" && (
          <span
            style={{
              fontWeight: 400,
              fontSize: "0.75em",
              color: "var(--text-tertiary)",
              marginLeft: 8,
            }}
          >
            — {region}
          </span>
        )}
      </h2>
      <div className="toolbar">
        <input
          className="search-box"
          type="text"
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <span className="count-badge">
          {filtered.length} {t("of")} {totalCount}
        </span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 44 }}>#</th>
              {SORT_COLS.map((col) => (
                <th
                  key={col.key}
                  data-col={col.key}
                  onClick={() => onSort(col.key)}
                >
                  {t(col.labelKey)}{" "}
                  <span className="sort-arrow">
                    {sortCol === col.key ? (sortAsc ? "\u25B2" : "\u25BC") : ""}
                  </span>
                </th>
              ))}
              <th>{t("thVsAvg")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s, i) => {
              const rankIdx = rankMap.get(s) ?? i + 1;
              const rc = rankIdx <= 3 ? ` rank-${rankIdx}` : "";
              const diff = s.price - avg;
              const diffStr =
                diff >= 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
              return (
                <tr key={`${s.brand}-${s.address}-${s.price}-${i}`}>
                  <td>
                    <span className={`rank${rc}`}>{rankIdx}</span>
                  </td>
                  <td>{s.brand}</td>
                  <td>{s.address}</td>
                  <td style={{ color: "var(--text-tertiary)" }}>{s.region}</td>
                  <td className={priceClass(s.price, min, max)}>
                    {s.price.toFixed(1)}&cent;
                  </td>
                  <td style={{ color: "var(--text-tertiary)" }}>
                    {diffStr}&cent;
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
