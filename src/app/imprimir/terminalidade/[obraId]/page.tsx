import { redirect } from 'next/navigation';
import { hasSectionAccess } from '@/application/module-access';
import { getRouteAccess } from '@/infrastructure/auth/supabase-server';
import { TerminalityPrint } from '@/modules/terminalidade/print-list';
import { parsePrintParams } from '@/modules/terminalidade/print-options';

export const metadata = { title: 'Lista de pendências' };

/** Fora do layout do sistema (sem lateral nem cabeçalho) para imprimir só a lista. O login segue exigido
 * pelo proxy, e os dados vêm de /api/terminalidade/campo, que confere o acesso à obra e ao módulo. Desde
 * 08/11/2026 o proxy também desvia quem não tem a terminalidade liberada; a página confere de novo. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ obraId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ obraId }, raw] = await Promise.all([params, searchParams]);
  if (!hasSectionAccess('terminalidade', await getRouteAccess())) redirect(`/obras/${encodeURIComponent(obraId)}/dashboard`);
  return <TerminalityPrint workId={obraId} options={parsePrintParams(raw)} />;
}
