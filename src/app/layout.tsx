import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
export const metadata: Metadata = { title: { default: 'Sistema de Gestão de Projetos – ATR', template: '%s | Gestão de Projetos ATR' }, description: 'Cronogramas de longo, médio e curto prazo, planejamento por vagões, modelo federado e BIM 4D.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR" className={`h-full antialiased ${inter.variable}`}><body className="min-h-full font-sans">{children}</body></html>;
}
