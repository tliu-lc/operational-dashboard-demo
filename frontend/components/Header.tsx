"use client";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "@/context/ThemeContext";
import BoutiqueSelector from "./BoutiqueSelector";

const PAGE_TITLES: Record<string, string> = {
  "/":             "Accueil",
  "/monitoring":   "Tableau de bord",
  "/analyse":      "Analyse",
  "/geo":          "Carte",
  "/client":       "Clients",
  "/churn":        "Alertes départ",
  "/rfm":          "Relances clients",
  "/articles":     "Articles",
  "/reassort":     "Réassort",
  "/perf-saison":  "Performances saisonnières",
  "/paiements":    "Paiements",
};

function pageTitle(pathname: string): string {
  // Match exact d'abord, sinon le préfixe le plus long
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  const segments = Object.keys(PAGE_TITLES).sort((a, b) => b.length - a.length);
  const match = segments.find(p => p !== "/" && pathname.startsWith(p));
  return match ? PAGE_TITLES[match] : "—";
}

interface HeaderProps {
  onMenuClick: () => void;
  onCommandPaletteOpen?: () => void;
}

export default function Header({ onMenuClick, onCommandPaletteOpen }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolved, toggle } = useTheme();

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur-sm border-b border-border h-14 flex items-center px-4 md:px-6 gap-3">
      {/* Burger mobile */}
      <button
        onClick={onMenuClick}
        className="md:hidden p-1.5 text-fg-muted hover:text-fg hover:bg-surface-3 rounded-md transition-colors"
        aria-label="Menu"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
          <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Titre de page */}
      <h1 className="text-base font-semibold text-fg truncate flex-1">
        {pageTitle(pathname)}
      </h1>

      {/* Actions à droite */}
      <div className="flex items-center gap-2">

        {/* Bouton ⌘K — placeholder pour la command palette */}
        <button
          onClick={onCommandPaletteOpen}
          className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 text-xs text-fg-muted bg-surface-3 hover:bg-surface-3 hover:text-fg border border-border rounded-md transition-colors"
          title="Recherche rapide (⌘K)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" strokeLinecap="round" />
          </svg>
          <span>Rechercher</span>
          <kbd className="ml-2 px-1.5 py-0.5 text-[10px] font-mono bg-surface border border-border rounded">⌘K</kbd>
        </button>

        <BoutiqueSelector />

        {/* Toggle dark mode */}
        <button
          onClick={toggle}
          className="p-1.5 text-fg-muted hover:text-fg hover:bg-surface-3 rounded-md transition-colors"
          aria-label={`Passer en mode ${resolved === "dark" ? "clair" : "sombre"}`}
          title={`Mode ${resolved === "dark" ? "clair" : "sombre"}`}
        >
          {resolved === "dark" ? (
            // Soleil
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4 h-4">
              <circle cx="12" cy="12" r="4" />
              <path strokeLinecap="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          ) : (
            // Lune
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>

        {/* Bouton logout */}
        <button
          onClick={logout}
          title="Déconnexion"
          className="p-1.5 text-fg-muted hover:text-fg hover:bg-surface-3 rounded-md transition-colors"
          aria-label="Déconnexion"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
        </button>
      </div>
    </header>
  );
}
