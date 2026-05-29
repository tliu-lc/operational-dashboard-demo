interface Props {
  message: string;
  positive?: boolean;
}

export default function EmptyState({ message, positive = false }: Props) {
  return (
    <div className={`rounded-lg p-8 text-center ${positive ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300" : "bg-surface-3 text-fg-muted"}`}>
      <div className="text-3xl mb-2">{positive ? "✓" : "○"}</div>
      <p className="text-sm">{message}</p>
    </div>
  );
}
