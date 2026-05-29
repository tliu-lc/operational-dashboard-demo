"use client";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fillOpacity?: number;
  strokeWidth?: number;
}

/**
 * Mini-graphique SVG sans dépendance. Trace une ligne + zone remplie.
 */
export default function Sparkline({
  data,
  width = 100,
  height = 32,
  color = "currentColor",
  fillOpacity = 0.12,
  strokeWidth = 1.5,
}: SparklineProps) {
  if (!data || data.length === 0) {
    return <div style={{ width, height }} className="rounded bg-surface-3" />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  // Points normalisés en coordonnées SVG
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return [x, y];
  });

  const linePath = pts.map(([x, y], i) => (i === 0 ? `M ${x},${y}` : `L ${x},${y}`)).join(" ");
  const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <path d={areaPath} fill={color} fillOpacity={fillOpacity} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
