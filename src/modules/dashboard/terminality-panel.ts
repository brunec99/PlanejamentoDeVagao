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

/** Quadro da terminalidade na aba 0 (regra 9 do modelo aprovado em 04/11/2026): a lista de pendências da
 * aba 5 lida "na data", o sábado da semana analisada. Entram só as pendências observadas até lá, e cada uma
 * vale pela situação que tinha na data: resolvida depois dela ainda conta como aberta. As contagens
 * reaproveitam `summarize` e `donutSlices` da aba 5, recebendo uma cópia dos itens com o status ajustado à
 * data, para o quadro bater com o topo da lista e com a primeira folha do PDF dela. Tudo puro, sem React. */

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
      resolved: scope.filter(item => item.status === 'resolved' && inRange(item.correctedOn, weekStart, weekEnd)).length,
      balance: scope.filter(item => item.observedOn <= weekEnd && !resolvedBy(item, weekEnd)).length,
    };
  });

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
  };
}

/** O cartão "Pendências abertas" do resumo e a parte da terminalidade na frase do topo. A frase compara as
 * abertas de hoje com o saldo no fim da primeira das 12 semanas. */
export function terminalitySummary(data: TerminalityPanelData, _ref: DashboardReference): PanelSummary {
  const { open, resolved, total, olderThan30 } = data;
  const hint = [
    total ? `${resolved} ${resolved === 1 ? 'resolvida' : 'resolvidas'} de ${total}` : 'Nenhuma pendência registrada até a data',
    open > 0 &&
      (olderThan30 > 0 ? `${olderThan30} ${olderThan30 === 1 ? 'aberta' : 'abertas'} há mais de 30 dias` : 'nenhuma há mais de 30 dias'),
  ]
    .filter(Boolean)
    .join(' · ');
  const tag =
    open === 0
      ? { text: total ? '100% resolvido' : 'Sem pendência', tone: 'good' as const }
      : { text: `${data.percentLabel} resolvido`, tone: 'neutral' as const };

  const sentence: PanelSummary['sentence'] = [];
  if (open === 0) sentence.push({ text: 'A terminalidade não tem pendência aberta.' });
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
