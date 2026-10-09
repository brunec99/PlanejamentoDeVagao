import { PlanningProvider } from '@/modules/planejamento/planning-provider';
import { PrintSheet } from '@/modules/curto-prazo/print-sheet';

export const metadata = { title: 'Planejamento de curto prazo' };

/** Fora do layout do sistema (sem lateral nem cabeçalho) para imprimir só a planilha. O login segue
 * exigido pelo proxy, e os dados vêm da mesma /api/planning, recortada pelas obras da pessoa. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ obraId: string }>;
  searchParams: Promise<{ semana?: string; tipo?: string }>;
}) {
  const [{ obraId }, { semana, tipo }] = await Promise.all([params, searchParams]);
  const week = semana && /^\d{4}-\d{2}-\d{2}$/.test(semana) ? semana : undefined;
  return (
    <PlanningProvider>
      <PrintSheet workId={obraId} week={week} kind={tipo === 'fechamento' ? 'fechamento' : 'planejamento'} />
    </PlanningProvider>
  );
}
