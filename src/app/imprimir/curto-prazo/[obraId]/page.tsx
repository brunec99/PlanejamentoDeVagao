import { redirect } from 'next/navigation';
import { hasSectionAccess } from '@/application/module-access';
import { getRouteAccess } from '@/infrastructure/auth/supabase-server';
import { PlanningProvider } from '@/modules/planejamento/planning-provider';
import { PrintSheet } from '@/modules/curto-prazo/print-sheet';
import { listParam } from '@/modules/curto-prazo/print-options';

export const metadata = { title: 'Planejamento de curto prazo' };

/** Fora do layout do sistema (sem lateral nem cabeçalho) para imprimir só a planilha. O login segue
 * exigido pelo proxy, e os dados vêm da mesma /api/planning, recortada pelas obras da pessoa. Desde 08/11/2026
 * o proxy também desvia quem não tem o curto prazo liberado; a página confere de novo. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ obraId: string }>;
  searchParams: Promise<{
    semana?: string;
    tipo?: string;
    ordem?: string;
    excluir?: string | string[];
    /** Locais desmarcados na janela do PDF (05/11/2026): o id de cada um, e vazio para as linhas sem local. */
    'excluir-local'?: string | string[];
    painel?: string;
  }>;
}) {
  const [{ obraId }, { semana, tipo, ordem, excluir, 'excluir-local': excluirLocal, painel }] = await Promise.all([params, searchParams]);
  if (!hasSectionAccess('curto-prazo', await getRouteAccess())) redirect(`/obras/${encodeURIComponent(obraId)}/dashboard`);
  const week = semana && /^\d{4}-\d{2}-\d{2}$/.test(semana) ? semana : undefined;
  return (
    <PlanningProvider>
      <PrintSheet
        workId={obraId}
        week={week}
        kind={tipo === 'fechamento' ? 'fechamento' : 'planejamento'}
        order={ordem === 'inicio' ? 'inicio' : 'empreiteiro'}
        excluded={listParam(excluir)}
        excludedLocals={listParam(excluirLocal)}
        // O painel sai por padrão: só `painel=0` (caixa desmarcada) tira. Exigir `painel=1` deixava sem painel
        // quem gerava o PDF de uma aba aberta antes do deploy de 30/10/2026, cuja janela não manda o parâmetro.
        dashboard={painel !== '0'}
      />
    </PlanningProvider>
  );
}
