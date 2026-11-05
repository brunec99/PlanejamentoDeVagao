import {
  addDays,
  daysBetween,
  floorLabel,
  floorSchedule,
  latestPercents,
  physicalProgress,
  planSpan,
  type FloorSlot,
  type LocalDate,
  type LongTermActivity,
  type LongTermBaseline,
  type LongTermMeasurement,
  type LongTermPlanDocument,
} from '@/domain/long-term-plan';
import {
  dayMonth,
  floorKey,
  monthEnd,
  monthsBetween,
  pct,
  signedPoints,
  type DashboardFilters,
  type DashboardReference,
  type PanelSummary,
  type Segment,
  type Tone,
} from '@/modules/dashboard/model';
import type { DashboardScale } from '@/modules/dashboard/period';
import type { LongTermPeriodView } from '@/modules/dashboard/period-views';

/** Quadro do longo prazo (aba 1) na aba 0 (04/11/2026, regra 6 do modelo aprovado): o avanço físico medido
 * contra o planejado na data de referência, a curva S, os serviços com maior desvio e o prazo do plano.
 * Tudo puro, a partir do documento do plano. A data de referência é o sábado da semana analisada
 * (`ref.weekEnd`): medição datada depois dela não existe para este quadro.
 *
 * O planejado é a mesma ponderação por pavimento-dias de `physicalProgress`, com cada pavimento avançando
 * em reta entre o início e o primeiro dia livre (`FloorSlot.start`/`end`), a mesma convenção de `plannedAt`
 * em `domain/rules`. Ele sai da linha de base mais recente quando houver (comparar o medido com um plano
 * reprogramado é comparar a obra com a desculpa dela) e, sem linha de base, do próprio plano vivo.
 *
 * Escalas de tempo (04/11/2026, modelo "Dashboard geral e escalas de tempo", regra 9): o acumulado continua
 * tirado no sábado final do período; `period` diz quanto o medido e o planejado andaram dentro dele (fim −
 * véspera da segunda-feira inicial). A tela só mostra o período fora da escala semanal; o Dashboard geral usa
 * `period` em toda escala. */

/** Meses da curva S, no máximo: um plano de mais de cinco anos é cortado, não amostrado. */
export const CURVE_MONTHS = 60;
/** Linhas da tabela "Serviços com maior desvio na data". */
export const DEVIATION_ROWS = 5;

export interface LongTermDeviation {
  id: string;
  name: string;
  planned: number;
  measured: number;
  /** Medido − planejado, em pontos percentuais, sobre os valores já arredondados. */
  delta: number;
}
export interface LongTermPanelData {
  /** O sábado final do período e o rótulo que o gráfico põe na data ("semana N" na escala semanal; "31/10"
   * nas demais, porque a faixa do período já diz qual é o período). */
  refDate: LocalDate;
  refLabel: string;
  /** A escala do período (a tela só mostra o avanço do período fora da semanal). */
  scale: DashboardScale;
  /** "outubro de 2026", "01/06/2026 a 31/10/2026". */
  periodLabel: string;
  /** "no mês", "no trimestre", "no período". */
  periodIn: string;
  /** O avanço feito dentro do período, sempre preenchido (na escala semanal, a semana). */
  period: LongTermPeriodView;
  /** Avanço físico medido até a data; ausente sem medição até ela. */
  measured?: number;
  /** Avanço planejado na data, pela linha de base mais recente ou pelo plano vivo. */
  planned: number;
  /** Medido − planejado em p.p., sobre os valores arredondados (só quando há medição). */
  delta?: number;
  plannedSource: 'baseline' | 'plan';
  baselineName?: string;
  baselineDate?: LocalDate;
  /** Planejado acumulado no último dia de cada mês do plano. */
  curve: { date: LocalDate; planned: number }[];
  /** Uma por data de medição até a referência: o avanço físico até aquela data. */
  measurements: { date: LocalDate; percent: number }[];
  /** Até cinco serviços mensuráveis, do maior |desvio| para o menor; vazio sem medição. */
  deviations: LongTermDeviation[];
  /** Prazo do plano vivo inteiro; `slip` em dias contra a linha de base mais recente (positivo = atraso). */
  span?: { start: LocalDate; finish: LocalDate; months: number; days: number; slip?: number };
  /** Serviços visíveis (dentro do recorte de pavimentos, quando houver). */
  services: number;
  floors: number;
  measurementCount: number;
  lastMeasurement?: LocalDate;
  floorFiltered: boolean;
  /** Nomes dos pavimentos escolhidos que existem neste plano; vazio sem recorte. */
  selectedFloors: string[];
}

// ─── Planejado na data ───────────────────────────────────────────────────────────────────────────

/** Fração do pavimento pronta na data: 0 antes do início (e no dia do início), 1 a partir do primeiro
 * dia livre, reta no meio. */
const slotShare = (slot: FloorSlot, date: LocalDate) => {
  if (date < slot.start) return 0;
  if (date >= slot.end) return 1;
  return daysBetween(slot.start, date) / slot.duration;
};
/** Planejado (0–100) de um conjunto de pavimentos na data, pesando cada um pela duração. Indefinido sem
 * pavimento (peso zero). */
export function plannedShare(slots: readonly FloorSlot[], date: LocalDate): number | undefined {
  let weight = 0,
    done = 0;
  for (const slot of slots) {
    weight += slot.duration;
    done += slot.duration * slotShare(slot, date);
  }
  return weight ? (done / weight) * 100 : undefined;
}

/** A linha de base mais recente pela data de criação, independente da ordem na lista. */
export function latestBaseline(baselines: readonly LongTermBaseline[]): LongTermBaseline | undefined {
  let best: LongTermBaseline | undefined;
  for (const baseline of baselines) {
    if (!best || Date.parse(baseline.createdAt) > Date.parse(best.createdAt)) best = baseline;
  }
  return best;
}
/** "AAAA-MM-DD" no fuso de Brasília a partir do carimbo ISO, para mostrar a data da linha de base. */
const localDateOf = (iso: string): LocalDate | undefined => {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return undefined;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
};

// ─── Pavimentos ──────────────────────────────────────────────────────────────────────────────────

/** Os nomes dos pavimentos do plano, na ordem (1..floorCount), para o seletor da tela. */
export const longTermFloorNames = (document: Pick<LongTermPlanDocument, 'floorCount' | 'floorNames'>): string[] =>
  Array.from({ length: document.floorCount }, (_, i) => floorLabel(document, i + 1));

/** Números dos pavimentos escolhidos no recorte; indefinido sem recorte. O pareamento é pelo nome
 * normalizado (`floorKey`), o mesmo que a terminalidade usa. */
function chosenFloors(document: LongTermPlanDocument, filters: Pick<DashboardFilters, 'floors'>): Set<number> | undefined {
  if (!filters.floors) return undefined;
  const chosen = new Set<number>();
  for (let floor = 1; floor <= document.floorCount; floor++) {
    if (filters.floors.has(floorKey(floorLabel(document, floor)))) chosen.add(floor);
  }
  return chosen;
}
const touches = (activity: Pick<LongTermActivity, 'firstFloor' | 'lastFloor'>, floors: Set<number>) => {
  for (const floor of floors) if (floor >= activity.firstFloor && floor <= activity.lastFloor) return true;
  return false;
};

// ─── Quadro ──────────────────────────────────────────────────────────────────────────────────────

const byDateThenNumber = (a: LongTermMeasurement, b: LongTermMeasurement) => a.date.localeCompare(b.date) || a.number - b.number;
const round = Math.round;
/** "do mês" → "no mês", "da semana" → "na semana". */
const periodInOf = (of: string) => of.replace(/^d/, 'n');

export function buildLongTermPanel(
  document: LongTermPlanDocument,
  ref: DashboardReference,
  filters: DashboardFilters,
): LongTermPanelData | undefined {
  const visible = document.activities.filter(a => a.visible);
  if (!visible.length) return undefined;
  const until = ref.weekEnd;

  // Recorte de pavimentos: só os serviços que tocam algum pavimento escolhido, e só os pavimentos escolhidos
  // deles no planejado. A medição é por serviço e não se divide: fica a do serviço inteiro.
  const chosen = chosenFloors(document, filters);
  const activities = chosen ? visible.filter(a => touches(a, chosen)) : visible;
  const slotsOf = (activity: LongTermActivity) =>
    chosen ? floorSchedule(activity).filter(s => chosen.has(s.floor)) : floorSchedule(activity);

  // Nada depois da data conta: a medição posterior sai antes de qualquer cálculo, e sem medição até a data
  // o medido fica indefinido (physicalProgress devolveria 0% se visse as medições futuras na lista).
  const measurements = document.measurements.filter(m => m.date <= until).sort(byDateThenNumber);
  const measured = physicalProgress(activities, measurements, until);
  const measurable = activities.filter(a => a.unit);

  // Planejado: as datas da linha de base mais recente, serviço a serviço pelo id. Serviço criado depois da
  // linha de base não existe nela e entra com as datas do plano vivo, para o conjunto ser o mesmo do medido.
  const baseline = latestBaseline(document.baselines);
  const frozen = new Map((baseline?.activities ?? []).map(a => [a.id, a]));
  const scheduleOf = (activity: LongTermActivity) => slotsOf(frozen.get(activity.id) ?? activity);
  const plannedSet = measured !== undefined ? measurable : activities;
  const plannedSlots = plannedSet.flatMap(scheduleOf);
  const planned = plannedShare(plannedSlots, until) ?? 0;

  // Curva S: o planejado no último dia de cada mês do plano (do conjunto planejado).
  const curve: LongTermPanelData['curve'] = [];
  if (plannedSlots.length) {
    const start = plannedSlots.reduce((acc, s) => (s.start < acc ? s.start : acc), plannedSlots[0].start);
    const end = plannedSlots.reduce((acc, s) => (s.end > acc ? s.end : acc), plannedSlots[0].end);
    // O último mês é o do último dia de trabalho (`end` é exclusivo).
    for (const month of monthsBetween(start, addDays(end, -1)).slice(0, CURVE_MONTHS)) {
      const date = monthEnd(month);
      curve.push({ date, planned: plannedShare(plannedSlots, date) ?? 0 });
    }
  }

  // Uma bolinha por data de medição: o avanço físico até aquela data (duas rodadas no mesmo dia viram uma).
  const points: LongTermPanelData['measurements'] = [];
  if (measured !== undefined) {
    for (const date of [...new Set(measurements.map(m => m.date))]) {
      const percent = physicalProgress(activities, measurements, date);
      if (percent !== undefined) points.push({ date, percent });
    }
  }

  // Serviços com maior desvio: planejado × medido por serviço mensurável, sobre valores arredondados para a
  // tabela nunca contradizer os cartões. Serviço com unidade e sem medição entra com 0%, como no avanço físico.
  let deviations: LongTermDeviation[] = [];
  if (measured !== undefined) {
    const percents = latestPercents(activities, measurements, until);
    deviations = measurable
      .map(activity => {
        const plannedPercent = plannedShare(scheduleOf(activity), until) ?? 0;
        const measuredPercent = percents[activity.id] ?? 0;
        return {
          id: activity.id,
          name: activity.name,
          planned: plannedPercent,
          measured: measuredPercent,
          delta: round(measuredPercent) - round(plannedPercent),
        };
      })
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.delta - b.delta || a.name.localeCompare(b.name, 'pt-BR'))
      .slice(0, DEVIATION_ROWS);
  }

  // Prazo do plano vivo inteiro (o recorte de pavimentos não muda o fim da obra), e o atraso contra a linha
  // de base pelo último dia de trabalho, como o cartão do planejador.
  const span = planSpan(document.activities);
  const baseSpan = baseline ? planSpan(baseline.activities) : undefined;
  const slip = span && baseSpan ? daysBetween(baseSpan.finish, span.finish) : undefined;

  // Avanço no período (regra 9): o medido e o planejado na véspera da segunda-feira inicial, pelas mesmas
  // funções, os mesmos serviços, o mesmo recorte de pavimentos e a mesma fonte do planejado do fim. Os ganhos
  // saem dos valores arredondados, como o desvio, para nunca contradizer os números da tela.
  const periodStart = ref.period.start;
  const eve = addDays(periodStart, -1);
  const before = measurements.filter(m => m.date < periodStart);
  const measuredAtStart = before.length ? physicalProgress(activities, before, eve) : undefined;
  const plannedAtStart = plannedShare(plannedSlots, eve) ?? 0;
  const period: LongTermPeriodView = {
    start: periodStart,
    end: until,
    ...(measuredAtStart !== undefined ? { measuredAtStart } : {}),
    plannedAtStart,
    ...(measured !== undefined ? { measuredGain: round(measured) - (measuredAtStart === undefined ? 0 : round(measuredAtStart)) } : {}),
    plannedGain: round(planned) - round(plannedAtStart),
  };
  const weekly = ref.period.scale === 'semana';

  const baselineDate = baseline ? localDateOf(baseline.createdAt) : undefined;
  return {
    refDate: until,
    refLabel: weekly ? `semana ${ref.weekNumber}` : dayMonth(until),
    scale: ref.period.scale,
    periodLabel: ref.period.label,
    periodIn: periodInOf(ref.period.of),
    period,
    ...(measured !== undefined ? { measured, delta: round(measured) - round(planned) } : {}),
    planned,
    plannedSource: baseline ? 'baseline' : 'plan',
    ...(baseline ? { baselineName: baseline.name } : {}),
    ...(baselineDate ? { baselineDate } : {}),
    curve,
    measurements: points,
    deviations,
    ...(span
      ? { span: { start: span.start, finish: span.finish, months: span.months, days: span.days, ...(slip !== undefined ? { slip } : {}) } }
      : {}),
    services: activities.length,
    floors: document.floorCount,
    measurementCount: measurements.length,
    ...(measurements.length ? { lastMeasurement: measurements[measurements.length - 1].date } : {}),
    floorFiltered: !!chosen,
    selectedFloors: chosen ? [...chosen].sort((a, b) => a - b).map(floor => floorLabel(document, floor)) : [],
  };
}

// ─── Resumo ──────────────────────────────────────────────────────────────────────────────────────

/** Tom do desvio: em dia ou adiantado é bom; até 10 pontos atrás pede atenção; mais que isso é crítico. */
export const deviationTone = (delta: number): Tone => (delta >= 0 ? 'good' : delta >= -10 ? 'warn' : 'bad');

type PlannedSource = Pick<LongTermPanelData, 'plannedSource' | 'baselineName' | 'baselineDate'>;
/** "linha de base "LB-2" (01/03)" ou "plano atual (sem linha de base)": de onde veio o planejado. */
export function plannedSourceText(data: PlannedSource): string {
  if (data.plannedSource === 'plan') return 'plano atual (sem linha de base)';
  const name = data.baselineName ? ` "${data.baselineName}"` : '';
  const date = data.baselineDate ? ` (${dayMonth(data.baselineDate)})` : '';
  return `linha de base${name}${date}`;
}
/** A mesma fonte com a preposição: "pela linha de base …" / "pelo plano atual …". */
export const plannedByText = (data: PlannedSource) => `${data.plannedSource === 'plan' ? 'pelo' : 'pela'} ${plannedSourceText(data)}`;

const pointsText = (n: number) => `${n} ${n === 1 ? 'ponto' : 'pontos'}`;
/** A primeira letra em maiúscula, para começar frase com "No mês". */
export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** "no mês: +3 p.p. × planejado +4 p.p." (sem medição até o fim: "no mês: planejado +4 p.p."). */
export function periodGainText(data: Pick<LongTermPanelData, 'period' | 'periodIn'>): string {
  const { measuredGain, plannedGain } = data.period;
  return measuredGain === undefined
    ? `${data.periodIn}: planejado ${signedPoints(plannedGain)}`
    : `${data.periodIn}: ${signedPoints(measuredGain)} × planejado ${signedPoints(plannedGain)}`;
}
/** "avançou 3 pontos", "não avançou", "recuou 1 ponto" (uma medição corrigida para baixo). */
const movedText = (gain: number) => (gain > 0 ? `avançou ${pointsText(gain)}` : gain < 0 ? `recuou ${pointsText(-gain)}` : 'não avançou');
const plannedCount = (gain: number) => (gain === 0 ? 'nenhum planejado' : `${gain} ${gain === 1 ? 'planejado' : 'planejados'}`);

export function longTermSummary(data: LongTermPanelData, ref: DashboardReference): PanelSummary {
  const origin = 'longo-prazo' as const;
  const label = 'Avanço físico';
  // Fora da escala semanal, o cartão continua sendo o acumulado no sábado final, e a dica e a frase dizem
  // quanto ele andou dentro do período.
  const weekly = data.scale === 'semana';
  if (!data.services) {
    return {
      kpi: {
        module: origin,
        label,
        value: '—',
        tag: { text: 'sem serviço', tone: 'neutral' },
        hint: 'Nenhum serviço passa pelos pavimentos escolhidos',
      },
      sentence: [{ text: 'Nenhum serviço do longo prazo passa pelos pavimentos escolhidos.' }],
    };
  }
  if (data.measured === undefined) {
    const plannedGain = data.period.plannedGain;
    return {
      kpi: {
        module: origin,
        label,
        value: pct(data.planned),
        tag: { text: 'sem medição', tone: 'neutral' },
        hint: `Planejado na data ${plannedByText(data)}; nenhuma medição até ${dayMonth(ref.weekEnd)}${weekly ? '' : ` · ${periodGainText(data)}`}`,
      },
      sentence: [
        { text: 'O longo prazo ainda não tem medição até a data; o avanço planejado para a data é de ' },
        { text: pct(data.planned), strong: true },
        { text: weekly ? '.' : `; ${data.periodIn}, o planejado ${movedText(plannedGain)}.` },
      ],
    };
  }
  const delta = data.delta ?? round(data.measured) - round(data.planned);
  const tone = deviationTone(delta);
  const versus =
    delta === 0
      ? ', igual ao planejado para a data'
      : `, ${pointsText(Math.abs(delta))} ${delta > 0 ? 'acima' : 'abaixo'} do planejado para a data`;
  const gain = data.period.measuredGain ?? 0;
  const sentence: Segment[] = weekly
    ? [{ text: 'O avanço físico medido é de ' }, { text: pct(data.measured), strong: true }, { text: `${versus}.` }]
    : [
        { text: `Em ${dayMonth(data.refDate)}, o avanço físico medido é de ` },
        { text: pct(data.measured), strong: true },
        { text: `${versus}; ${data.periodIn}, ${movedText(gain)} contra ${plannedCount(data.period.plannedGain)}.` },
      ];
  return {
    kpi: {
      module: origin,
      label,
      value: pct(data.measured),
      tag: { text: `${signedPoints(delta)} vs planejado`, tone },
      hint: `Medido em ${dayMonth(data.lastMeasurement ?? ref.weekEnd)} · planejado na data: ${pct(data.planned)}${weekly ? '' : ` · ${periodGainText(data)}`}`,
      ...(tone === 'good' ? {} : { tone }),
    },
    sentence,
  };
}
