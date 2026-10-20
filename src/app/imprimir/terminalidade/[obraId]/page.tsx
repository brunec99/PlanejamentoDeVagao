import { TerminalityPrint } from '@/modules/terminalidade/print-list';
import { parsePrintParams } from '@/modules/terminalidade/print-options';

export const metadata = { title: 'Lista de pendências' };

/** Fora do layout do sistema (sem lateral nem cabeçalho) para imprimir só a lista. O login segue exigido
 * pelo proxy, e os dados vêm de /api/terminalidade/campo, que confere o acesso à obra. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ obraId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ obraId }, raw] = await Promise.all([params, searchParams]);
  return <TerminalityPrint workId={obraId} options={parsePrintParams(raw)} />;
}
