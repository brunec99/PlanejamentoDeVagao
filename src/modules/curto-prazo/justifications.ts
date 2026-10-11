import type { NonFulfillmentCause, Team, WeeklyCommitment } from '@/domain/entities';
import { weekNumberFrom } from '@/domain/week-numbering';
import { textKey } from '@/modules/curto-prazo/sheet-view';

/** Análise das justificativas do não cumprimento (11/10/2026, pedido da obra): a causa é uma lista
 * fechada de 17 itens e diz "o quê"; a justificativa, escrita à mão ao lado, diz "por quê" — e é lá
 * que o padrão aparece ("faltou o material X três semanas seguidas"). Tudo aqui é puro e
 * determinístico: a mesma planilha produz os mesmos temas em qualquer tela. */

/** Recorte por empreiteiro e equipe do fechamento: vale para a série do PPC, o Pareto e as
 * justificativas. `undefined` é "sem filtro", como o filtro de coluna da planilha. */
export interface ClosingFilter {
  companies?: ReadonlySet<string>;
  teams?: ReadonlySet<string>;
}

/** A empresa da linha é o fornecedor escrito nela; sem ele, a empresa da equipe alocada (igual à planilha). */
export const commitmentCompany = (row: WeeklyCommitment, teams: Team[]) =>
  row.supplier.trim() || teams.find(t => t.id === row.teamId)?.company || '';
export const commitmentTeam = (row: WeeklyCommitment, teams: Team[]) => teams.find(t => t.id === row.teamId)?.name ?? '';

export function applyClosingFilter(commitments: WeeklyCommitment[], filter: ClosingFilter, teams: Team[]): WeeklyCommitment[] {
  if (!filter.companies && !filter.teams) return commitments;
  return commitments.filter(
    row =>
      (!filter.companies || filter.companies.has(commitmentCompany(row, teams))) &&
      (!filter.teams || filter.teams.has(commitmentTeam(row, teams))),
  );
}

export interface FailureRow {
  id: string;
  cause: NonFulfillmentCause;
  justification: string;
  week: number;
  weekStart: string;
  company: string;
  team: string;
  name: string;
}

/** Só as linhas com Status Não e causa apontada — o mesmo critério do Pareto. */
export function failureRows(commitments: WeeklyCommitment[], teams: Team[], firstWeek: string): FailureRow[] {
  return commitments
    .filter((row): row is WeeklyCommitment & { cause: NonFulfillmentCause } => row.fulfilled === false && !!row.cause)
    .map(row => ({
      id: row.id,
      cause: row.cause,
      justification: (row.justification ?? '').replace(/\s+/g, ' ').trim(),
      week: weekNumberFrom(firstWeek, row.weekStart),
      weekStart: row.weekStart,
      company: commitmentCompany(row, teams),
      team: commitmentTeam(row, teams),
      name: row.name,
    }))
    .sort(
      (a, b) =>
        a.weekStart.localeCompare(b.weekStart) || a.company.localeCompare(b.company, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'),
    );
}

export interface Theme {
  label: string;
  count: number;
  examples: string[];
}
export interface CauseGroup {
  cause: NonFulfillmentCause;
  total: number;
  justified: number;
  themes: Theme[];
  rows: FailureRow[];
}

/** Grupos por causa na ordem do Pareto (`order`); causa fora da ordem informada vai para o fim, por total. */
export function groupByCause(rows: FailureRow[], order: NonFulfillmentCause[] = []): CauseGroup[] {
  const groups = new Map<NonFulfillmentCause, FailureRow[]>();
  for (const row of rows) groups.set(row.cause, [...(groups.get(row.cause) ?? []), row]);
  const rank = (cause: NonFulfillmentCause) => {
    const index = order.indexOf(cause);
    return index === -1 ? order.length : index;
  };
  return [...groups.entries()]
    .sort(([a, ra], [b, rb]) => rank(a) - rank(b) || rb.length - ra.length || a.localeCompare(b, 'pt-BR'))
    .map(([cause, list]) => {
      const texts = list.map(row => row.justification).filter(Boolean);
      return { cause, total: list.length, justified: texts.length, themes: deriveThemes(texts), rows: list };
    });
}

// Palavras que não carregam tema (já sem acento, como `textKey` deixa). "falta", "atraso" e
// afins ficam de fora da lista de propósito: são o tema.
const STOPWORDS = new Set(
  (
    'a o as os um uma uns umas de do da dos das em no na nos nas por para pra pro com sem que nao e ou mas se ao aos ' +
    'foi ser esta estao sao era eram foram ter tem teve tinha havia ha ja ainda dia dias semana semanas hoje ontem amanha ' +
    'muito muita muitos mais menos so ate apos entre sobre pelo pela pelos pelas este esta esse essa isso isto aquele aquela ' +
    'ele ela eles elas nos seu sua seus suas meu minha como quando onde porque pois entao tambem mesmo mesma outro outra ' +
    'todo toda todos todas qual quais cada la aqui ali obra equipe atividade servico servicos linha nesta neste desta deste ' +
    'estava estavam estar sendo sido fez feito feita fazer vai vao ficou ficaram ficar deu dado ainda nenhum nenhuma'
  ).split(' '),
);

/** Termos da justificativa: sem acento e caixa, sem pontuação, sem números soltos e sem palavras vazias. */
export function tokenize(text: string): string[] {
  return textKey(text)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(token => token.length >= 3 && !/^\d+$/.test(token) && !STOPWORDS.has(token));
}

const MIN_THEME = 2;
/** Agrupa justificativas por termo recorrente (bigrama ou palavra). O termo mais frequente vira
 * o primeiro tema e leva consigo todas as justificativas que o contêm; o processo repete sobre as
 * que sobraram. Bigrama ganha da palavra solta no empate: "falta material" diz mais que "falta". */
export function deriveThemes(texts: string[], max = 6): Theme[] {
  const docs = texts.map(text => {
    const tokens = tokenize(text);
    const terms = new Set<string>(tokens);
    for (let i = 0; i + 1 < tokens.length; i++) terms.add(`${tokens[i]} ${tokens[i + 1]}`);
    return terms;
  });
  const frequency = new Map<string, number>();
  for (const terms of docs) for (const term of terms) frequency.set(term, (frequency.get(term) ?? 0) + 1);
  const candidates = [...frequency.entries()]
    .filter(([, count]) => count >= MIN_THEME)
    .sort(([a, fa], [b, fb]) => fb - fa || (b.includes(' ') ? 1 : 0) - (a.includes(' ') ? 1 : 0) || a.localeCompare(b));
  const taken = new Set<number>();
  const themes: Theme[] = [];
  for (const [term] of candidates) {
    if (themes.length >= max) break;
    const members = docs.flatMap((terms, index) => (!taken.has(index) && terms.has(term) ? [index] : []));
    if (members.length < MIN_THEME) continue;
    members.forEach(index => taken.add(index));
    themes.push({ label: term, count: members.length, examples: members.slice(0, 3).map(index => texts[index]) });
  }
  return themes;
}

/** Busca no bloco: casa no texto da justificativa, na atividade, na empresa ou na equipe. */
export function matchesSearch(row: FailureRow, query: string): boolean {
  const needle = textKey(query);
  return !needle || [row.justification, row.name, row.company, row.team].some(field => textKey(field).includes(needle));
}
