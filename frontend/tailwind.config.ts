import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./context/**/*.{ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        surface:         "rgb(var(--surface) / <alpha-value>)",
        "surface-2":     "rgb(var(--surface-2) / <alpha-value>)",
        "surface-3":     "rgb(var(--surface-3) / <alpha-value>)",
        border:          "rgb(var(--border) / <alpha-value>)",
        "border-strong": "rgb(var(--border-strong) / <alpha-value>)",
        fg:              "rgb(var(--fg) / <alpha-value>)",
        "fg-muted":      "rgb(var(--fg-muted) / <alpha-value>)",
        "fg-subtle":     "rgb(var(--fg-subtle) / <alpha-value>)",
        accent:          "rgb(var(--accent) / <alpha-value>)",
        "accent-fg":     "rgb(var(--accent-fg) / <alpha-value>)",
      },
      boxShadow: {
        card:         "0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 1px 0 rgb(0 0 0 / 0.06)",
        "card-hover": "0 4px 12px -2px rgb(0 0 0 / 0.08), 0 2px 4px -1px rgb(0 0 0 / 0.04)",
      },
      animation: {
        "fade-in":  "fade-in 0.2s ease-out",
        "slide-up": "slide-up 0.25s ease-out",
      },
      keyframes: {
        "fade-in":  { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        "slide-up": { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
      },
    },
  },
  plugins: [],
};

export default config;
