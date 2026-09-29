import type { Metadata } from 'next';
import Script from 'next/script';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'NIU Intelligence OS | Sistema de Inteligencia Comercial NIUPACK',
  description:
    'Sistema operativo de inteligencia comercial interna de NIUPACK (GARDINER S.A.) - Visibilidad AI, Precios Regionales, Costeo Industrial y Adquisición RFQ.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-screen bg-[#0c0f14] text-slate-100">
        <Script id="niu-theme-init" strategy="beforeInteractive">
          {`try { const theme = localStorage.getItem('niu-theme'); if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme; } catch {}`}
        </Script>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
