import type { LocalDate, WeeklyCommitment } from './entities';
import { causePareto } from './rules';
import { addDays, startOfWeek } from './validation';
import type { ExtrasCell, WorkdayCoverage, WorkExtras } from '../modules/dashboard/extras/types';

/** Resumo semanal por e-mail (12/11/2026, regras 12 a 20 do modelo aprovado "Dashboards completos e resumo
 * semanal"). Todo sábado, 08:00 de Brasília, os admins com a chave ligada recebem o placar da semana que acabou
 * (segunda a sexta): quais obras cumpriram o planejamento (curto prazo) e os processos de histograma e de
 * produtividade. Este arquivo é a parte pura: as regras de "cumprir", o placar, os pontos de atenção, a frase,
 * o assunto, o payload do modelo `obra360.resumo_semanal` e a decisão de horário. Sem IA (regra 17): o texto sai
 * dos números. Quem lê os dados e enfileira é `infrastructure/email/weekly-summary.ts`. */

export const WEEKLY_SUMMARY_KIND = 'obra360.resumo_semanal';
/** Faixas da regra 13, as mesmas cores do Dashboard geral: verde a partir de 80%, âmbar de 70% a 79%. */
export const PLAN_OK_PERCENT = 80;
export const PLAN_PARTIAL_PERCENT = 70;

/** Situação de uma obra num dos três itens. As letras vão no payload e o modelo do e-mail (Takt Hub) as traduz:
 * c = Cumpriu · p = Parcial · n = Não cumpriu · a = Não apurou · s = Sem programação · z = Não lançou ·
 * u = Não usa (fora do placar) · i = Indisponível (fora do placar). */
export type WeeklyVerdict = 'c' | 'p' | 'n' | 'a' | 's' | 'z' | 'u' | 'i';
export const WEEKLY_VERDICT_LABEL: Record<WeeklyVerdict, string> = {
  c: 'Cumpriu',
  p: 'Parcial',
  n: 'Não cumpriu',
  a: 'Não apurou',
  s: 'Sem programação',
  z: 'Não lançou',
  u: 'Não usa',
  i: 'Indisponível',
};
/** Fora do placar do módulo (regra 15): a obra nunca lançou nele, ou a leitura falhou. */
const outOfScore = (verdict: WeeklyVerdict) => verdict === 'u' || verdict === 'i';

export interface WeeklyCell {
  verdict: WeeklyVerdict;
  /** A linha pequena sob o selo: "PPC 86% · 25 de 29", "3 de 5 dias · faltou qua e sex". */
  detail: string;
}
export interface WeeklyLine {
  fulfilled?: boolean;
  cause?: string;
}
export interface WeeklyWorkInput {
  work: { id: string; name: string; code: string };
  /** As linhas do curto prazo da obra na semana (só Status e causa). */
  lines: readonly WeeklyLine[];
  /** Os blocos da semana (`readDashboardExtras`, acesso total, com segurança); ausente = leitura falhou. */
  extras?: WorkExtras;
}
export interface WeeklyRow {
  work: { id: string; name: string; code: string };
  planning: WeeklyCell;
  headcount: WeeklyCell;
  production: WeeklyCell;
  /** Cumpriu o planejamento e todo processo que a obra usa. */
  all: boolean;
  /** Quantos dos três itens a obra cumpriu (ordena a tabela). */
  fulfilled: number;
  /** PPC arredondado da semana; ausente sem apuração. */
  percent?: number;
  planned: number;
  yes: number;
}
export type WeeklyScore = { ok: number; of: number };
export interface WeeklySummary {
  /** Segunda-feira da semana resumida e a sexta dela. */
  week: LocalDate;
  friday: LocalDate;
  rows: WeeklyRow[];
  score: { planning: WeeklyScore; headcount: WeeklyScore; production: WeeklyScore; all: WeeklyScore };
  /** PPC somando as linhas das obras apuradas (Σ/Σ); ausente se nenhuma apurou. */
  percent?: number;
  sentence: string;
  attention: string[];
  subject: string;
}

const dayMonth = (date: LocalDate) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const weekdayShort = (date: LocalDate) => WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
/** "qua", "qua e sex", "qua, qui e sex". */
export function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Regras 12 e 13. Linha sem Status deixa a semana "em aberto": a obra não apurou. */
export function planningCell(lines: readonly WeeklyLine[]): WeeklyCell & { percent?: number; planned: number; yes: number } {
  const planned = lines.length;
  const yes = lines.filter(line => line.fulfilled === true).length;
  if (!planned) return { verdict: 's', detail: 'nenhuma linha na semana', planned, yes };
  const open = lines.filter(line => line.fulfilled === undefined).length;
  if (open) return { verdict: 'a', detail: `${open} de ${plural(planned, 'linha', 'linhas')} sem status`, planned, yes };
  const percent = Math.round((yes / planned) * 100);
  const verdict: WeeklyVerdict = percent >= PLAN_OK_PERCENT ? 'c' : percent >= PLAN_PARTIAL_PERCENT ? 'p' : 'n';
  return { verdict, detail: `PPC ${percent}% · ${yes} de ${planned}`, percent, planned, yes };
}

/** Regra 14: cumprir é lançar em todos os dias úteis esperados; o e-mail diz quais faltaram. `extra` é a
 * informação que não reprova (efetivo médio, parcela medida). */
export function coverageCell(cell: ExtrasCell<{ coverage: WorkdayCoverage }> | undefined, extra?: string): WeeklyCell {
  if (!cell || cell.kind === 'unavailable' || cell.kind === 'error') return { verdict: 'i', detail: 'não foi possível ler' };
  if (cell.kind === 'absent') return { verdict: 'u', detail: 'a obra não lança neste módulo' };
  const { expected, launched, missing, missingCount } = cell.data.coverage;
  if (!expected) return { verdict: 'c', detail: 'semana sem dia útil' };
  const days = `${launched} de ${plural(expected, 'dia', 'dias')}`;
  if (!launched) return { verdict: 'z', detail: days };
  if (!missingCount) return { verdict: 'c', detail: extra ? `${days} · ${extra}` : days };
  return { verdict: 'n', detail: `${days} · faltou ${joinList(missing.map(weekdayShort))}` };
}

const ready = <T>(cell: ExtrasCell<T> | undefined): T | undefined => (cell?.kind === 'ready' ? cell.data : undefined);

function scoreOf(rows: readonly WeeklyRow[], pick: (row: WeeklyRow) => WeeklyCell): WeeklyScore {
  const counted = rows.filter(row => !outOfScore(pick(row).verdict));
  return { ok: counted.filter(row => pick(row).verdict === 'c').length, of: counted.length };
}

/** "N de M, X na Obra": a soma de um indicador nas obras e a obra que mais pesa. */
function worstOf(rows: { name: string; count: number }[]): { total: number; tail: string } | undefined {
  const withSome = rows.filter(row => row.count > 0).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'));
  if (!withSome.length) return undefined;
  const total = withSome.reduce((sum, row) => sum + row.count, 0);
  const top = withSome[0];
  const tail = withSome.length === 1 ? (total === 1 ? `na ${top.name}` : `todos na ${top.name}`) : `${top.count} na ${top.name}`;
  return { total, tail };
}

/** O resumo da semana `week` (qualquer dia dela). Puro: as linhas e os blocos vêm de fora. */
export function buildWeeklySummary(input: { week: LocalDate; works: readonly WeeklyWorkInput[] }): WeeklySummary {
  const week = startOfWeek(input.week);
  const friday = addDays(week, 4);
  const rows: WeeklyRow[] = input.works.map(({ work, lines, extras }) => {
    const planning = planningCell(lines);
    const headcountData = ready(extras?.headcount);
    const productionData = ready(extras?.production);
    const headcount = coverageCell(
      extras?.headcount,
      headcountData && headcountData.dailyAverage > 0 ? `efetivo ${Math.round(headcountData.dailyAverage)}` : undefined,
    );
    const production = coverageCell(
      extras?.production,
      productionData?.measuredShare !== undefined ? `${Math.round(productionData.measuredShare * 100)}% medido` : undefined,
    );
    const cells = [planning, headcount, production];
    return {
      work,
      planning: { verdict: planning.verdict, detail: planning.detail },
      headcount,
      production,
      all: planning.verdict === 'c' && [headcount, production].every(cell => cell.verdict === 'c' || outOfScore(cell.verdict)),
      fulfilled: cells.filter(cell => cell.verdict === 'c').length,
      ...(planning.percent !== undefined ? { percent: planning.percent } : {}),
      planned: planning.planned,
      yes: planning.yes,
    };
  });
  // Regra 16: quem cumpriu tudo primeiro, depois por número de cumprimentos, depois pelo nome.
  rows.sort(
    (a, b) =>
      Number(b.all) - Number(a.all) || b.fulfilled - a.fulfilled || a.work.name.localeCompare(b.work.name, 'pt-BR', { numeric: true }),
  );

  const score = {
    planning: { ok: rows.filter(row => row.planning.verdict === 'c').length, of: rows.length },
    headcount: scoreOf(rows, row => row.headcount),
    production: scoreOf(rows, row => row.production),
    all: { ok: rows.filter(row => row.all).length, of: rows.length },
  };
  const closed = rows.filter(row => row.percent !== undefined);
  const planned = closed.reduce((sum, row) => sum + row.planned, 0);
  const percent = planned ? Math.round((closed.reduce((sum, row) => sum + row.yes, 0) / planned) * 100) : undefined;

  const range = `${dayMonth(week)} a ${dayMonth(friday)}`;
  const works = (count: number) => (count === 1 ? 'obra' : 'obras');
  const winners = rows.filter(row => row.all).map(row => row.work.name);
  const processes = [
    score.headcount.of
      ? `O histograma foi lançado todos os dias em ${score.headcount.ok} de ${score.headcount.of} ${works(score.headcount.of)}`
      : '',
    score.production.of ? `a produtividade em ${score.production.ok} de ${score.production.of}` : '',
  ].filter(Boolean);
  const sentence = [
    `Na semana de ${range}, ${score.planning.ok} de ${score.planning.of} ${works(score.planning.of)} ${
      score.planning.ok === 1 ? 'cumpriu' : 'cumpriram'
    } o planejamento${percent !== undefined ? `, com PPC de ${percent}% somando as obras` : ''}.`,
    processes.length === 2
      ? `${processes[0]} e ${processes[1]}.`
      : processes.length === 1
        ? `${processes[0].replace(/^a produtividade/, 'A produtividade foi lançada todos os dias')}.`
        : '',
    !rows.length
      ? ''
      : winners.length === 0
        ? 'Nenhuma obra cumpriu os três.'
        : winners.length === rows.length
          ? 'Todas as obras cumpriram os três.'
          : `${joinList(winners)} ${winners.length === 1 ? 'cumpriu' : 'cumpriram'} os três.`,
  ]
    .filter(Boolean)
    .join(' ');

  const attention: string[] = [];
  // 1. O pior PPC apurado abaixo da meta, com a causa principal.
  const byWork = new Map(input.works.map(item => [item.work.id, item]));
  const worst = closed.filter(row => row.percent! < PLAN_OK_PERCENT).sort((a, b) => a.percent! - b.percent! || b.planned - a.planned)[0];
  if (worst) {
    const lines = (byWork.get(worst.work.id)?.lines ?? []) as unknown as WeeklyCommitment[];
    const top = causePareto(lines)[0];
    const failures = worst.planned - worst.yes;
    attention.push(
      top
        ? `${worst.work.name}: PPC de ${worst.percent}%; principal causa, ${top.cause} (${top.total} de ${plural(failures, 'não cumprido', 'não cumpridos')}).`
        : `${worst.work.name}: PPC de ${worst.percent}%, o menor da semana.`,
    );
  }
  // 2. Obras sem apuração e sem programação.
  const open = rows.filter(row => row.planning.verdict === 'a').map(row => row.work.name);
  const none = rows.filter(row => row.planning.verdict === 's').map(row => row.work.name);
  if (open.length || none.length)
    attention.push(
      [
        open.length ? `Sem apuração do curto prazo: ${joinList(open)}` : '',
        none.length ? `${open.length ? 'sem' : 'Sem'} programação na semana: ${joinList(none)}` : '',
      ]
        .filter(Boolean)
        .join('; ') + '.',
    );
  // 3 a 5. Cards vencidos, segurança aberta há mais de 7 dias e checklists vencidos, somando as obras.
  const sum = (pick: (extras: WorkExtras) => number | undefined) =>
    worstOf(input.works.map(({ work, extras }) => ({ name: work.name, count: (extras && pick(extras)) || 0 })));
  const cards = sum(extras => ready(extras.restrictions)?.overdue);
  if (cards) attention.push(`${plural(cards.total, 'card vencido', 'cards vencidos')} no Quadro de Restrições, ${cards.tail}.`);
  const safety = sum(extras => ready(extras.safety)?.openOver7);
  if (safety)
    attention.push(
      `${plural(safety.total, 'apontamento de segurança aberto', 'apontamentos de segurança abertos')} há mais de 7 dias, ${safety.tail}.`,
    );
  const checklists = sum(extras => ready(extras.checklist)?.pending);
  if (checklists)
    attention.push(
      `${plural(checklists.total, 'checklist de equipamento vencido', 'checklists de equipamento vencidos')}, ${checklists.tail}.`,
    );

  return {
    week,
    friday,
    rows,
    score,
    ...(percent !== undefined ? { percent } : {}),
    sentence,
    attention: attention.slice(0, 5),
    subject: `Resumo da semana ${range}: ${score.all.ok} de ${score.all.of} ${works(score.all.of)} ${
      score.all.ok === 1 ? 'cumpriu' : 'cumpriram'
    } tudo`,
  };
}

// ─── Payload do modelo `obra360.resumo_semanal` ─────────────────────────────────────────────────────

/** Contrato com o modelo do e-mail no Takt Hub (`supabase/functions/_shared/email-templates.ts`,
 * `PayloadObraResumoSemanal`): mudou aqui, muda lá. Chaves curtas porque o payload da fila tem teto de 4096
 * bytes e leva uma linha por obra. */
export interface WeeklySummaryPayload {
  /** Segunda-feira da semana resumida (AAAA-MM-DD). */
  semana: string;
  primeiroNome?: string;
  /** Envio pedido pelo botão, fora do sábado. */
  avulso?: boolean;
  frase: string;
  /** Placar: [cumpriram, de quantas]. `tudo` = os três. */
  placar: { plan: [number, number]; hist: [number, number]; prod: [number, number]; tudo: [number, number] };
  /** Uma por obra, na ordem da tabela: nome e [situação, detalhe] do planejamento, do histograma e da produtividade. */
  obras: { n: string; p: [WeeklyVerdict, string]; h: [WeeklyVerdict, string]; r: [WeeklyVerdict, string] }[];
  /** Até 5 pontos de atenção, já escritos. */
  atencao: string[];
  /** Endereço do Dashboard geral na semana (só https); sem ele o e-mail sai sem botão. */
  link?: string;
}

/** Teto do payload em bytes (UTF-8 do JSON). A fila aceita 4096 (`pg_column_size`); a folga cobre a diferença
 * entre o JSON e o jsonb. */
export const WEEKLY_PAYLOAD_BUDGET = 3800;
export const payloadBytes = (payload: unknown) => new TextEncoder().encode(JSON.stringify(payload)).length;
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** Endereço do Dashboard geral na escala semanal, na semana do resumo; `undefined` sem endereço público https. */
export function weeklyDashboardLink(origin: string | undefined, week: LocalDate): string | undefined {
  const text = origin?.trim();
  if (!text) return undefined;
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:') return undefined;
    return `${url.origin}/dashboard?escala=semana&periodo=${week}`;
  } catch {
    return undefined;
  }
}

/** Monta o payload e o encolhe até caber: primeiro saem os pontos de atenção (do último para o primeiro), depois
 * os nomes das obras são encurtados e, por fim, os detalhes das células. */
export function weeklyPayload(
  summary: WeeklySummary,
  options: { firstName?: string; link?: string; manual?: boolean } = {},
): WeeklySummaryPayload {
  const pair = (score: WeeklyScore): [number, number] => [score.ok, score.of];
  const build = (nameMax: number, detailMax: number, attention: readonly string[]): WeeklySummaryPayload => ({
    semana: summary.week,
    ...(options.firstName ? { primeiroNome: clip(options.firstName, 40) } : {}),
    ...(options.manual ? { avulso: true } : {}),
    frase: clip(summary.sentence, 600),
    placar: {
      plan: pair(summary.score.planning),
      hist: pair(summary.score.headcount),
      prod: pair(summary.score.production),
      tudo: pair(summary.score.all),
    },
    obras: summary.rows.map(row => ({
      n: clip(row.work.name, nameMax),
      p: [row.planning.verdict, clip(row.planning.detail, detailMax)],
      h: [row.headcount.verdict, clip(row.headcount.detail, detailMax)],
      r: [row.production.verdict, clip(row.production.detail, detailMax)],
    })),
    atencao: attention.map(item => clip(item, 220)),
    ...(options.link ? { link: options.link } : {}),
  });
  const attention = [...summary.attention];
  let payload = build(60, 60, attention);
  while (payloadBytes(payload) > WEEKLY_PAYLOAD_BUDGET && attention.length) {
    attention.pop();
    payload = build(60, 60, attention);
  }
  for (const [nameMax, detailMax] of [
    [32, 60],
    [24, 40],
    [18, 24],
    [12, 0],
  ] as const) {
    if (payloadBytes(payload) <= WEEKLY_PAYLOAD_BUDGET) break;
    payload = build(nameMax, detailMax, attention);
  }
  return payload;
}

export const weeklyIdempotencyKey = (week: LocalDate, userId: string) => `${WEEKLY_SUMMARY_KIND}:${week}:${userId}`;
export const manualIdempotencyKey = (userId: string, now: string) => `${WEEKLY_SUMMARY_KIND}:avulso:${userId}:${now}`;

// ─── Horário (regras 12, 19 e 20) ───────────────────────────────────────────────────────────────────

/** O dia civil, o dia da semana (0 = domingo) e a hora em Brasília. */
export function brasiliaClock(now: Date): { day: LocalDate; weekday: number; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map(part => [part.type, part.value]),
  );
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  return { day, weekday: new Date(`${day}T00:00:00Z`).getUTCDay(), hour: Number(parts.hour) };
}

export const WEEKLY_SEND_HOUR = 8;
/** O envio automático: sábado, das 08:00 às 23:59 de Brasília, para a semana que termina naquele sábado. Fora
 * disso, `null`. O servidor que estava fora do ar às 08:00 ainda envia ao voltar no mesmo sábado. */
export function weeklySendDue(now: Date): { week: LocalDate; today: LocalDate } | null {
  const clock = brasiliaClock(now);
  if (clock.weekday !== 6 || clock.hour < WEEKLY_SEND_HOUR) return null;
  return { week: startOfWeek(clock.day), today: clock.day };
}

/** A última semana encerrada para o envio avulso (regra 19): no sábado e no domingo, a semana que acabou de
 * terminar; de segunda a sexta, a anterior. Devolve a segunda-feira dela. */
export function lastClosedWeek(today: LocalDate): LocalDate {
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const monday = startOfWeek(today);
  return weekday === 6 || weekday === 0 ? monday : addDays(monday, -7);
}
