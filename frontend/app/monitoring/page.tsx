"use client";
import { useState, useEffect, useCallback } from "react";
import { useBoutique } from "@/context/BoutiqueContext";
import {
  fetchMonitoringHealth,
  fetchMonitoringKpis,
  fetchMonitoringSummary,
  fetchMonitoringFeed,
} from "@/lib/api";
import type { MonitoringHealth, MonitoringKpis, MonitoringSummary, DailyFeed } from "@/lib/api";
import HeroKpis from "@/components/monitoring/HeroKpis";
import TodaySummary from "@/components/monitoring/TodaySummary";
import HealthSection from "@/components/monitoring/HealthSection";
import KpisSection from "@/components/monitoring/KpisSection";
import AlertsSection from "@/components/monitoring/AlertsSection";
import DailyFeedSection from "@/components/monitoring/DailyFeedSection";

const AUTO_REFRESH_MS = 60_000;

export default function MonitoringPage() {
  const { boutique, boutiqueLoaded } = useBoutique();

  const [health, setHealth] = useState<MonitoringHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [kpis, setKpis] = useState<MonitoringKpis | null>(null);
  const [kpisLoading, setKpisLoading] = useState(true);
  const [kpisError, setKpisError] = useState<string | null>(null);

  const [summary, setSummary] = useState<MonitoringSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [feed, setFeed] = useState<DailyFeed | null>(null);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);

  const [secondsSince, setSecondsSince] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const doLoadHealth = useCallback((showSkeleton: boolean) => {
    if (showSkeleton) setHealthLoading(true);
    setHealthError(null);
    return fetchMonitoringHealth()
      .then(setHealth).catch(e => setHealthError(e.message))
      .finally(() => setHealthLoading(false));
  }, []);

  const doLoadKpis = useCallback((b: string, showSkeleton: boolean) => {
    if (showSkeleton) setKpisLoading(true);
    setKpisError(null);
    return fetchMonitoringKpis(b)
      .then(setKpis).catch(e => setKpisError(e.message))
      .finally(() => setKpisLoading(false));
  }, []);

  const doLoadSummary = useCallback((b: string, showSkeleton: boolean) => {
    if (showSkeleton) setSummaryLoading(true);
    setSummaryError(null);
    return fetchMonitoringSummary(b)
      .then(setSummary).catch(e => setSummaryError(e.message))
      .finally(() => setSummaryLoading(false));
  }, []);

  const doLoadFeed = useCallback((b: string, showSkeleton: boolean) => {
    if (showSkeleton) setFeedLoading(true);
    setFeedError(null);
    return fetchMonitoringFeed(b)
      .then(setFeed).catch(e => setFeedError(e.message))
      .finally(() => setFeedLoading(false));
  }, []);

  const refreshAll = useCallback((showSkeleton: boolean) => {
    setIsRefreshing(true);
    setSecondsSince(0);
    Promise.all([
      doLoadHealth(showSkeleton),
      doLoadKpis(boutique, showSkeleton),
      doLoadSummary(boutique, showSkeleton),
      doLoadFeed(boutique, showSkeleton),
    ]).finally(() => setIsRefreshing(false));
  }, [boutique, doLoadHealth, doLoadKpis, doLoadSummary, doLoadFeed]);

  useEffect(() => {
    if (!boutiqueLoaded) return;
    doLoadHealth(true);
    doLoadKpis(boutique, true);
    doLoadSummary(boutique, true);
    doLoadFeed(boutique, true);
    setSecondsSince(0);
  }, [boutique, boutiqueLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!boutiqueLoaded) return;
    const id = setInterval(() => {
      doLoadHealth(false);
      doLoadKpis(boutique, false);
      doLoadSummary(boutique, false);
      setSecondsSince(0);
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [boutique, boutiqueLoaded, doLoadHealth, doLoadKpis, doLoadSummary]);

  useEffect(() => {
    const id = setInterval(() => setSecondsSince(s => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-6">
      {/* Bandeau actualisation */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs text-fg-subtle flex items-center gap-2">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${
            health?.bq_status === "ok" ? "bg-emerald-500" : "bg-rose-500"
          } animate-pulse`} />
          Actualisé il y a {secondsSince}s
        </p>
        <button
          onClick={() => refreshAll(false)}
          disabled={isRefreshing}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-fg-muted hover:text-fg bg-surface-2 hover:bg-surface-3 border border-border rounded-md transition-colors disabled:opacity-60"
        >
          <svg className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Actualiser
        </button>
      </div>

      {/* Hero KPIs avec sparkline + tendances */}
      <HeroKpis data={kpis} loading={kpisLoading} boutique={boutique} />

      {/* À traiter aujourd'hui + Activité du jour côte à côte */}
      <div className="grid lg:grid-cols-2 gap-4">
        <TodaySummary data={summary} loading={summaryLoading} />
        <DailyFeedSection
          data={feed}
          loading={feedLoading}
          error={feedError}
          onRetry={() => doLoadFeed(boutique, true)}
        />
      </div>

      {/* Sections existantes (couverture stock, qualité données, alertes, santé) */}
      <KpisSection
        data={kpis}
        loading={kpisLoading}
        error={kpisError}
        onRetry={() => doLoadKpis(boutique, true)}
      />

      <AlertsSection
        data={summary}
        loading={summaryLoading}
        error={summaryError}
        onRetry={() => doLoadSummary(boutique, true)}
      />

      <HealthSection
        data={health}
        loading={healthLoading}
        error={healthError}
        onRetry={() => doLoadHealth(true)}
      />
    </div>
  );
}
