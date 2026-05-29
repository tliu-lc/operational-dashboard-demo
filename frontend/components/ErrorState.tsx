interface Props {
  message?: string;
  onRetry?: () => void;
}

export default function ErrorState({ message = "Une erreur est survenue.", onRetry }: Props) {
  return (
    <div className="rounded-lg p-8 text-center bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300">
      <div className="text-3xl mb-2">⚠</div>
      <p className="text-sm mb-4">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700"
        >
          Réessayer
        </button>
      )}
    </div>
  );
}
