interface Props {
  rows?: number;
  cols?: number;
}

export default function SkeletonTable({ rows = 8, cols = 5 }: Props) {
  return (
    <div className="animate-pulse">
      <div className="grid gap-1">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-2">
            {Array.from({ length: cols }).map((_, j) => (
              <div
                key={j}
                className="h-8 bg-surface-3 rounded flex-1"
                style={{ flex: j === 0 ? 2 : 1 }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
