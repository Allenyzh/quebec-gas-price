import { useState, useCallback } from "react";

export interface NavTarget {
  lat: number;
  lng: number;
  label: string;
  brand: string;
  price: number;
  dist?: number;
}

export function useNavModal() {
  const [target, setTarget] = useState<NavTarget | null>(null);

  const openNavModal = useCallback((t: NavTarget) => {
    setTarget(t);
  }, []);

  const closeNavModal = useCallback(() => {
    setTarget(null);
  }, []);

  return { navTarget: target, openNavModal, closeNavModal };
}
