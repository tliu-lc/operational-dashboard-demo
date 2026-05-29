"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useBoutique } from "@/context/BoutiqueContext";
import { fetchClientSearch } from "@/lib/api";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface Item {
  id: string;
  category: "Pages" | "Clients" | "Actions";
  label: string;
  hint?: string;
  action: () => void;
}

const PAGES: { href: string; label: string; aliases: string[] }[] = [
  { href: "/monitoring",  label: "Tableau de bord",          aliases: ["dashboard", "home", "accueil", "monitoring"] },
  { href: "/analyse",     label: "Analyse",                  aliases: ["analyse", "ca", "graph"] },
  { href: "/geo",         label: "Carte",                    aliases: ["geo", "map", "carte", "départements"] },
  { href: "/client",      label: "Clients",                  aliases: ["clients", "customers"] },
  { href: "/churn",       label: "Alertes départ",           aliases: ["churn", "départ", "alertes"] },
  { href: "/rfm",         label: "Relances clients",         aliases: ["rfm", "relance", "relances", "récence", "fréquence", "segmentation", "cycle"] },
  { href: "/articles",    label: "Articles",                 aliases: ["articles", "produits"] },
  { href: "/reassort",    label: "Réassort",                 aliases: ["reassort", "réassort", "réapprovisionnement"] },
  { href: "/perf-saison", label: "Performances saisonnières",aliases: ["perf", "saison", "performances"] },
  { href: "/paiements",   label: "Paiements",                aliases: ["paiements", "payment", "facture", "impayé"] },
];

function fuzzyMatch(text: string, query: string): boolean {
  const t = text.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return true;
  return t.includes(q);
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const { boutique } = useBoutique();
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [clients, setClients] = useState<{ customer_id: string; name: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset à l'ouverture
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      setClients([]);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  // Recherche clients (debounced)
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setClients([]);
      return;
    }
    const timer = setTimeout(() => {
      fetchClientSearch(query, boutique)
        .then(r => setClients(r.slice(0, 5)))
        .catch(() => setClients([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [query, boutique, open]);

  // Construction de la liste filtrée
  const items: Item[] = useMemo(() => {
    const list: Item[] = [];

    // Pages
    PAGES.forEach(p => {
      if (fuzzyMatch(p.label, query) || p.aliases.some(a => fuzzyMatch(a, query))) {
        list.push({
          id: `page-${p.href}`,
          category: "Pages",
          label: p.label,
          hint: p.href,
          action: () => router.push(p.href),
        });
      }
    });

    // Clients
    clients.forEach(c => {
      list.push({
        id: `client-${c.customer_id}`,
        category: "Clients",
        label: c.name,
        hint: c.customer_id,
        action: () => router.push(`/client/${c.customer_id}`),
      });
    });

    return list;
  }, [query, clients, router]);

  // Reset selection on filter change
  useEffect(() => { setSelectedIdx(0); }, [items.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx(i => Math.min(i + 1, items.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx(i => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = items[selectedIdx];
        if (item) {
          item.action();
          onClose();
        }
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, items, selectedIdx, onClose]);

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${selectedIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  if (!open) return null;

  // Grouping by category
  let lastCategory: string | null = null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-surface-2 border border-border rounded-xl shadow-2xl w-full max-w-xl mx-4 animate-slide-up overflow-hidden"
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-fg-subtle shrink-0">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Rechercher une page, un client…"
            className="flex-1 bg-transparent text-sm text-fg placeholder:text-fg-subtle outline-none"
          />
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-fg-subtle bg-surface border border-border rounded">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-fg-subtle">
              Aucun résultat
            </div>
          ) : (
            items.map((item, idx) => {
              const showHeader = item.category !== lastCategory;
              lastCategory = item.category;
              return (
                <div key={item.id}>
                  {showHeader && (
                    <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-fg-subtle uppercase tracking-wider">
                      {item.category}
                    </p>
                  )}
                  <button
                    data-idx={idx}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    onClick={() => { item.action(); onClose(); }}
                    className={`
                      w-full flex items-center justify-between gap-3 px-4 py-2 text-left text-sm transition-colors
                      ${idx === selectedIdx ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg"}
                    `}
                  >
                    <span className="truncate">{item.label}</span>
                    {item.hint && (
                      <span className="text-xs text-fg-subtle font-mono truncate">{item.hint}</span>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 py-2 flex items-center gap-4 text-[10px] text-fg-subtle">
          <span><kbd className="font-mono bg-surface px-1 py-0.5 rounded border border-border">↑↓</kbd> Naviguer</span>
          <span><kbd className="font-mono bg-surface px-1 py-0.5 rounded border border-border">↵</kbd> Ouvrir</span>
          <span className="ml-auto">Recherche : pages, clients (≥ 2 caractères)</span>
        </div>
      </div>
    </div>
  );
}
