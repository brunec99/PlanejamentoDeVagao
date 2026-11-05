import type { Metadata, Viewport } from 'next';
import { FieldSafety } from '@/modules/seguranca/field-app';

export const metadata: Metadata = { title: 'Segurança em campo' };
export const viewport: Viewport = { themeColor: '#0a364d', width: 'device-width', initialScale: 1, viewportFit: 'cover' };
// Casca estática de propósito, como a terminalidade em campo (`/campo/terminalidade`): nada de sessão nem
// banco na renderização. É o que permite ao service worker (`/campo-sw.js`) guardar esta página e abri-la
// sem sinal no canteiro. A obra vem de `?obra=`, lida no navegador pela própria tela. Os dados vêm das
// APIs autenticadas: sem sessão, a tela pede login, e nenhum dado de obra chega ao aparelho. O proxy
// deixa `/campo/` passar sem sessão por isso.
export const dynamic = 'force-static';

export default function FieldSafetyPage() {
  return <FieldSafety />;
}
