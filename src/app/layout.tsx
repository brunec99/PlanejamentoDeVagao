import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';

// A fonte vem do pacote instalado, não do Google Fonts: o build de produção não depende de rede,
// o que já falhou uma vez, e a versão servida é a que está no package-lock.
const inter = localFont({
  src: [
    { path: '../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', weight: '100 900', style: 'normal' },
    { path: '../../node_modules/@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2', weight: '100 900', style: 'normal' },
  ],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Obra 360 · ATR', template: '%s | Obra 360' },
  description: 'Cronogramas de longo, médio e curto prazo, planejamento por vagões e modelo federado.',
  applicationName: 'Obra 360',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Obra 360', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#1d4ed8',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`h-full antialiased ${inter.variable}`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
