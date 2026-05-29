import type { Metadata } from "next";
import "./globals.css";
import { BoutiqueProvider } from "@/context/BoutiqueContext";
import { ThemeProvider } from "@/context/ThemeContext";
import AppShell from "@/components/AppShell";

const APP_NAME = process.env.APP_NAME ?? "MAISON DELOR";

export const metadata: Metadata = {
  title: `${APP_NAME} — Tableau de bord`,
  description: `Tableau de bord opérationnel — ${APP_NAME}`,
};

// Script anti-flash : applique le thème AVANT le rendu React
const themeScript = `
(function() {
  try {
    var stored = localStorage.getItem('hippo-theme');
    var resolved = stored;
    if (!stored || stored === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    if (resolved === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>
          <BoutiqueProvider>
            <AppShell>{children}</AppShell>
          </BoutiqueProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
