export default function SeahorseIcon({ className = "w-4 h-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 160" className={className} fill="currentColor" aria-hidden="true">
      <ellipse cx="58" cy="22" rx="18" ry="16" />
      <rect x="70" y="16" width="24" height="8" rx="4" />
      <circle cx="62" cy="17" r="4" fill="white" />
      <circle cx="63" cy="17" r="2" fill="#333" />
      <path d="M44 18 Q36 10 40 28 Q34 20 38 38 Q32 30 36 48" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M52 36 C38 42 32 55 34 68 C36 80 44 86 44 98 C44 110 38 118 34 126 C30 134 34 144 42 148 C50 152 56 146 54 138 C52 132 46 130 48 122 C50 114 56 108 58 96 C62 82 56 70 58 58 C60 46 66 40 64 36 Z" />
      <path d="M34 68 Q22 65 20 74 Q18 83 30 80" />
    </svg>
  );
}
