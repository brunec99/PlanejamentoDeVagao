'use client';
import { useState } from 'react';
import { ChartGantt } from 'lucide-react';
import { LEGALIZATION_DEFAULT_NAME, isLegalizationPlan, legalizationWindow } from '@/domain/legalization';
import { Sheet, type SheetVariant } from '@/modules/medio-prazo/schedule-sheet';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout } from '@/modules/planejamento/ui';
import { CreateLegalizationForm, DeliveryForm } from './legalization-forms';
import { LegalizationSummary, projectDate, shortDate } from './legalization-summary';
import { LobImport } from './lob-import';

/* Gantt de legalização da aba 1 (modelo de 04/11/2026, telas 1 a 3, regras 1 a 18): os 12 meses até
 * a entrega da obra, com o caminho crítico da obra e a legalização por órgão até as chaves. É o
 * cronograma do médio prazo (`Sheet`, layout do Project, mesmo motor, rascunho, linha de base e
 * .xml), com o cabeçalho, a janela e as peças da aba 1 por cima: o resumo do topo, "Alterar entrega"
 * e "Trazer da Linha de Balanço". Um Gantt vivo por obra (regra 3); as linhas de base dele ficam de
 * fora da busca. */

/** A janela da entrega gravada, ou nada quando o plano veio sem data válida (dado inválido). */
function deliveryRange(deliveryDate?: string) {
  if (!deliveryDate) return undefined;
  try {
    return legalizationWindow(deliveryDate);
  } catch {
    return undefined;
  }
}

export function LegalizationView({ workId }: { workId: string }) {
  const context = usePlanning();
  // Criado com "Trazer também os serviços da Linha de Balanço": a importação abre sozinha uma vez.
  const [autoImport, setAutoImport] = useState(false);
  if (context.state !== 'ready') return null;
  const data = context.planning.data;
  const actor = data.users.find(u => u.id === context.actorId);
  if (!actor?.workIds.includes(workId)) return null;
  const readOnly = actor.role === 'viewer';
  const today = context.planning.today;
  const plan = data.plans.find(p => p.workId === workId && isLegalizationPlan(p) && !p.baselineOf);

  if (!plan)
    return (
      <section className="panel my-5 overflow-hidden">
        {/* Estado vazio: o que a tela faz, em uma frase, e o único botão que leva adiante. */}
        <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
          <ChartGantt size={28} className="text-slate-300" aria-hidden />
          <h2 className="text-base font-bold text-slate-900">Gantt de legalização</h2>
          <p className="max-w-md text-sm leading-6 text-slate-600">
            {readOnly
              ? 'Os 12 meses até a entrega: o caminho crítico da obra e cada documento até as chaves. Esta obra ainda não tem o seu; quem planeja a obra cria a partir da data de entrega.'
              : 'Os 12 meses até a entrega: o caminho crítico da obra e cada documento até as chaves. Informe a data de entrega para começar.'}
          </p>
          {!readOnly && (
            <span data-tour="longo-legal-criar" className="inline-flex">
              <CreateLegalizationForm workId={workId} today={today} onCreated={setAutoImport} />
            </span>
          )}
        </div>
      </section>
    );

  const range = deliveryRange(plan.deliveryDate);
  if (!plan.deliveryDate || !range)
    return (
      <section className="panel my-5 space-y-3 p-5">
        <Callout tone="warning" role="status">
          O Gantt de legalização desta obra está sem uma data de entrega contratual válida
          {plan.deliveryDate ? ` (gravado: "${plan.deliveryDate}")` : ''}. Sem ela não há prazo final nem janela de 12 meses, e o cronograma
          não abre. {readOnly ? 'Peça a quem planeja a obra para informar a entrega.' : 'Informe a entrega para corrigir.'}
        </Callout>
        {!readOnly && <DeliveryForm plan={plan} label="Informar a entrega" />}
      </section>
    );

  const deliveryDate = plan.deliveryDate;
  const variant: SheetVariant = {
    // Nome dado na criação aparece ao lado; sem nome, é só "Gantt de legalização".
    title: plan.name && plan.name !== LEGALIZATION_DEFAULT_NAME ? `${LEGALIZATION_DEFAULT_NAME} · ${plan.name}` : LEGALIZATION_DEFAULT_NAME,
    subtitle: (
      <>
        Entrega contratual {projectDate(deliveryDate)} · janela de {shortDate(range.start)} a {shortDate(range.end)}
      </>
    ),
    window: range,
    windowLabel: 'janela de 12 meses',
    defaultZoom: 'mes',
    defaultShown: ['totalSlack'],
    // "Alterar entrega" grava direto no banco: com rascunho aberto, o "Revisar e salvar" seguinte seria
    // recusado como alteração de outra pessoa, então o botão trava até salvar ou descartar.
    headerExtra: readOnly
      ? undefined
      : api => (
          <span data-tour="longo-legal-entrega" className="inline-flex">
            <DeliveryForm plan={plan} locked={api.dirty} />
          </span>
        ),
    summary: api => <LegalizationSummary api={api} deliveryDate={deliveryDate} today={today} />,
    tools: readOnly
      ? undefined
      : api => (
          <LobImport
            api={api}
            workId={workId}
            planId={plan.id}
            range={range}
            autoOpen={autoImport}
            onAutoOpenDone={() => setAutoImport(false)}
          />
        ),
  };
  return (
    <section className="panel my-5 overflow-hidden" data-tour="longo-legal-gantt">
      <Sheet
        key={`${context.actorId}:${plan.id}`}
        plan={plan}
        data={data}
        actorId={context.actorId}
        readOnly={readOnly}
        today={today}
        execute={context.execute}
        plans={[plan]}
        choose={() => {}}
        variant={variant}
      />
    </section>
  );
}
