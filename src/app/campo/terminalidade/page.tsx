import type { Metadata, Viewport } from 'next';
import { FieldTerminality } from '@/modules/terminalidade/field-app';

export const metadata: Metadata = { title: 'Terminalidade em campo' };
export const viewport: Viewport = { themeColor: '#0a364d', width: 'device-width', initialScale: 1, viewportFit: 'cover' };
// Casca estática de propósito, como a vistoria da Obra do Mês no App-ATR: nada de sessão nem banco
// na renderização. É o que permite ao service worker (`/campo-sw.js`) guardar esta página e abri-la
// sem sinal no canteiro. Os dados vêm das APIs autenticadas: sem sessão, a tela pede login, e nenhum
// dado de obra chega ao aparelho. O proxy deixa `/campo/` passar sem sessão por isso.
export const dynamic = 'force-static';

export default function FieldTerminalityPage() {
  return <FieldTerminality />;
}
