"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import SeahorseIcon from "./SeahorseIcon";
import { useBoutique } from "@/context/BoutiqueContext";

type NavItem = { href: string; label: string; icon: React.ReactNode };
type NavGroup = { label: string; items: NavItem[] };

// Icônes SVG inline (style Lucide, 16x16, stroke 1.75)
const I = (path: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
       strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
    {path.split("|").map((d, i) => <path key={i} d={d} />)}
  </svg>
);

const ICONS = {
  dashboard: I("M3 13h8V3H3v10z|M13 21h8V11h-8v10z|M3 21h8v-6H3v6z|M13 9h8V3h-8v6z"),
  chart:     I("M3 3v18h18|M7 14l3-3 3 3 5-5"),
  map:       I("M9 6l-6 3v12l6-3 6 3 6-3V6l-6 3-6-3z|M9 6v15|M15 9v15"),
  users:     I("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M22 21v-2a4 4 0 0 0-3-3.87|M16 3.13a4 4 0 0 1 0 7.75"),
  alert:     I("M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z|M12 9v4|M12 17h.01"),
  star:      I("M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.32.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .32-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5z"),
  box:       I("M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z|M3.27 6.96 12 12.01l8.73-5.05|M12 22.08V12"),
  cube:      I("M21 8V21H3V8|M1 3h22v5H1z|M10 12h4"),
  refresh:   I("M3 12a9 9 0 0 1 15-6.7L21 8|M21 3v5h-5|M21 12a9 9 0 0 1-15 6.7L3 16|M3 21v-5h5"),
  spark:     I("M14 2v6h6|M16 13H8|M16 17H8|M10 9H8|M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"),
  card:      I("M21 4H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z|M1 10h22"),
  pin:       I("M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z|M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"),
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Ventes",
    items: [
      { href: "/monitoring", label: "Tableau de bord", icon: ICONS.dashboard },
      { href: "/analyse",    label: "Analyse",          icon: ICONS.chart     },
      { href: "/geo",        label: "Carte",            icon: ICONS.map       },
    ],
  },
  {
    label: "Prospection",
    items: [
      { href: "/prospection", label: "Prospection", icon: ICONS.pin },
    ],
  },
  {
    label: "Clients",
    items: [
      { href: "/client",  label: "Clients",        icon: ICONS.users },
      { href: "/churn",   label: "Alertes départ", icon: ICONS.alert },
      { href: "/rfm",     label: "Relances",       icon: ICONS.star  },
    ],
  },
  {
    label: "Catalogue",
    items: [
      { href: "/articles",    label: "Articles",     icon: ICONS.box     },
      { href: "/reassort",    label: "Réassort",     icon: ICONS.refresh },
      { href: "/perf-saison", label: "Performances", icon: ICONS.spark   },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/paiements", label: "Paiements", icon: ICONS.card },
    ],
  },
];

export default function Sidebar({ mobileOpen, onMobileClose }: { mobileOpen: boolean; onMobileClose: () => void }) {
  const pathname = usePathname();
  const { appName } = useBoutique();

  return (
    <>
      {/* Overlay mobile */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50 animate-fade-in"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={`
          fixed md:sticky top-0 left-0 z-50
          h-screen w-60 shrink-0
          bg-surface-2 border-r border-border
          flex flex-col
          transition-transform duration-200
          ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        {/* Logo */}
        <Link
          href="/"
          onClick={onMobileClose}
          className="flex items-center gap-2 h-14 px-4 border-b border-border shrink-0"
        >
          <SeahorseIcon className="w-5 h-7 text-accent" />
          <span className="font-semibold text-fg tracking-tight">{appName}</span>
        </Link>

        {/* Navigation scrollable */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
          {NAV_GROUPS.map(group => (
            <div key={group.label}>
              <p className="px-2 mb-1.5 text-[10px] font-semibold text-fg-subtle uppercase tracking-wider">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map(({ href, label, icon }) => {
                  const isActive = pathname.startsWith(href);
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        onClick={onMobileClose}
                        className={`
                          flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors
                          ${isActive
                            ? "bg-surface-3 text-fg font-medium"
                            : "text-fg-muted hover:bg-surface-3 hover:text-fg"
                          }
                        `}
                      >
                        <span className={isActive ? "text-accent" : "text-fg-subtle"}>{icon}</span>
                        <span>{label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Footer sidebar : version */}
        <div className="px-4 py-3 border-t border-border text-[11px] text-fg-subtle">
          {appName} Monitor · v1.0
        </div>
      </aside>
    </>
  );
}
