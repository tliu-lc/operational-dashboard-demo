interface Props {
  count: number;
  label: string;
}

export default function AlertBanner({ count, label }: Props) {
  if (count === 0) return null;
  return (
    <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900 text-orange-800 px-4 py-2 rounded-lg text-sm font-medium mb-4">
      ⚠ {count} {label}
    </div>
  );
}
