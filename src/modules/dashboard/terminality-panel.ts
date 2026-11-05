import type { LocalDate } from '@/domain/entities';
import type { TerminalityData, TerminalityItem } from '@/domain/terminality';
import { addDays } from '@/domain/validation';
import { compareText, textKey } from '@/modules/curto-prazo/sheet-view';
import {
  NONE,
  compareFloors,
  donutSlices,
  floorName,
  indexTerminality,
  percentLabel,
  summarize,
  type DonutSlice,
  type TerminalityIndex,
} from '@/modules/terminalidade/terminality-view';
import {
  dayMonth,
  daysBetween,
  hasCompanyFilter,
  hasFloorFilter,
  lastWeeks,
  matchesCompany,
  matchesFloor,
  plural,
  weekNumberOf,
  type DashboardFilters,
  type DashboardReference,
  type PanelSummary,
} from './model';
import { SCALE_OF, type DashboardScale, type PeriodGrouping } from './period';
import type { TerminalityPeriodView } from './period-views';

/** Quadro da terminalidade na aba 0 (regra 9 do modelo aprovado em 04/11/2026): a lista de pendências da
 * aba 5 lida "na data", o sábado da semana analisada. Entram só as pendências observadas até lá, e cada uma
 * vale pela situação que tinha na data: resolvida depois dela ainda conta como aberta. As contagens
 * reaproveitam `summarize` e `donutSlices` da aba 5, recebendo uma cópia dos itens com o status ajustado à
 * data, para o quadro bater com o topo da lista e com a primeira folha do PDF dela. Tudo puro, sem React.
 *
 * Escalas de tempo (04/11/2026, modelo "Dashboard geral e escalas de tempo", regra 9): os retratos continuam
 * tirados no sábado final do período (`ref.weekEnd`); `period` soma o fluxo dentro dele (observadas e
 * corrigidas entre a segunda-feira inicial e o sábado final, abertas na véspera) e a série por balde de
 * `ref.period.series`. A tela só mostra o período fora da escala semanal; o Dashboard geral usa `period` em
 * toda escala. */

/** Quantas linhas as listas por responsável e por pavimento mostram. */
const TOP = 6;
/** Semanas da evolução, até a analisada. */
const WEEKS = 12;
/** Uma pendência aberta há mais que isto conta como antiga. */
const OLD_DAYS = 30;

export interface TerminalityPanelData {
  /** Pendências observadas até a data (no recorte). */
  total: number;
  /** Abertas na data: observadas até ela e não corrigidas até ela. */
  open: number;
  resolved: number;
  /** Percentual resolvido; ausente sem pendência, para não exibir 0% de nada. */
  percent?: number;
  /** O percentual como a aba 5 exibe ("71%", "—"; nunca 100% com aberta). */
  percentLabel: string;
  /** Média de dias em aberto das abertas, da data de observação à data de referência; ausente sem aberta. */
  averageOpenDays?: number;
  /** Abertas há mais de 30 dias na data. */
  olderThan30: number;
  /** Abertas por responsável terceiro, as 6 maiores; `none` marca "Sem responsável". */
  byContractor: { label: string; count: number; none?: boolean }[];
  /** Quanto somam os responsáveis fora das 6 maiores. */
  contractorRest: number;
  /** Abertas por pavimento, os 6 maiores. */
  byFloor: { label: string; count: number }[];
  /** Quanto somam os pavimentos fora dos 6 maiores. */
  floorRest: number;
  /** Abertas por tipo, até 6 fatias com "Outros". */
  byType: DonutSlice[];
  /** As 12 semanas até a analisada: abertas e resolvidas em cada uma, e o saldo em aberto no fim dela. */
  weeks: { weekStart: LocalDate; label: number; opened: number; resolved: number; balance: number }[];
  /** Algum recorte de empreiteiro ou pavimento ativo (os dois valem em tudo neste quadro). */
  filtered: boolean;
  /** A data de referência: o sábado da semana analisada. */
  refDate: LocalDate;
  /** A escala do período (a tela só mostra o fluxo do período fora da semanal). */
  scale: DashboardScale;
  /** Como a série do período agrupa as semanas (rótulos e legenda da evolução fora da semanal). */
  grouping: PeriodGrouping;
  /** "outubro de 2026", "01/06/2026 a 31/10/2026". */
  periodLabel: string;
  /** "no mês", "no trimestre", "no período". */
  periodIn: string;
  /** O fluxo dentro do período e a série por balde, sempre preenchidos (na escala semanal, a semana). */
  period: TerminalityPeriodView;
}

/** A pendência já estava resolvida na data? Só com data de correção até ela. */
const resolvedBy = (item: TerminalityItem, date: LocalDate) => item.status === 'resolved' && !!item.correctedOn && item.correctedOn <= date;

/** Cópia do item com a situação que ele tinha na data, para `summarize` e `donutSlices` lerem o status
 * sem saber de data. Resolvida depois da data volta a aberta, sem a data de correção (o domínio diz que ela
 * existe se, e só se, a pendência está resolvida). */
function asOf(item: TerminalityItem, date: LocalDate): TerminalityItem {
  if (item.status === 'open' || resolvedBy(item, date)) return item;
  const { correctedOn: _ignored, ...rest } = item;
  return { ...rest, status: 'open' };
}

const inRange = (date: string | undefined, from: LocalDate, to: LocalDate) => !!date && date >= from && date <= to;
/** Corrigida entre as duas datas (a mesma regra das resolvidas por semana da evolução). */
const resolvedIn = (item: TerminalityItem, from: LocalDate, to: LocalDate) =>
  item.status === 'resolved' && inRange(item.correctedOn, from, to);
/** Em aberto ao fim do dia: observada até ele e não corrigida até ele. */
const openAt = (item: TerminalityItem, date: LocalDate) => item.observedOn <= date && !resolvedBy(item, date);
/** "do mês" → "no mês", "da semana" → "na semana". */
const periodInOf = (of: string) => of.replace(/^d/, 'n');

/** As pendências que passam no recorte da aba 0: empreiteiro pelo "Responsável terceiro" (sem empresa só
 * passa sem recorte) e pavimento pelo nome. */
const inScope = (items: TerminalityItem[], index: TerminalityIndex, filters: DashboardFilters) =>
  items.filter(item => matchesCompany(filters, item.contractor) && matchesFloor(filters, floorName(index, item)));

export function buildTerminalityPanel(
  data: TerminalityData,
  ref: DashboardReference,
  filters: DashboardFilters,
): TerminalityPanelData | undefined {
  const date = ref.weekEnd;
  // Sem pendência observada até a data, o módulo não tem dado nesta obra e sai da página. O recorte que
  // esvazia o quadro não o esconde: aí ele mostra zeros e diz que é o recorte.
  if (!data.items.some(item => item.observedOn <= date)) return undefined;
  const index = indexTerminality(data);
  const scope = inScope(data.items, index, filters);
  const until = scope.filter(item => item.observedOn <= date).map(item => asOf(item, date));
  const summary = summarize(until, index);
  const openItems = until.filter(item => item.status === 'open');
  const openDays = openItems.map(item => daysBetween(item.observedOn, date));

  const weeks = lastWeeks(ref.week, WEEKS).map(weekStart => {
    // Segunda a domingo; na semana analisada, só até o sábado de referência, para nada depois dele entrar
    // e o saldo da última semana ser o mesmo das abertas do quadro.
    const weekEnd = weekStart === ref.week ? date : addDays(weekStart, 6);
    return {
      weekStart,
      label: weekNumberOf(ref, weekStart),
      opened: scope.filter(item => inRange(item.observedOn, weekStart, weekEnd)).length,
      resolved: scope.filter(item => resolvedIn(item, weekStart, weekEnd)).length,
      balance: scope.filter(item => openAt(item, weekEnd)).length,
    };
  });

  // Fluxo do período (regra 9): da segunda-feira inicial ao sábado final. A véspera é o domingo antes da
  // segunda inicial, então abertas na véspera + abertas no período − resolvidas no período = em aberto no fim.
  const start = ref.period.start;
  const eve = addDays(start, -1);
  const resolvedInPeriod = scope.filter(item => resolvedIn(item, start, date));
  const resolveDays = resolvedInPeriod.map(item => Math.max(0, daysBetween(item.observedOn, item.correctedOn!)));
  // Baldes da série: cada um vai da sua segunda-feira ao domingo antes do balde seguinte (como as semanas da
  // evolução, para o domingo entre dois baldes não sumir); o último para no sábado final.
  const series = ref.period.series;
  const buckets = series.map((bucket, i) => {
    const next = series[i + 1];
    const limit = next ? addDays(next.start, -1) : bucket.end;
    const to = limit > date ? date : limit;
    return {
      key: bucket.key,
      label: bucket.label,
      short: bucket.short,
      opened: scope.filter(item => inRange(item.observedOn, bucket.start, to)).length,
      resolved: scope.filter(item => resolvedIn(item, bucket.start, to)).length,
      balance: scope.filter(item => openAt(item, to)).length,
    };
  });
  const period: TerminalityPeriodView = {
    start,
    end: date,
    opened: scope.filter(item => inRange(item.observedOn, start, date)).length,
    resolved: resolvedInPeriod.length,
    openAtStart: scope.filter(item => openAt(item, eve)).length,
    // Sem arredondar: o Dashboard geral pondera a média de cada obra pelas resolvidas; a tela arredonda.
    ...(resolveDays.length ? { averageDaysToResolve: resolveDays.reduce((sum, days) => sum + days, 0) / resolveDays.length } : {}),
    openByContractor: summary.openByContractor.map(entry => ({
      label: entry.label,
      count: entry.count,
      ...(entry.key === NONE ? { none: true } : {}),
    })),
    buckets,
  };

  const contractors = summary.openByContractor;
  const floors = summary.openByFloor;
  return {
    total: summary.total,
    open: summary.open,
    resolved: summary.resolved,
    ...(summary.percent === undefined ? {} : { percent: summary.percent }),
    percentLabel: percentLabel(summary),
    ...(openDays.length ? { averageOpenDays: Math.round(openDays.reduce((sum, days) => sum + days, 0) / openDays.length) } : {}),
    olderThan30: openDays.filter(days => days > OLD_DAYS).length,
    byContractor: contractors
      .slice(0, TOP)
      .map(entry => ({ label: entry.label, count: entry.count, ...(entry.key === NONE ? { none: true } : {}) })),
    contractorRest: contractors.slice(TOP).reduce((sum, entry) => sum + entry.count, 0),
    byFloor: floors.slice(0, TOP).map(entry => ({ label: entry.label, count: entry.count })),
    floorRest: floors.slice(TOP).reduce((sum, entry) => sum + entry.count, 0),
    byType: donutSlices(openItems, index, 'tipo'),
    weeks,
    filtered: hasCompanyFilter(filters) || hasFloorFilter(filters),
    refDate: date,
    scale: ref.period.scale,
    grouping: ref.period.grouping,
    periodLabel: ref.period.label,
    periodIn: periodInOf(ref.period.of),
    period,
  };
}

/** "no mês: 32 abertas e 41 resolvidas" (o fluxo do período, para a dica, a tela e o papel). */
export const periodFlowText = (data: Pick<TerminalityPanelData, 'periodIn' | 'period'>) =>
  `${data.periodIn}: ${data.period.opened} ${data.period.opened === 1 ? 'aberta' : 'abertas'} e ${data.period.resolved} ${
    data.period.resolved === 1 ? 'resolvida' : 'resolvidas'
  }`;
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** O cartão "Pendências abertas" do resumo e a parte da terminalidade na frase do topo. Na escala semanal, a
 * frase compara as abertas de hoje com o saldo no fim da primeira das 12 semanas; nas demais, conta o fluxo
 * do período (abertas e resolvidas nele) e compara as em aberto no sábado final com as da véspera. */
export function terminalitySummary(data: TerminalityPanelData, _ref: DashboardReference): PanelSummary {
  const { open, resolved, total, olderThan30 } = data;
  const weekly = data.scale === 'semana';
  const flow = data.period;
  const hint = weekly
    ? [
        total ? `${resolved} ${resolved === 1 ? 'resolvida' : 'resolvidas'} de ${total}` : 'Nenhuma pendência registrada até a data',
        open > 0 &&
          (olderThan30 > 0
            ? `${olderThan30} ${olderThan30 === 1 ? 'aberta' : 'abertas'} há mais de 30 dias`
            : 'nenhuma há mais de 30 dias'),
      ]
        .filter(Boolean)
        .join(' · ')
    : `${capitalize(periodFlowText(data))}; ${open} em aberto em ${dayMonth(data.refDate)}`;
  const tag =
    open === 0
      ? { text: total ? '100% resolvido' : 'Sem pendência', tone: 'good' as const }
      : { text: `${data.percentLabel} resolvido`, tone: 'neutral' as const };

  const sentence: PanelSummary['sentence'] = [];
  if (!weekly && open === 0 && !flow.opened && !flow.resolved && !flow.openAtStart)
    sentence.push({ text: `A terminalidade não teve pendência ${data.periodIn} e não tem pendência aberta.` });
  else if (!weekly) {
    // "No mês, a terminalidade teve 32 pendências abertas e 41 resolvidas; 408 em aberto em 31/10, 9 a menos
    // que no início do mês."
    const delta = open - flow.openAtStart;
    const since = `no início ${SCALE_OF[data.scale]}`;
    sentence.push(
      { text: `${capitalize(data.periodIn)}, a terminalidade teve ` },
      { text: plural(flow.opened, 'pendência aberta', 'pendências abertas'), strong: true },
      { text: ' e ' },
      { text: plural(flow.resolved, 'resolvida', 'resolvidas'), strong: true },
      { text: '; ' },
      open === 0 ? { text: 'nenhuma em aberto' } : { text: `${open} em aberto`, strong: true },
      {
        text: ` em ${dayMonth(data.refDate)}${
          delta === 0 ? `, o mesmo número que ${since}` : `, ${Math.abs(delta)} a ${delta > 0 ? 'mais' : 'menos'} que ${since}`
        }.`,
      },
    );
  } else if (open === 0) sentence.push({ text: 'A terminalidade não tem pendência aberta.' });
  else {
    const before = data.weeks[0]?.balance;
    const delta = before === undefined ? 0 : open - before;
    sentence.push({ text: 'A terminalidade tem ' }, { text: plural(open, 'pendência aberta', 'pendências abertas'), strong: true });
    if (before !== undefined)
      sentence.push({
        text:
          delta === 0
            ? `, o mesmo número que há ${WEEKS} semanas.`
            : `, ${Math.abs(delta)} a ${delta > 0 ? 'mais' : 'menos'} que há ${WEEKS} semanas.`,
      });
    else sentence.push({ text: '.' });
  }
  return {
    kpi: {
      module: 'terminalidade',
      label: 'Pendências abertas',
      value: String(open),
      tag,
      hint,
      ...(open === 0 ? { tone: 'good' as const } : {}),
    },
    sentence,
  };
}

/** Opções do seletor de empreiteiro: os responsáveis terceiros distintos (sem acento nem caixa), com a
 * primeira grafia vista e quantas pendências têm, em ordem alfabética. */
export function terminalityCompanies(data: TerminalityData): { value: string; count: number }[] {
  const seen = new Map<string, { value: string; count: number }>();
  for (const item of data.items) {
    const value = (item.contractor ?? '').trim();
    const key = textKey(value);
    if (!key) continue;
    const entry = seen.get(key) ?? { value, count: 0 };
    entry.count++;
    seen.set(key, entry);
  }
  return [...seen.values()].sort((a, b) => compareText(a.value, b.value));
}

/** Opções do seletor de pavimento: os nomes na ordem cadastrada (de baixo para cima), sem repetir nome. */
export function terminalityFloorNames(data: TerminalityData): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const floor of [...data.floors].sort(compareFloors)) {
    const key = textKey(floor.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    names.push(floor.name.trim());
  }
  return names;
}
