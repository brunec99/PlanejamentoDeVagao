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
  searchParams: Promise<{ semana?: string; tipo?: string; ordem?: string; excluir?: string | string[]; painel?: string }>;
}) {
  const [{ obraId }, { semana, tipo, ordem, excluir, painel }] = await Promise.all([params, searchParams]);
  const week = semana && /^\d{4}-\d{2}-\d{2}$/.test(semana) ? semana : undefined;
  return (
    <PlanningProvider>
      <PrintSheet
        workId={obraId}
        week={week}
        kind={tipo === 'fechamento' ? 'fechamento' : 'planejamento'}
        order={ordem === 'inicio' ? 'inicio' : 'empreiteiro'}
        excluded={excluir === undefined ? [] : Array.isArray(excluir) ? excluir : [excluir]}
        // O painel sai por padrão: só `painel=0` (caixa desmarcada) tira. Exigir `painel=1` deixava sem painel
        // quem gerava o PDF de uma aba aberta antes do deploy de 30/10/2026, cuja janela não manda o parâmetro.
        dashboard={painel !== '0'}
      />
    </PlanningProvider>
  );
}
