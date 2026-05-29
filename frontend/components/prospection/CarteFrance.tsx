"use client";
import { useState, useMemo, useCallback } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import type { ProspectDept } from "@/lib/api";
import type { MetriqueCarte } from "./SelecteurMetrique";
import CarteInfobulle from "./CarteInfobulle";
import { colorForValue, valueForMetrique, DROM_CODES } from "./carteColors";
const DROM_LABELS: Record<string, { num: string; iso: string; name: string }> = {
  "971": { num: "971", iso: "GP", name: "Guadeloupe" },
  "972": { num: "972", iso: "MQ", name: "Martinique" },
  "973": { num: "973", iso: "GF", name: "Guyane"     },
  "974": { num: "974", iso: "RE", name: "La Réunion" },
  "976": { num: "976", iso: "YT", name: "Mayotte"    },
};

interface GeoJson {
  type: "FeatureCollection";
  features: { type: "Feature"; geometry: unknown; properties: { code: string; nom: string } }[];
}

interface Props {
  geojson: GeoJson | null;
  data: ProspectDept[];
  metrique: MetriqueCarte;
  quintiles: number[];
  selectedDept: string | null;
  onSelectDept: (code: string | null) => void;
}

export default function CarteFrance({ geojson, data, metrique, quintiles, selectedDept, onSelectDept }: Props) {
  const [hovered, setHovered] = useState<{ dept: ProspectDept; x: number; y: number } | null>(null);

  const byCode = useMemo(
    () => new Map(data.map(d => [d.code_departement, d])),
    [data],
  );

  const metropoleGeoJson = useMemo(() => {
    if (!geojson) return null;
    return {
      ...geojson,
      features: geojson.features.filter(f => !DROM_CODES.has(f.properties.code)),
    };
  }, [geojson]);

  const handleMouseMove = useCallback((e: React.MouseEvent, code: string) => {
    const dept = byCode.get(code);
    if (!dept) return;
    setHovered({ dept, x: e.clientX, y: e.clientY });
  }, [byCode]);

  const handleClick = useCallback((code: string) => {
    onSelectDept(selectedDept === code ? null : code);
  }, [selectedDept, onSelectDept]);

  // Quintiles incluent les seuils — exposés à la légende via callback ?
  // On les passe via props parent. Ici on calcule pour rendre la carte.
  // (parent affichera la légende avec les mêmes valeurs)

  if (!geojson || !metropoleGeoJson) {
    return <div className="bg-surface-3 animate-pulse rounded-xl" style={{ height: 620 }} />;
  }

  return (
    <div className="relative">
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 2400, center: [2.4, 46.7] }}
        width={800}
        height={620}
        style={{ width: "100%", height: "auto" }}
      >
        <Geographies geography={metropoleGeoJson}>
          {({ geographies }) =>
            geographies.map(geo => {
              const code = geo.properties.code as string;
              const dept = byCode.get(code);
              const fill = dept
                ? colorForValue(valueForMetrique(dept, metrique), quintiles)
                : "#f5f5f4";
              const isSelected = selectedDept === code;
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={fill}
                  stroke={isSelected ? "#1c1917" : "#ffffff"}
                  strokeWidth={isSelected ? 1.5 : 0.5}
                  style={{
                    default: { outline: "none", cursor: dept ? "pointer" : "default" },
                    hover:   { outline: "none", fill, opacity: 0.85 },
                    pressed: { outline: "none" },
                  }}
                  onMouseEnter={(e) => handleMouseMove(e, code)}
                  onMouseMove={(e) => handleMouseMove(e, code)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => dept && handleClick(code)}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>

      {/* DROM en encarts séparés */}
      <div className="flex gap-2 mt-2 justify-center flex-wrap">
        {Object.entries(DROM_LABELS).map(([code, lbl]) => {
          const dept = byCode.get(code);
          const fill = dept
            ? colorForValue(valueForMetrique(dept, metrique), quintiles)
            : "#f5f5f4";
          const isSelected = selectedDept === code;
          return (
            <button
              key={code}
              type="button"
              onClick={() => dept && handleClick(code)}
              onMouseEnter={(e) => dept && handleMouseMove(e, code)}
              onMouseMove={(e) => dept && handleMouseMove(e, code)}
              onMouseLeave={() => setHovered(null)}
              className={`w-14 h-14 flex flex-col items-center justify-center rounded border text-xs font-medium transition-shadow ${
                isSelected
                  ? "border-fg shadow-sm"
                  : "border-border hover:shadow-sm"
              } ${dept ? "cursor-pointer" : "cursor-default"}`}
              style={{ backgroundColor: fill }}
              title={`${lbl.num} — ${lbl.name}`}
              disabled={!dept}
            >
              <span className="font-semibold text-stone-800">{lbl.num}</span>
              <span className="text-[10px] text-stone-700">{lbl.iso}</span>
            </button>
          );
        })}
      </div>

      {hovered && <CarteInfobulle dept={hovered.dept} x={hovered.x} y={hovered.y} />}
    </div>
  );
}
