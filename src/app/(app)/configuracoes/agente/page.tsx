import { redirect } from 'next/navigation';
import { getRouteAccess } from '@/infrastructure/auth/supabase-server';
import { HelpNote } from '@/modules/layout/help-note';
import { AgentAdmin } from '@/modules/agente/agent-admin';
import { AGENT } from '@/modules/agente/agent-identity';
import { DEFAULT_MONTHLY_BUDGET_USD, WORK_SHARE_TOLERANCE, formatUsd } from '@/domain/agent-cost';
export const metadata = { title: 'Agente de IA' };

/** Consumo do agente de IA por pessoa e por obra, limite mensal por pessoa e corte de acesso
 * (27/10/2026). Só administrador entra: quem não é vai para a lista de obras, como nas outras telas
 * restritas, em vez de ver um painel vazio. */
export default async function AgenteAdminPage() {
  const { profile } = await getRouteAccess();
  if (profile?.role !== 'admin') redirect('/obras');
  return (
    <>
      <p className="eyebrow">Administração</p>
      <h1 className="page-title">Agente de IA</h1>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-sm text-slate-500">
          Quanto cada pessoa e cada obra consumiram de IA no mês, o limite mensal por pessoa e o corte de acesso.
        </p>
        <div data-tour="agente-admin-ajuda" className="inline-flex">
          <HelpNote title="Como funciona: agente de IA" compact>
            <p>
              <strong>Teto mensal geral</strong>: {formatUsd(DEFAULT_MONTHLY_BUDGET_USD)} por padrão (variável{' '}
              <code>AGENT_MONTHLY_BUDGET_USD</code>). É absoluto: atingido, {AGENT.name} para de chamar o modelo até o mês virar, para
              qualquer pessoa e qualquer obra.
            </p>
            <p>
              <strong>Parte de cada obra</strong>: o teto dividido pelas obras ativas, com folga de{' '}
              {String(WORK_SHARE_TOLERANCE).replace('.', ',')}
              ×. Uma obra pode usar até essa parte; assim nenhuma consome o crédito das outras.
            </p>
            <p>
              <strong>Limite por pessoa</strong> é opcional e vale além dos tetos: a pessoa para quando bate o limite dela ou quando a obra
              ou o mês batem o deles, o que vier primeiro. Vazio é sem limite.
            </p>
            <p>
              <strong>Cortar o acesso</strong> bloqueia só a IA para aquela pessoa: o radar determinístico (as checagens sem modelo)
              continua funcionando. Liberar reabre na hora.
            </p>
            <p>
              <strong>Custo</strong>: calculado dos tokens que a API da Anthropic devolve a cada chamada, com a tabela de preço do modelo em
              uso; não é estimativa.
            </p>
          </HelpNote>
        </div>
      </div>
      <div className="mt-8">
        <AgentAdmin />
      </div>
    </>
  );
}
