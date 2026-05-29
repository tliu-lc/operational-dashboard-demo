"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Boutique = string;

// Valeurs par défaut prod (remplacées par /api/config au montage)
export const BOUTIQUE_LABELS: Record<string, string> = {
  HIP: "Paris 11e",
  SED: "Lyon Presqu'île",
  HPC: "Bordeaux Chartrons",
  ACC: "Nantes Commerce",
  ALL: "Maison Delor",
};

export const BOUTIQUE_ORDER: string[] = ["HIP", "SED", "HPC", "ACC", "ALL"];

interface BoutiqueCtx {
  boutique: string;
  setBoutique: (b: string) => void;
  boutiqueLoaded: boolean;
  appName: string;
  boutiqueLabels: Record<string, string>;
  boutiqueOrder: string[];
}

const BoutiqueContext = createContext<BoutiqueCtx>({
  boutique: "HIP",
  setBoutique: () => {},
  boutiqueLoaded: false,
  appName: "MAISON DELOR",
  boutiqueLabels: BOUTIQUE_LABELS,
  boutiqueOrder: BOUTIQUE_ORDER,
});

export function BoutiqueProvider({ children }: { children: ReactNode }) {
  const [boutique, setBoutiqueState] = useState<string>("HIP");
  const [boutiqueLoaded, setBoutiqueLoaded] = useState(false);
  const [appName, setAppName] = useState("MAISON DELOR");
  const [boutiqueLabels, setBoutiqueLabels] = useState<Record<string, string>>(BOUTIQUE_LABELS);
  const [boutiqueOrder, setBoutiqueOrder] = useState<string[]>(BOUTIQUE_ORDER);

  useEffect(() => {
    // Fetch app config from API (app_name + boutiques dynamiques)
    fetch("/api/config")
      .then(r => r.ok ? r.json() : null)
      .then(cfg => {
        if (!cfg) return;
        if (cfg.app_name) setAppName(cfg.app_name);
        if (cfg.boutiques) setBoutiqueLabels(cfg.boutiques);
        if (cfg.boutique_order) {
          setBoutiqueOrder(cfg.boutique_order);
          // Réinitialise la boutique si la valeur stockée n'est plus valide
          const stored = localStorage.getItem("boutique");
          if (stored && cfg.boutique_order.includes(stored)) {
            setBoutiqueState(stored);
          } else {
            setBoutiqueState(cfg.boutique_order[0]);
            localStorage.setItem("boutique", cfg.boutique_order[0]);
          }
        } else {
          const stored = localStorage.getItem("boutique");
          if (stored && Object.keys(cfg.boutiques ?? BOUTIQUE_LABELS).includes(stored)) {
            setBoutiqueState(stored);
          }
        }
      })
      .catch(() => {
        // Fallback : lit localStorage avec les codes prod par défaut
        const stored = localStorage.getItem("boutique");
        if (stored && Object.keys(BOUTIQUE_LABELS).includes(stored)) {
          setBoutiqueState(stored);
        } else {
          setBoutiqueState("HIP");
          localStorage.setItem("boutique", "HIP");
        }
      })
      .finally(() => setBoutiqueLoaded(true));
  }, []);

  const setBoutique = (b: string) => {
    setBoutiqueState(b);
    localStorage.setItem("boutique", b);
  };

  return (
    <BoutiqueContext.Provider value={{ boutique, setBoutique, boutiqueLoaded, appName, boutiqueLabels, boutiqueOrder }}>
      {children}
    </BoutiqueContext.Provider>
  );
}

export function useBoutique() {
  return useContext(BoutiqueContext);
}
