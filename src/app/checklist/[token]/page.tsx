import type { Metadata, Viewport } from 'next';
import { OperatorChecklist } from '@/modules/checklist/operator-app';

export const metadata: Metadata = { title: 'Checklist do equipamento', robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: '#0a364d', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

/** A tela do operador (12/11/2026): abre pelo QR colado no equipamento, SEM login. Fica fora do layout do
 * sistema e fora do proxy (ver o `matcher`); quem autoriza é o segredo do endereço, que a API
 * `/api/publico/checklist/<token>` confere. A página em si não traz dado nenhum. */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <OperatorChecklist token={token} />;
}
