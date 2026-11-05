import { SafetyPrint } from '@/modules/seguranca/print-list';
import { parsePrintParams } from '@/modules/seguranca/print-options';

export const metadata = { title: 'Vistoria de segurança do trabalho' };

/** Fora do layout do sistema (sem lateral nem cabeçalho) para imprimir só a vistoria. O login segue exigido
 * pelo proxy, e os dados vêm de /api/seguranca/campo, que confere o acesso à obra. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ obraId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ obraId }, raw] = await Promise.all([params, searchParams]);
  return <SafetyPrint workId={obraId} options={parsePrintParams(raw)} />;
}
