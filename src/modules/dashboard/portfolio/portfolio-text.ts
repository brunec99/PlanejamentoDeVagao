import { formatDate } from '@/shared/format';
import { dayMonth, monthShort, pct, PORTFOLIO_MODULES, signedDays, signedPoints, type PortfolioModule } from '../model';
import { scaleLabel } from '../period';
import type { PortfolioData, PortfolioRow, PortfolioWork } from './types';

/** O Dashboard geral em texto para a Claudia (08/11/2026, ferramenta `panorama_obras`): compacto, em pt-BR, com os
 * rótulos da página (`portfolio-charts.tsx`, `portfolio-overview.tsx`), e nunca maior que `PORTFOLIO_TEXT_LIMIT`.
 * Ordem: período, quadros, a frase e os cartões do topo; uma linha por obra com os números de cada quadro mostrado
 * ("sem dado" quando a obra não tem o módulo no período, "erro" quando a leitura falhou; quadro escondido não
 * aparece); depois as causas somando as obras (até 8, como o PDF), os empreiteiros em mais de uma obra (até 10),
 * os responsáveis terceiros e os tipos de apontamento de segurança (os que o geral calcula: até 6 cada).
 *
 * Se o texto completo passar do limite, sai a versão curta (sem os detalhes secundários de cada quadro e com as
 * listas menores); se ainda passar, as últimas obras saem com o aviso de quantas ficaram de fora. Puro. */

export const PORTFOLIO_TEXT_LIMIT = 10_000;
const PARETO_SHOWN = 8;
const COMPANIES_SHOWN = 10;
const SAFETY_TYPES_SHOWN = 8;
const SHORT_LISTS = 5;

/** O que `composePortfolio` entrega além de `PortfolioData` (opcional: o texto também sai só com os dados). */
export interface PortfolioTextExtras {
  shown?: readonly PortfolioModule[];
  withoutCompany?: readonly PortfolioWork[];
  unavailable?: readonly { module: PortfolioModule; message: string }[];
}

const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const int = (value: number) => integer.format(Math.round(value));
const plural = (count: number, one: string, many: string) => `${int(count)} ${count === 1 ? one : many}`;
const label = (module: PortfolioModule) => PORTFOLIO_MODULES.find(m => m.id === module)!.label;
const workName = (work: PortfolioWork) => (work.code ? `${work.name} (${work.code})` : work.name);
const names = (works: readonly PortfolioWork[]) => works.map(workName).join(', ');
/** "+2 no período" / "−1 no período" / "= no período". */
const change = (now: number, before: number) => {
  const diff = now - before;
  return diff ? `${signedDays(diff)} no período` : 'sem variação no período';
};

/** Os quadros mostrados: os informados, ou os que aparecem em alguma linha ou cartão. */
function shownOf(data: PortfolioData & PortfolioTextExtras): PortfolioModule[] {
  if (data.shown) return [...data.shown];
  const seen = new Set<PortfolioModule>(data.kpis.map(kpi => kpi.module).filter((m): m is PortfolioModule => !!m));
  for (const row of data.rows) for (const m of PORTFOLIO_MODULES) if (row.status[m.id].kind !== 'hidden') seen.add(m.id);
  return PORTFOLIO_MODULES.filter(m => seen.has(m.id)).map(m => m.id);
}

// ─── Uma obra ───────────────────────────────────────────────────────────────────────────────────────────

function shortText(row: PortfolioRow, compact: boolean): string {
  const s = row.short!;
  const c = s.current;
  const parts: string[] = [];
  if (c.percent === undefined) parts.push(`PPC do período — (${c.openWeeks > 0 ? 'semana em aberto' : 'sem linha no período'})`);
  else {
    const extra = [`${int(c.fulfilled)} de ${int(c.planned)}`];
    if (s.position !== undefined) extra.push(`${s.position}º`);
    if (Math.round(c.percent) < 70) extra.push('abaixo de 70%');
    parts.push(`PPC do período ${pct(c.percent)} (${extra.join(', ')})`);
  }
  if (s.delta !== undefined)
    parts.push(
      `vs anterior ${signedPoints(s.delta)}${!compact && s.previous?.percent !== undefined ? ` (${s.previous.label}: ${pct(s.previous.percent)})` : ''}`,
    );
  if (s.overall.percent !== undefined) parts.push(`PPC geral ${pct(s.overall.percent)}${s.early ? ' (em início)' : ''}`);
  const failures = s.causes.reduce((total, item) => total + item.total, 0);
  const top = [...s.causes].sort((a, b) => b.total - a.total || a.cause.localeCompare(b.cause, 'pt-BR'))[0];
  parts.push(failures ? `Não com causa ${int(failures)} (principal: ${top.cause}, ${int(top.total)})` : 'nenhum Não com causa');
  return parts.join(', ');
}

function longTermText(row: PortfolioRow, end: string, compact: boolean): string {
  const lt = row.longTerm!;
  const parts: string[] = [];
  if (lt.measured === undefined) parts.push(`sem medição até ${end}; planejado ${pct(lt.planned)}`);
  else
    parts.push(
      `medido × plan. ${pct(lt.measured)} × ${pct(lt.planned)}${lt.delta !== undefined ? ` (desvio ${signedPoints(lt.delta)})` : ''}`,
    );
  if (!compact) {
    if (lt.measuredGain !== undefined || lt.plannedGain)
      parts.push(
        `avanço no período ${lt.measuredGain !== undefined ? `medido ${signedPoints(lt.measuredGain)} × ` : ''}plan. ${signedPoints(lt.plannedGain)}`,
      );
    if (lt.lastMeasurement) parts.push(`medição de ${formatDate(lt.lastMeasurement)}`);
    if (lt.plannedSource === 'plan') parts.push('planejado pelo plano vivo, sem linha de base');
  }
  if (lt.slip !== undefined && lt.slip !== 0)
    parts.push(`prazo ${signedDays(lt.slip)} dias vs linha de base (${lt.slip > 0 ? 'atraso' : 'adiantado'})`);
  return parts.join(', ');
}

function wagonsText(row: PortfolioRow, compact: boolean): string {
  const w = row.wagons!;
  const parts = [plural(w.total, 'vagão', 'vagões'), `takt vencido ${int(w.taktOverdue)}`, `restr. vencidas ${int(w.restrictionsOverdue)}`];
  if (!compact) parts.push(`restr. resolvidas no período ${int(w.restrictionsResolved)}`, `dívidas abertas ${int(w.openDebts)}`);
  return parts.join(', ');
}

function mediumText(row: PortfolioRow, compact: boolean): string {
  const m = row.medium!;
  const head = `${int(m.late)} ${m.late === 1 ? 'atrasada' : 'atrasadas'} (plano de ${monthShort(m.planMonth)})`;
  if (compact) return head;
  return [
    head,
    `${int(m.done)} concluídas, ${int(m.inProgress)} em andamento, ${int(m.notStarted)} não iniciadas`,
    m.finishVariance === undefined ? 'sem linha de base' : `término ${signedDays(m.finishVariance)} d.u. vs linha de base`,
    `${int(m.overloaded)} superaloc.`,
  ].join(', ');
}

function terminalityText(row: PortfolioRow, compact: boolean): string {
  const t = row.terminality!;
  const parts = [`em aberto ${int(t.open)} (${change(t.open, t.openAtStart)})`, `abertas / resolv. ${int(t.opened)} / ${int(t.resolved)}`];
  if (!compact) {
    if (t.averageDaysToResolve !== undefined) parts.push(`tempo médio ${plural(Math.round(t.averageDaysToResolve), 'dia', 'dias')}`);
    parts.push(`${t.percentLabel} resolvidas desde a primeira`);
  }
  return parts.join(', ');
}

function safetyText(row: PortfolioRow, compact: boolean): string {
  const s = row.safety!;
  const parts = [
    `em aberto ${int(s.open)} (${change(s.open, s.openAtStart)})`,
    `feitos / finaliz. ${int(s.opened)} / ${int(s.resolved)}`,
    `> 7 dias ${int(s.openOver7)}`,
  ];
  if (!compact && s.averageDaysToResolve !== undefined)
    parts.push(`tempo médio ${plural(Math.round(s.averageDaysToResolve), 'dia', 'dias')}`);
  return parts.join(', ');
}

function moduleText(row: PortfolioRow, module: PortfolioModule, end: string, compact: boolean): string | undefined {
  const status = row.status[module];
  if (status.kind === 'hidden') return undefined;
  const name = module === 'seguranca' ? 'Segurança' : label(module);
  if (status.kind === 'error') return `${name}: erro (${status.message})`;
  if (status.kind === 'loading') return `${name}: carregando`;
  const body =
    module === 'curto-prazo' && row.short
      ? shortText(row, compact)
      : module === 'longo-prazo' && row.longTerm
        ? longTermText(row, end, compact)
        : module === 'vagoes' && row.wagons
          ? wagonsText(row, compact)
          : module === 'medio-prazo' && row.medium
            ? mediumText(row, compact)
            : module === 'terminalidade' && row.terminality
              ? terminalityText(row, compact)
              : module === 'seguranca' && row.safety
                ? safetyText(row, compact)
                : undefined;
  return `${name}: ${body ?? 'sem dado'}`;
}

function workLine(row: PortfolioRow, shown: readonly PortfolioModule[], end: string, compact: boolean): string {
  const modules = shown.flatMap(module => moduleText(row, module, end, compact) ?? []);
  return `- ${workName(row.work)} · ${row.stateLabel}${modules.length ? ` · ${modules.join(' · ')}` : ''}`;
}

// ─── Tudo junto ─────────────────────────────────────────────────────────────────────────────────────────

function compose(data: PortfolioData & PortfolioTextExtras, compact: boolean, workLimit = data.rows.length): string {
  const { period } = data;
  const shown = shownOf(data);
  const end = dayMonth(period.end);
  const out: string[] = [];

  const range = period.scale === 'personalizado' ? '' : `, de ${formatDate(period.start)} a ${formatDate(period.end)}`;
  out.push(
    `Dashboard geral · ${scaleLabel(period.scale)}: ${period.label} (${plural(period.weeks.length, 'semana', 'semanas')}${range}${
      period.partial ? ', em andamento' : ''
    }). Retratos em ${end}.${period.previous ? ` Período anterior: ${period.previous.label}.` : ''}`,
  );
  out.push(`Quadros: ${shown.length ? shown.map(label).join(', ') : 'nenhum'}.`);
  out.push(`Resumo: ${data.sentence.map(segment => segment.text).join('')}`);
  if (data.kpis.length)
    out.push(
      `Cartões: ${data.kpis
        .map(kpi => `${kpi.label}: ${kpi.value}${kpi.tag ? ` (${kpi.tag.text})` : ''}${kpi.hint ? ` — ${kpi.hint}` : ''}`)
        .join(' | ')}`,
    );
  for (const item of data.unavailable ?? []) out.push(`Indisponível em ${label(item.module)}: ${item.message}`);

  out.push('');
  out.push(
    `Obras no comparativo (${int(data.rows.length)}), uma por linha; "sem dado" = a obra não tem o módulo até o fim do período, "erro" = a leitura falhou:`,
  );
  const rows = data.rows.slice(0, workLimit);
  for (const row of rows) out.push(workLine(row, shown, end, compact));
  if (rows.length < data.rows.length) {
    const left = data.rows.slice(rows.length).map(row => row.work.code || row.work.name);
    out.push(`… e mais ${plural(left.length, 'obra', 'obras')} fora deste texto (${left.join(', ')}); peça menos obras ou menos quadros.`);
  }
  if (data.notStarted.length) out.push(`Só começam depois do período: ${names(data.notStarted)}.`);
  if (data.withoutCompany?.length) out.push(`Sem o empreiteiro escolhido (fora do comparativo): ${names(data.withoutCompany)}.`);

  if (shown.includes('curto-prazo')) {
    const limit = compact ? SHORT_LISTS : PARETO_SHOWN;
    const pareto = data.pareto;
    out.push('');
    if (!pareto.rows.length) out.push('Causas no período, somando as obras: nenhum Não com causa.');
    else {
      out.push(
        `Causas no período, somando as obras (${int(pareto.failures)} Não com causa; ${Math.min(limit, pareto.rows.length)} de ${pareto.rows.length}):`,
      );
      pareto.rows
        .slice(0, limit)
        .forEach((row, index) =>
          out.push(
            `${index + 1}. ${row.cause}: ${int(row.total)} (${pct(row.share)}, acumulado ${pct(row.accumulated)}${row.vital ? ', entre as que somam 80%' : ''}); mais em ${row.top.work.name} (${int(row.top.total)})`,
          ),
        );
    }
    const companies = data.companies.rows;
    if (companies.length) {
      const shownCompanies = companies.slice(0, compact ? SHORT_LISTS : COMPANIES_SHOWN);
      const byId = new Map(data.companies.works.map(work => [work.id, work]));
      out.push(`Empreiteiros em mais de uma obra (${shownCompanies.length} de ${companies.length}; PPC das semanas apuradas do período):`);
      for (const row of shownCompanies) {
        const total = `${row.total.percent !== undefined ? pct(row.total.percent) : '—'} (${int(row.total.fulfilled)} de ${int(row.total.planned)})`;
        const works = Object.entries(row.byWork)
          .map(([id, cell]) => `${byId.get(id)?.code || byId.get(id)?.name || id} ${cell.percent !== undefined ? pct(cell.percent) : '—'}`)
          .join(', ');
        out.push(`- ${row.name}: ${total}${compact ? '' : `; ${works}`}`);
      }
    } else out.push('Empreiteiros em mais de uma obra: nenhum no período.');
  }

  if (shown.includes('terminalidade') && data.responsibles.rows.length) {
    out.push('');
    out.push('Responsáveis terceiros com mais pendências em aberto, somando as obras:');
    for (const row of data.responsibles.rows.slice(0, compact ? SHORT_LISTS : undefined))
      out.push(
        `- ${row.label}: ${int(row.total)}${compact ? '' : ` (${row.byWork.map(cell => `${cell.work.code || cell.work.name} ${int(cell.count)}`).join(', ')})`}`,
      );
  }

  if (shown.includes('seguranca') && data.safetyTypes.rows.length) {
    out.push('');
    out.push('Tipos com mais apontamentos no período, somando as obras:');
    for (const row of data.safetyTypes.rows.slice(0, compact ? SHORT_LISTS : SAFETY_TYPES_SHOWN))
      out.push(
        `- ${row.label}: ${int(row.total)}${compact ? '' : ` (${row.byWork.map(cell => `${cell.work.code || cell.work.name} ${int(cell.count)}`).join(', ')})`}`,
      );
  }
  return out.join('\n');
}

/** O Dashboard geral em texto, no máximo `limit` caracteres (padrão `PORTFOLIO_TEXT_LIMIT`). */
export function portfolioText(data: PortfolioData & PortfolioTextExtras, limit = PORTFOLIO_TEXT_LIMIT): string {
  const full = compose(data, false);
  if (full.length <= limit) return full;
  const compact = compose(data, true);
  if (compact.length <= limit) return compact;
  // Ainda grande: tira obras do fim até caber (busca binária no número de obras).
  let low = 0;
  let high = data.rows.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (compose(data, true, middle).length <= limit) low = middle;
    else high = middle - 1;
  }
  const text = compose(data, true, low);
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}
