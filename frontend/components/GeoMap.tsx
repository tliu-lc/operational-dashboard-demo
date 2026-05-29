"use client";
import { useEffect, useRef, memo } from "react";

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trace: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  layout: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onClick?: (e: any) => void;
}

/**
 * Wrapper Plotly utilisant plotly.js-dist-min directement.
 *
 * Pourquoi pas react-plotly.js : la lib a des bugs récurrents avec les
 * re-renders et le binding d'events. En contrôlant Plotly directement via
 * useEffect, on garantit :
 *   - newPlot au premier mount
 *   - react (diff) sur update de trace/layout
 *   - purge au unmount (cleanup propre)
 *   - re-binding du plotly_click handler à chaque changement de handler
 */
function GeoMapInner({ trace, layout, config, onClick }: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const onClickRef = useRef(onClick);

  // Garde le handler à jour sans déclencher d'effet
  useEffect(() => { onClickRef.current = onClick; }, [onClick]);

  // Init Plotly au mount, cleanup au unmount
  useEffect(() => {
    const el = divRef.current;
    if (!el) return;

    let cancelled = false;
    let initialized = false;

    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Plotly = (await import("plotly.js-dist-min")).default as any;
      if (cancelled || !el) return;

      if (!trace) return;
      await Plotly.newPlot(el, [trace], layout, config);
      initialized = true;

      // Bind click via l'API Plotly directement (pas via React)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (el as any).on("plotly_click", (e: any) => {
        onClickRef.current?.(e);
      });
    })();

    return () => {
      cancelled = true;
      if (initialized && el) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        import("plotly.js-dist-min").then(mod => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const Plotly = (mod as any).default;
          try { Plotly.purge(el); } catch {}
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update Plotly quand trace/layout/config changent
  useEffect(() => {
    const el = divRef.current;
    if (!el || !trace) return;

    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Plotly = (await import("plotly.js-dist-min")).default as any;
      try {
        await Plotly.react(el, [trace], layout, config);
      } catch (err) {
        // Si react() échoue (état corrompu), on purge et on recrée from scratch
        console.warn("Plotly.react failed, recreating chart", err);
        try { Plotly.purge(el); } catch {}
        await Plotly.newPlot(el, [trace], layout, config);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (el as any).on("plotly_click", (e: any) => {
          onClickRef.current?.(e);
        });
      }
    })();
  }, [trace, layout, config]);

  if (!trace) {
    return <div className="bg-surface-3 rounded h-96 animate-pulse" />;
  }

  return <div ref={divRef} style={{ width: "100%", height: layout?.height ?? 500 }} />;
}

export default memo(GeoMapInner);
