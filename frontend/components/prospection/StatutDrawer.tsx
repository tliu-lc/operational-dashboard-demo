"use client";
import { useState, useEffect, useCallback } from "react";
import type { Prospect, ProspectStatut } from "@/lib/api";
import { ApiError, fmtSiret, patchProspectStatus } from "@/lib/api";
import { STATUT_LABELS } from "./StatutBadge";

interface Props {
  prospect: Prospect | null;
  onClose: () => void;
  onSaved: (updated: Prospect) => void;
}

const STATUTS_ORDER: ProspectStatut[] = ["a_contacter", "contacte", "pas_interesse"];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function toDateInput(iso: string | null): string {
  return iso ?? "";
}

export default function StatutDrawer({ prospect, onClose, onSaved }: Props) {
  const open = prospect != null;
  const [statut, setStatut] = useState<ProspectStatut>("a_contacter");
  const [note, setNote] = useState("");
  const [dernierContact, setDernierContact] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  // Init quand le prospect change
  useEffect(() => {
    if (!prospect) return;
    setStatut(prospect.statut);
    setNote(prospect.note ?? "");
    setDernierContact(toDateInput(prospect.dernier_contact));
    setError(null);
    setConfirmClose(false);
  }, [prospect?.siret]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasChanges = prospect != null && (
    statut !== prospect.statut
    || (note ?? "") !== (prospect.note ?? "")
    || (dernierContact ?? "") !== toDateInput(prospect.dernier_contact)
  );

  // Auto-remplir dernier_contact à aujourd'hui si statut passe à autre que a_contacter
  useEffect(() => {
    if (!prospect) return;
    if (statut !== "a_contacter" && !dernierContact) {
      setDernierContact(todayISO());
    }
  }, [statut]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = useCallback(() => {
    if (hasChanges && !confirmClose) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }, [hasChanges, confirmClose, onClose]);

  // Esc et clic overlay
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  if (!prospect) return null;

  const noteOverflow = note.length;
  const noteWarn  = noteOverflow >= 450 && noteOverflow < 500;
  const noteFull  = noteOverflow >= 500;

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const payload = {
        statut,
        note: note.trim() ? note : null,
        dernier_contact: statut === "a_contacter" ? null : (dernierContact || todayISO()),
      };
      const res = await patchProspectStatus(prospect.siret, payload);
      onSaved({
        ...prospect,
        statut: res.statut,
        note: res.note,
        dernier_contact: res.dernier_contact,
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setError("Prospect introuvable — la liste a peut-être été mise à jour, rafraîchir la page.");
      } else {
        setError(e instanceof Error ? e.message : "Erreur d'enregistrement");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-fg/30 backdrop-blur-[2px] animate-fade-in"
        onClick={handleClose}
        aria-hidden="true"
      />
      {/* Drawer
       *  h-[100dvh] (dynamic viewport height) au lieu de h-screen : sur mobile,
       *  h-screen prend la hauteur sans déduire la barre URL navigateur — le footer
       *  Annuler/Enregistrer se retrouvait coupé sous le bord visible. dvh respecte
       *  la hauteur réellement visible.
       *  shrink-0 sur header + footer pour qu'ils ne soient jamais comprimés. */}
      <aside
        role="dialog"
        aria-label="Modifier statut prospect"
        className="fixed top-0 right-0 z-50 h-[100dvh] w-full md:w-[480px] bg-surface-2 shadow-xl border-l border-border flex flex-col"
        style={{ animation: "slide-in 0.2s ease-out" }}
      >
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-fg">Modifier statut prospect</h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Fermer"
            className="text-fg-subtle hover:text-fg w-8 h-8 flex items-center justify-center rounded hover:bg-surface-3"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Infos prospect */}
          <section>
            <h3 className="text-base font-semibold text-fg mb-2">{prospect.denomination ?? "—"}</h3>
            <dl className="text-sm text-fg-muted space-y-0.5">
              <div className="flex gap-2">
                <dt className="text-fg-subtle w-24">SIRET</dt>
                <dd className="font-mono text-xs text-fg">{fmtSiret(prospect.siret)}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-fg-subtle w-24">Adresse</dt>
                <dd>
                  {prospect.adresse_voie ?? "—"}
                  {prospect.adresse_complement && <><br />{prospect.adresse_complement}</>}
                  <br />
                  {prospect.zip_code} {prospect.city}
                </dd>
              </div>
              {prospect.date_creation && (
                <div className="flex gap-2">
                  <dt className="text-fg-subtle w-24">Créé le</dt>
                  <dd>{new Date(prospect.date_creation).toLocaleDateString("fr-FR")}</dd>
                </div>
              )}
              {prospect.tranche_effectif_libelle && (
                <div className="flex gap-2">
                  <dt className="text-fg-subtle w-24">Effectif</dt>
                  <dd>{prospect.tranche_effectif_libelle}</dd>
                </div>
              )}
            </dl>
          </section>

          <hr className="border-border" />

          {/* Statut */}
          <section>
            <p className="text-sm font-medium text-fg mb-2">Statut prospect *</p>
            <div className="space-y-1.5">
              {STATUTS_ORDER.map(s => (
                <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="statut"
                    value={s}
                    checked={statut === s}
                    onChange={() => setStatut(s)}
                    className="accent-fg"
                  />
                  <span className="text-fg-muted">{STATUT_LABELS[s]}</span>
                </label>
              ))}
            </div>
          </section>

          {/* Dernier contact */}
          <section>
            <label className="text-sm font-medium text-fg block mb-1.5">Date dernier contact</label>
            <input
              type="date"
              value={dernierContact}
              max={todayISO()}
              onChange={e => setDernierContact(e.target.value)}
              disabled={statut === "a_contacter"}
              className="w-full px-3 py-1.5 border border-border rounded-md text-sm bg-surface-2 text-fg disabled:bg-surface-3 disabled:text-fg-subtle"
            />
            {statut === "a_contacter" && (
              <p className="text-xs text-fg-subtle mt-1">
                Désactivé tant que le statut est « À contacter ».
              </p>
            )}
            {statut !== "a_contacter" && dernierContact && (
              <p className="text-xs text-fg-subtle mt-1">
                Auto-rempli à aujourd'hui si non précisé (modifiable).
              </p>
            )}
          </section>

          {/* Note libre */}
          <section>
            <label className="text-sm font-medium text-fg block mb-1.5">Note libre</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value.slice(0, 500))}
              rows={5}
              className="w-full px-3 py-2 border border-border rounded-md text-sm bg-surface-2 text-fg placeholder:text-fg-subtle resize-y min-h-24"
              placeholder="Contexte commercial, échanges, prochaine action…"
            />
            <p className={`text-xs mt-1 ${noteFull ? "text-red-600 dark:text-red-400" : noteWarn ? "text-amber-600 dark:text-amber-400" : "text-fg-subtle"}`}>
              {noteOverflow} / 500 caractères
            </p>
          </section>

          {error && (
            <div className="border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 rounded-md p-3 text-sm">
              {error}
            </div>
          )}

          {confirmClose && hasChanges && (
            <div className="border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 rounded-md p-3 text-sm">
              Vous avez des modifications non enregistrées. Cliquez à nouveau sur « Annuler » pour quitter sans sauvegarder.
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-border px-5 py-3 flex items-center justify-end gap-2 bg-surface-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-fg-muted hover:text-fg bg-surface-2 hover:bg-surface-3 border border-border rounded-md transition-colors disabled:opacity-60"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="px-4 py-2 text-sm font-medium text-surface bg-fg hover:opacity-90 rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </aside>

      <style jsx>{`
        @keyframes slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  );
}
