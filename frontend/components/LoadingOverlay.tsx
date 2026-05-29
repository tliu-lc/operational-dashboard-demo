export default function LoadingOverlay() {
  return (
    <div className="fixed inset-0 z-50 bg-surface-2/80 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-fg-muted text-sm">Chargement…</p>
      </div>
    </div>
  );
}
