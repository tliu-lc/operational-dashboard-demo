"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import SeahorseIcon from "@/components/SeahorseIcon";
import { useBoutique } from "@/context/BoutiqueContext";

export default function LoginPage() {
  const router = useRouter();
  const { appName } = useBoutique();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        router.push("/monitoring");
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error ?? "Erreur de connexion");
      }
    } catch {
      setError("Impossible de contacter le serveur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-3 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <SeahorseIcon className="w-12 h-16 mx-auto mb-3 text-fg" />
          <h1 className="text-2xl font-bold text-fg tracking-tight">{appName}</h1>
          <p className="text-sm text-fg-muted mt-1">Tableau de bord opérationnel</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-surface-2 rounded-xl border border-border shadow-sm p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-fg mb-1">Identifiant</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoFocus
              autoComplete="username"
              className="w-full border border-border-strong rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 bg-surface-2 text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-fg mb-1">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full border border-border-strong rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 bg-surface-2 text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-fg text-surface rounded-lg py-2 text-sm font-medium hover:bg-fg-muted disabled:opacity-50 transition-colors"
          >
            {loading ? "Connexion…" : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}
