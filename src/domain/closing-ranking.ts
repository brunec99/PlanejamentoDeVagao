import type { Id, LocalDate, WeeklyCommitment } from './entities';

/** Ranking das obras pelo PPC (30/10/2026, pedido do usuário, modelo aprovado): a primeira página do
 * PDF do fechamento compara o PPC geral da obra com o das outras. Tudo aqui é puro: a rota do servidor
 * calcula o ranking de todas as obras, e o PDF recalcula a linha da própria obra com os dados que já
 * tem, para o painel e o ranking nunca mostrarem números diferentes da mesma obra. */

/** Abaixo disso a obra aparece no fim da lista, sem posição: uma semana boa não pode liderar o ranking. */
export const MIN_RANKED_WEEKS = 4;

/** O que o PPC lê de cada linha da planilha. */
export type PpcLine = Pick<WeeklyCommitment, 'workId' | 'weekStart' | 'fulfilled'>;

export interface WeekTally {
  planned: number;
  fulfilled: number;
  /** Linhas sem Status: com alguma, a semana está em aberto. */
  pending: number;
  percent: number;
}

/** PPC geral: cumpridos ÷ assumidos de todas as semanas apuradas, somando as linhas (não é a média
 * dos percentuais das semanas). Semana em aberto fica fora. `percent` ausente: nenhuma semana apurada. */
export interface OverallPpc {
  planned: number;
  fulfilled: number;
  closedWeeks: number;
  percent?: number;
}

export interface WorkPpc {
  overall: OverallPpc;
  /** A semana do calendário analisada; ausente quando a obra não tem linha nela. */
  week?: WeekTally;
}

export interface RankingWork {
  workId: Id;
  name: string;
  code: string;
}

export interface RankingEntry extends RankingWork, WorkPpc {
  /** Posição no ranking; ausente para a obra com menos de `MIN_RANKED_WEEKS` semanas apuradas. */
  position?: number;
}

export type ClosingRankingResponse =
  { available: true; week: LocalDate; minWeeks: number; entries: RankingEntry[] } | { available: false; message: string };

function tally(lines: readonly PpcLine[]): WeekTally {
  let fulfilled = 0,
    pending = 0;
  for (const line of lines) {
    if (line.fulfilled === true) fulfilled += 1;
    else if (line.fulfilled !== false) pending += 1;
  }
  return { planned: lines.length, fulfilled, pending, percent: lines.length ? (fulfilled / lines.length) * 100 : 0 };
}

/** O PPC de uma obra até a semana analisada, inclusive: o PDF de uma semana antiga sai igual depois. */
export function workPpc(lines: readonly PpcLine[], week: LocalDate): WorkPpc {
  const weeks = new Map<string, PpcLine[]>();
  for (const line of lines) {
    if (line.weekStart > week) continue;
    const rows = weeks.get(line.weekStart);
    if (rows) rows.push(line);
    else weeks.set(line.weekStart, [line]);
  }
  const overall: OverallPpc = { planned: 0, fulfilled: 0, closedWeeks: 0 };
  for (const rows of weeks.values()) {
    const { planned, fulfilled, pending } = tally(rows);
    if (pending > 0) continue;
    overall.planned += planned;
    overall.fulfilled += fulfilled;
    overall.closedWeeks += 1;
  }
  if (overall.planned > 0) overall.percent = (overall.fulfilled / overall.planned) * 100;
  const current = weeks.get(week);
  return { overall, ...(current ? { week: tally(current) } : {}) };
}

const byName = (a: RankingWork, b: RankingWork) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' });

/** Ordena pelo PPC geral e numera; empate exato divide a posição (1º, 2º, 2º, 4º). As obras sem
 * semanas apuradas suficientes vão para o fim, por nome, sem posição. */
export function rankWorks(items: readonly (RankingWork & WorkPpc)[]): RankingEntry[] {
  const ranked = items
    .filter(item => item.overall.closedWeeks >= MIN_RANKED_WEEKS && item.overall.percent !== undefined)
    .sort((a, b) => b.overall.percent! - a.overall.percent! || byName(a, b));
  const starting = items.filter(item => !ranked.includes(item)).sort(byName);
  const entries: RankingEntry[] = [];
  ranked.forEach((item, index) => {
    const previous = entries[index - 1];
    const tied = previous && previous.overall.percent === item.overall.percent;
    entries.push({ ...item, position: tied ? previous.position : index + 1 });
  });
  return [...entries, ...starting.map(item => ({ ...item }))];
}

/** O ranking de todas as obras a partir das linhas: só entram as obras com alguma linha até a semana. */
export function buildRanking(works: readonly RankingWork[], lines: readonly PpcLine[], week: LocalDate): RankingEntry[] {
  const byWork = new Map<string, PpcLine[]>();
  for (const line of lines) {
    const rows = byWork.get(line.workId);
    if (rows) rows.push(line);
    else byWork.set(line.workId, [line]);
  }
  return rankWorks(
    works.flatMap(work => {
      const rows = (byWork.get(work.workId) ?? []).filter(line => line.weekStart <= week);
      return rows.length ? [{ ...work, ...workPpc(rows, week) }] : [];
    }),
  );
}

/** Troca a linha da obra do PDF pelo cálculo local e renumera. Obra que não veio do servidor entra. */
export function withLocalWork(entries: readonly RankingEntry[], work: RankingWork, local: WorkPpc): RankingEntry[] {
  const others = entries
    .filter(entry => entry.workId !== work.workId)
    .map(({ workId, name, code, overall, week }) => ({ workId, name, code, overall, ...(week ? { week } : {}) }));
  return rankWorks([...others, { ...work, ...local }]);
}

/** Média simples do PPC geral das obras com posição; ausente sem obra ranqueada. */
export function rankingMean(entries: readonly RankingEntry[]): number | undefined {
  const ranked = entries.filter(entry => entry.position !== undefined && entry.overall.percent !== undefined);
  return ranked.length ? ranked.reduce((sum, entry) => sum + entry.overall.percent!, 0) / ranked.length : undefined;
}
