export interface Station {
  brand: string;
  address: string;
  region: string;
  type: string;
  price: number;
  lat: number;
  lng: number;
}

export interface StationWithDist extends Station {
  dist: number;
}

export interface BrandAvg {
  name: string;
  avg: number;
  count: number;
}

export interface StationStats {
  min: number;
  max: number;
  avg: number;
  median: number;
  spread: number;
  regionCount: number;
  total: number;
  cheapest: Station;
  mostExpensive: Station;
}

export type Lang = "en" | "fr" | "zh";

export type SortCol = "brand" | "address" | "region" | "price";
