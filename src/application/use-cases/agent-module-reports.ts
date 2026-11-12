import type { TerminalityData } from '../../domain/terminality';
import { SAFETY_CONSEQUENCES, SAFETY_PROBABILITIES, safetyDays, type SafetyData, type SafetyInspector } from '../../domain/safety';
import { nameKey } from '../../domain/agent-briefing';
import { compareText } from '../../domain/commitment-order';
import { addDays } from '../../domain/validation';
import {
  NONE,
  NO_CONTRACTOR_LABEL,
  NO_TYPE_LABEL as NO_TERMINALITY_TYPE_LABEL,
  compareItems as compareTerminalityItems,
  floorName,
  indexTerminality,
  percentLabel,
  personName,
  photosOf as terminalityPhotosOf,
  typeName as terminalityTypeName,
  unitName,
} from '../../modules/terminalidade/terminality-view';
import {
  NO_LOCATION_LABEL,
  NO_TYPE_LABEL as NO_SAFETY_TYPE_LABEL,
  OPEN_OVER_DAYS,
  compareItems as compareSafetyItems,
  consequenceRank,
  indexSafety,
  isDay,
  locationKey,
  locationLabel,
  monthLabel,
  photosOfKind,
  probabilityRank,
  typeName as safetyTypeName,
} from '../../modules/seguranca/safety-view';
import type { AgentToolSpec } from './agent-tools';

/** Relatórios de terminalidade (aba 2.1) e de segurança do trabalho (aba 6) para a Claudia geral (08/11/2026).
 * Só leitura: texto compacto, em linhas separadas por "|", com resumo, contagem por grupo e as linhas da lista,
 * limitado a ~12.000 caracteres. A despachante (`agent-global-tools.ts`) resolve a obra pedida — uma obra, ou
 * "todas" = uma entrada por obra — e passa o `input` sem `obra`; os specs declaram `obra` porque é o que o
 * modelo vê.
 *
 * As regras vêm das próprias telas, importadas dos módulos puros (sem React nem 'use client'), para os números
 * baterem: ordem, nomes e fotos de `terminality-view` e `safety-view`, "Dias para resolver" de `safetyDays` e o
 * percentual de `percentLabel` (nunca 100% com aberta). O que as telas não têm pronto para os dois módulos
 * (média de dias para resolver da aba 5, abertas há mais de 30 dias, últimos 7 dias) segue a mesma conta do
 * quadro da aba 0 (`dashboard/terminality-panel.ts`) e de `summarize` da aba 6. Funções puras. */

/** Uma obra e os dados do módulo dela. Uma obra só = lista de um item; "todas" = uma entrada por obra. */
export interface ModuleReportEntry<T> {
  workId: string;
  workName: string;
  data: T;
}

// ─── Limites ────────────────────────────────────────────────────────────────────

/** Tamanho máximo da resposta: as linhas da lista param antes dele. */
const MAX_CHARS = 12_000;
/** Reserva para o título da lista e o aviso de corte. */
const CUT_RESERVE = 400;
const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 150;
/** Grupos mostrados; o resto vira uma linha de soma. */
const MAX_GROUPS = 40;
/** Obras na divisão por obra de cada grupo, com várias obras. */
const SPLIT_WORKS = 4;
/** Opções listadas quando um filtro não casa com nada. */
const OPTIONS_SHOWN = 30;
const DESCRIPTION_CHARS = 110;
const BRIEF_CHARS = 80;
const NOTE_CHARS = 80;
/** Aberta há mais que isto conta como antiga (o mesmo `OLD_DAYS` do quadro da aba 0, terminality-panel.ts). */
const OLD_DAYS = 30;
/** Janela dos "últimos 7 dias": hoje e os seis dias anteriores. */
const RECENT_DAYS = 7;
const LAST = Number.MAX_SAFE_INTEGER;

// ─── Specs ──────────────────────────────────────────────────────────────────────

const OBRA_INPUT = {
  type: 'string',
  description: 'Nome, sigla ou id da obra, ou "todas" para todas as obras. Sem ela, vale a obra da tela em que a pessoa está.',
};
const DAY_INPUT = (what: string) => ({ type: 'string', description: `${what} (YYYY-MM-DD, o dia incluso).` });

export const TERMINALITY_TOOL_SPEC: AgentToolSpec = {
  name: 'consultar_terminalidade',
  description:
    'Consulta a lista de pendências da terminalidade (aba 2.1) de uma obra ou de todas: resumo (abertas, resolvidas, % resolvida, média de dias para resolver, abertas há mais de 7 e de 30 dias, a mais antiga, últimos 7 dias, quantas fotos), contagem por grupo e as pendências uma por linha (local, apto, descrição, tipo, empreiteiro, responsável ATR, data de observação, dias e situação), as abertas mais antigas primeiro. Só leitura; as fotos aparecem só como contagem. Filtros de texto ignoram acento e caixa e aceitam parte do nome; "vazio" pede o campo em branco.',
  input_schema: {
    type: 'object',
    properties: {
      obra: OBRA_INPUT,
      status: {
        type: 'string',
        enum: ['abertas', 'resolvidas', 'todas'],
        description: 'Situação das pendências agrupadas e listadas. Padrão: abertas. O resumo conta sempre abertas e resolvidas.',
      },
      pavimento: { type: 'string', description: 'Local (pavimento), ex.: "4° pavto", "Térreo".' },
      apartamento: { type: 'string', description: 'Apto ou área comum, ex.: "401", "Hall".' },
      tipo: { type: 'string', description: 'Tipo de pendência, ex.: "A/C", "Pintura".' },
      empreiteiro: { type: 'string', description: 'Responsável terceiro: a empresa que corrige.' },
      responsavel_atr: { type: 'string', description: 'Responsável ATR: quem da ATR acompanha.' },
      busca: { type: 'string', description: 'Palavras na descrição da pendência (todas precisam aparecer).' },
      de: DAY_INPUT('Data de observação a partir de'),
      ate: DAY_INPUT('Data de observação até'),
      agrupar_por: {
        type: 'string',
        enum: ['pavimento', 'apartamento', 'tipo', 'empreiteiro', 'responsavel_atr', 'nenhum'],
        description: 'Contagem por grupo, do maior para o menor. Padrão: pavimento.',
      },
      limite: {
        type: 'integer',
        minimum: 0,
        maximum: MAX_LIMIT,
        description: `Máximo de pendências listadas uma a uma (padrão ${DEFAULT_LIMIT}, somando as obras; 0 = só resumo e grupos).`,
      },
    },
    additionalProperties: false,
  },
};

export const SAFETY_TOOL_SPEC: AgentToolSpec = {
  name: 'consultar_seguranca',
  description:
    'Consulta os apontamentos da segurança do trabalho (aba 3.1, vistoria dos TSTs) de uma obra ou de todas: resumo (abertos, finalizados, % finalizado, média de dias para resolver, abertos há mais de 7 e de 30 dias, o mais antigo, últimos 7 dias, abertos por consequência, quantas fotos), contagem por grupo e os apontamentos um por linha (tipo, risco, local, descrição, data, dias, situação e quem lançou), os abertos mais antigos primeiro. Só leitura; as fotos aparecem só como contagem. Filtros de texto ignoram acento e caixa e aceitam parte do nome; "vazio" pede o campo em branco.',
  input_schema: {
    type: 'object',
    properties: {
      obra: OBRA_INPUT,
      status: {
        type: 'string',
        enum: ['abertos', 'finalizados', 'todos'],
        description: 'Situação dos apontamentos agrupados e listados. Padrão: abertos. O resumo conta sempre abertos e finalizados.',
      },
      tipo: { type: 'string', description: 'Tipo de apontamento, ex.: "Proteções periféricas", "Linha de vida".' },
      local: { type: 'string', description: 'Local (texto livre do apontamento), ex.: "2° Pavimento", "Canteiro".' },
      consequencia: {
        type: 'string',
        description: `Risco: consequência. Uma ou mais, separadas por vírgula: ${SAFETY_CONSEQUENCES.join(', ')}.`,
      },
      probabilidade: {
        type: 'string',
        description: `Risco: probabilidade. Uma ou mais, separadas por vírgula: ${SAFETY_PROBABILITIES.join(', ')}.`,
      },
      tst: {
        type: 'string',
        description: 'Quem lançou: nome do TST (ou do admin), ou "planilha" para o histórico importado da "SST - Controle geral".',
      },
      busca: {
        type: 'string',
        description: 'Palavras na descrição, no local, no tipo ou no "como foi corrigido" (todas precisam aparecer).',
      },
      de: DAY_INPUT('Data do apontamento a partir de'),
      ate: DAY_INPUT('Data do apontamento até'),
      agrupar_por: {
        type: 'string',
        enum: ['tipo', 'local', 'consequencia', 'probabilidade', 'mes', 'tst', 'nenhum'],
        description: 'Contagem por grupo, do maior para o menor ("mes": do mês mais recente para o mais antigo). Padrão: tipo.',
      },
      limite: {
        type: 'integer',
        minimum: 0,
        maximum: MAX_LIMIT,
        description: `Máximo de apontamentos listados um a um (padrão ${DEFAULT_LIMIT}, somando as obras; 0 = só resumo e grupos).`,
      },
    },
    additionalProperties: false,
  },
};

// ─── Linhas comuns aos dois módulos ─────────────────────────────────────────────

type Situation = 'open' | 'resolved' | 'all';
interface GroupValue {
  key: string;
  label: string;
  /** Desempate entre grupos do mesmo tamanho (ordem cadastrada); `LAST` vai para o fim. */
  order: number;
}
/** Uma pendência (ou apontamento) já lida para o relatório: os dois módulos viram o mesmo formato. */
interface ReportRow {
  workIndex: number;
  workName: string;
  /** Posição na ordem padrão da aba, dentro da obra: desempate estável. */
  rank: number;
  open: boolean;
  observedOn: string;
  correctedOn?: string;
  /** Da observação até hoje (aberta) ou até a correção (resolvida): o "Dias para resolver" de `safetyDays`. */
  days: number;
  issuePhotos: number;
  correctionPhotos: number;
  /** Valor de cada campo de filtro (texto exibido; vazio = sem valor). */
  fields: Record<string, string>;
  /** Texto da busca, já sem acento e sem caixa. */
  haystack: string;
  groups: Record<string, GroupValue>;
  /** Colunas da lista, sem a obra. */
  cells: string[];
  /** Resumo de uma linha para "a mais antiga aberta". */
  brief: string;
  consequence?: string;
}
interface WorkRows {
  workName: string;
  rows: ReportRow[];
  /** Valores cadastrados na obra por campo de filtro (somados aos que aparecem nas linhas). */
  options: Record<string, string[]>;
  notes: string[];
}
interface FieldDef {
  input: string;
  label: string;
  plural: string;
  /** Aceita vários valores separados por vírgula (listas fechadas, como a consequência). */
  multi?: boolean;
}
interface GroupingDef {
  value: string;
  label: string;
  aliases: string[];
}
/** Palavras de cada módulo, com o gênero certo ("abertas"/"abertos"). */
interface Lexicon {
  title: string;
  one: string;
  many: string;
  Many: string;
  open: string;
  opens: string;
  done: string;
  dones: string;
  all: string;
  others: string;
  observedOne: string;
  observedMany: string;
  oldest: string;
  oldestFirst: string;
  orderAll: string;
  issuePhotos: string;
  noneRegistered: string;
  noWorkData: string;
  noneSelected: string;
  noneOpen: string;
  noneDone: string;
  noDone: string;
  allDone: (n: number) => string;
  allOpen: (n: number) => string;
  inModule: string;
}
interface ModuleDef {
  lex: Lexicon;
  fields: FieldDef[];
  groupings: GroupingDef[];
  defaultGroup: string;
  columns: string;
  legend: string;
  /** Campos sugeridos no aviso de lista cortada. */
  fieldHint: string;
  extra?: (rows: ReportRow[]) => string | undefined;
}

// ─── Texto ──────────────────────────────────────────────────────────────────────

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '');
/** Chave de comparação: `nameKey` (sem acento, caixa nem espaço repetido) com "°" e "º" equivalentes, como o
 * `locationKey` da aba 6 ("2° Pavimento" = "2º pavimento"). */
const keyOf = (value: string) => nameKey(value.replace(/[°˚º]/g, 'º'));
const tokensOf = (key: string) => key.split(/[^a-z0-9]+/).filter(Boolean);
const dmy = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
const dm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
/** Uma linha só, sem "|" (o separador das colunas), cortada com "…". */
function clip(value: string, max: number) {
  const tidy = value.replace(/\s+/g, ' ').replace(/\|/g, '/').trim();
  return tidy.length > max ? `${tidy.slice(0, max - 1).trimEnd()}…` : tidy;
}
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const decimal = (value: number) => value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const share = (n: number, base: number) => {
  const percent = base ? Math.round((n / base) * 100) : 0;
  return n && !percent ? '<1%' : `${percent}%`;
};
/** Dias inteiros entre duas datas AAAA-MM-DD, nunca negativo: a conta de `safetyDays` (domain/safety.ts) e do
 * `daysBetween` do quadro da aba 0 (terminality-panel.ts, média de dias para resolver). */
const spanDays = (from: string, to: string) =>
  Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000));

// ─── Entrada ────────────────────────────────────────────────────────────────────

function parseSituation(value: unknown, lex: Lexicon, warnings: string[]): Situation {
  const key = nameKey(text(value));
  if (!key) return 'open';
  if (/^(abert|open|pendent)/.test(key)) return 'open';
  if (/^(resolvid|finalizad|fechad|corrigid|conclu|resolved|done)/.test(key)) return 'resolved';
  if (/^(tod|all|amb)/.test(key)) return 'all';
  warnings.push(`status "${text(value)}" não reconhecido; usei ${lex.opens}.`);
  return 'open';
}
function parseDay(value: unknown, name: string, warnings: string[]) {
  const raw = text(value);
  if (!raw) return '';
  if (isDay(raw)) return raw;
  warnings.push(`"${name}" (${raw}) não é uma data YYYY-MM-DD válida; ignorei.`);
  return '';
}
function parseGrouping(value: unknown, def: ModuleDef, warnings: string[]): GroupingDef {
  const key = nameKey(text(value)).replace(/[\s-]+/g, '_');
  const fallback = def.groupings.find(g => g.value === def.defaultGroup)!;
  if (!key) return fallback;
  const found = def.groupings.find(g => g.value === key || g.aliases.includes(key));
  if (found) return found;
  warnings.push(`agrupar_por "${text(value)}" não reconhecido; agrupei por ${fallback.label}.`);
  return fallback;
}
function parseLimit(value: unknown) {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.min(MAX_LIMIT, Math.floor(n))) : DEFAULT_LIMIT;
}

/** Palavras que pedem o campo em branco ("sem tipo", "vazio", "-"). */
const isEmptyWord = (key: string) =>
  key === 'vazio' || key === '-' || key === 'sem' || key === 'nenhum' || key === 'nenhuma' || key.startsWith('sem ');

/** Quantos acentos ("ç", "ã") a grafia tem: no empate, a acentuada ganha ("MZ Climatização" sobre "mz climatizacao"). */
const accents = (value: string) => value.normalize('NFD').match(/[̀-ͯ]/g)?.length ?? 0;
/** A grafia mais usada; empate: a com mais acentos e, depois, a primeira vista (a ordem de inserção do mapa). */
function pickSpelling(spellings: Map<string, number>): string {
  let best: [string, number] | undefined;
  for (const entry of spellings)
    if (!best || entry[1] > best[1] || (entry[1] === best[1] && accents(entry[0]) > accents(best[0]))) best = entry;
  return best?.[0] ?? '';
}

interface FilterMatch {
  keys: Set<string>;
  empty: boolean;
  labels: string[];
}
/** Os valores que um filtro de texto escolhe, entre os existentes na obra: o igual (sem acento nem caixa)
 * ganha; sem igual, as palavras do filtro no começo das palavras do valor ("4" pega "4° pavto", não
 * "14° pavto"); sem isso, o trecho em qualquer lugar. "vazio"/"sem …" pede o campo em branco. `undefined` =
 * nada casa. */
function resolveFilter(raw: string, options: string[], multi: boolean): FilterMatch | undefined {
  const spellings = new Map<string, Map<string, number>>();
  for (const option of options) {
    const key = keyOf(option);
    if (!key) continue;
    const seen = spellings.get(key) ?? new Map<string, number>();
    seen.set(option.trim(), (seen.get(option.trim()) ?? 0) + 1);
    spellings.set(key, seen);
  }
  const known = new Map([...spellings].map(([key, seen]) => [key, pickSpelling(seen)]));
  const keys = new Set<string>();
  const labels: string[] = [];
  let empty = false;
  const add = (key: string) => {
    if (keys.has(key)) return;
    keys.add(key);
    labels.push(known.get(key)!);
  };
  for (const part of multi ? raw.split(/[,;]/) : [raw]) {
    const wanted = keyOf(part);
    if (!wanted) continue;
    if (known.has(wanted)) {
      add(wanted);
      continue;
    }
    if (isEmptyWord(wanted)) {
      empty = true;
      continue;
    }
    const tokens = tokensOf(wanted);
    const byWords = tokens.length
      ? [...known.keys()].filter(key => {
          const words = tokensOf(key);
          return tokens.every(token => words.some(word => word.startsWith(token)));
        })
      : [];
    const found = byWords.length ? byWords : [...known.keys()].filter(key => key.includes(wanted));
    found.forEach(add);
  }
  return keys.size || empty ? { keys, empty, labels } : undefined;
}
const passes = (match: FilterMatch, value: string) => (keyOf(value) ? match.keys.has(keyOf(value)) : match.empty);

// ─── Resumo ─────────────────────────────────────────────────────────────────────

interface Totals {
  total: number;
  open: number;
  resolved: number;
  percentLabel: string;
  /** Média de dias para resolver das resolvidas com data de correção (`summarize` da aba 6, safety-view.ts). */
  avgResolve?: number;
  resolvedWithDate: number;
  /** Média de dias em aberto das abertas (`averageOpenDays` do quadro da aba 0). */
  avgOpen?: number;
  over7: number;
  over30: number;
  oldest?: ReportRow;
  openedRecent: number;
  resolvedRecent: number;
  issuePhotos: number;
  correctionPhotos: number;
  openWithoutPhoto: number;
}
const olderFirst = (a: ReportRow, b: ReportRow) => a.observedOn.localeCompare(b.observedOn) || a.workIndex - b.workIndex || a.rank - b.rank;

function totalsOf(rows: ReportRow[], today: string): Totals {
  const recentFrom = addDays(today, -(RECENT_DAYS - 1));
  const recent = (date: string | undefined) => !!date && date >= recentFrom && date <= today;
  const t: Totals = {
    total: rows.length,
    open: 0,
    resolved: 0,
    percentLabel: '—',
    resolvedWithDate: 0,
    over7: 0,
    over30: 0,
    openedRecent: 0,
    resolvedRecent: 0,
    issuePhotos: 0,
    correctionPhotos: 0,
    openWithoutPhoto: 0,
  };
  let openDays = 0;
  let resolveDays = 0;
  for (const row of rows) {
    t.issuePhotos += row.issuePhotos;
    t.correctionPhotos += row.correctionPhotos;
    if (recent(row.observedOn)) t.openedRecent++;
    if (row.open) {
      t.open++;
      openDays += row.days;
      // "Abertos há mais de 7 dias" da aba 6 (`summarize`, safety-view.ts) e "há mais de 30 dias" do quadro da aba 0.
      if (row.days > OPEN_OVER_DAYS) t.over7++;
      if (row.days > OLD_DAYS) t.over30++;
      if (!row.issuePhotos) t.openWithoutPhoto++;
      if (!t.oldest || olderFirst(row, t.oldest) < 0) t.oldest = row;
    } else if (row.correctedOn) {
      t.resolvedWithDate++;
      resolveDays += row.days;
      if (recent(row.correctedOn)) t.resolvedRecent++;
    }
  }
  t.resolved = t.total - t.open;
  t.percentLabel = percentLabel({ percent: t.total ? (t.resolved / t.total) * 100 : undefined, open: t.open });
  if (t.resolvedWithDate) t.avgResolve = resolveDays / t.resolvedWithDate;
  if (t.open) t.avgOpen = openDays / t.open;
  return t;
}

// ─── Grupos ─────────────────────────────────────────────────────────────────────

interface GroupTotal extends GroupValue {
  count: number;
  open: number;
  byWork: Map<number, number>;
  spellings: Map<string, number>;
}
/** Grupos do maior para o menor; empate pela ordem cadastrada e pelo nome, com o grupo sem valor por último.
 * Por mês, do mais recente para o mais antigo. O nome do grupo é a grafia mais usada, como o nome do local em
 * `locationOptions` (safety-view.ts); no empate, a acentuada e depois a primeira vista na ordem da aba. */
function groupRows(rows: ReportRow[], by: string): GroupTotal[] {
  const groups = new Map<string, GroupTotal>();
  for (const row of rows) {
    const value = row.groups[by];
    if (!value) continue;
    const group = groups.get(value.key) ?? {
      ...value,
      count: 0,
      open: 0,
      byWork: new Map<number, number>(),
      spellings: new Map<string, number>(),
    };
    group.count++;
    group.spellings.set(value.label, (group.spellings.get(value.label) ?? 0) + 1);
    if (row.open) group.open++;
    group.order = Math.min(group.order, value.order);
    group.byWork.set(row.workIndex, (group.byWork.get(row.workIndex) ?? 0) + 1);
    groups.set(value.key, group);
  }
  const list = [...groups.values()];
  for (const group of list) group.label = pickSpelling(group.spellings);
  if (by === 'mes') return list.sort((a, b) => b.key.localeCompare(a.key));
  return list.sort(
    (a, b) =>
      b.count - a.count || (a.key === NONE ? 1 : 0) - (b.key === NONE ? 1 : 0) || a.order - b.order || compareText(a.label, b.label),
  );
}

// ─── Relatório ──────────────────────────────────────────────────────────────────

function runReport(def: ModuleDef, works: WorkRows[], input: Record<string, unknown>, today: string): string {
  const { lex } = def;
  if (!works.length) return `${lex.title}: nenhuma obra para consultar.`;
  const warnings: string[] = [];
  const situation = parseSituation(input.status, lex, warnings);
  const from = parseDay(input.de, 'de', warnings);
  const to = parseDay(input.ate, 'ate', warnings);
  const grouping = parseGrouping(input.agrupar_por, def, warnings);
  const limit = parseLimit(input.limite);
  const searchRaw = text(input.busca);
  const searchTokens = keyOf(searchRaw).split(' ').filter(Boolean);
  const multiple = works.length > 1;
  const header = `${lex.title} · ${multiple ? `${works.length} obras` : works[0].workName} · hoje ${dmy(today)}`;
  if (from && to && from > to) return `${header}\nPeríodo inválido: "de" (${dmy(from)}) é depois de "ate" (${dmy(to)}).`;

  // Filtros de texto: cada obra casa o texto com os próprios valores.
  const active = def.fields.map(field => ({ field, raw: text(input[field.input]) })).filter(f => f.raw);
  const matched = active.map(() => [] as string[]);
  const emptyAsked = active.map(() => false);
  const missedIn = active.map(() => [] as number[]);
  const filtered = works.map((work, w) => {
    const matches = active.map(({ field, raw }, f) => {
      const options = [...(work.options[field.input] ?? []), ...work.rows.map(row => row.fields[field.input] ?? '')];
      const match = resolveFilter(raw, options, !!field.multi);
      if (!match) missedIn[f].push(w);
      else {
        for (const label of match.labels) if (!matched[f].some(l => keyOf(l) === keyOf(label))) matched[f].push(label);
        emptyAsked[f] ||= match.empty;
      }
      return match;
    });
    if (matches.some(match => !match)) return [];
    return work.rows.filter(
      row =>
        active.every(({ field }, f) => passes(matches[f]!, row.fields[field.input] ?? '')) &&
        (!from || row.observedOn >= from) &&
        (!to || row.observedOn <= to) &&
        searchTokens.every(token => row.haystack.includes(token)),
    );
  });

  const situationOne = situation === 'open' ? lex.open : situation === 'resolved' ? lex.done : lex.one;
  const situationMany = situation === 'open' ? lex.opens : situation === 'resolved' ? lex.dones : lex.many;
  const parts = [`situação ${situation === 'open' ? lex.opens : situation === 'resolved' ? lex.dones : lex.all}`];
  active.forEach(({ field, raw }, f) => {
    const shown = [...matched[f].slice(0, 5), ...(emptyAsked[f] ? [`sem ${field.label}`] : [])];
    const more = matched[f].length > 5 ? ` +${matched[f].length - 5}` : '';
    parts.push(`${field.label} "${raw}"${shown.length ? ` (${shown.join(', ')}${more})` : ''}`);
  });
  if (from || to)
    parts.push(`${lex.observedMany} ${from && to ? `de ${dmy(from)} a ${dmy(to)}` : from ? `a partir de ${dmy(from)}` : `até ${dmy(to)}`}`);
  if (searchTokens.length) parts.push(`busca "${searchRaw}"`);
  parts.push(grouping.value === 'nenhum' ? 'sem agrupamento' : `agrupado por ${grouping.label}`);
  const lines = [header, `Filtros: ${parts.join(' · ')}`];
  for (const warning of warnings) lines.push(`Aviso: ${warning}`);
  for (const note of new Set(works.flatMap(work => work.notes))) lines.push(`Obs.: ${note}`);

  const registered = works.reduce((sum, work) => sum + work.rows.length, 0);
  if (!registered) {
    lines.push(
      multiple
        ? `${capitalize(lex.noneRegistered)} ${lex.inModule} em nenhuma das ${works.length} obras.`
        : `${capitalize(lex.noneRegistered)} ${lex.inModule} em ${works[0].workName}.`,
    );
    return lines.join('\n');
  }

  // Filtro que não casa com nada em obra nenhuma (as vazias contam como não casar): diz o que existe, para o
  // modelo corrigir o texto em vez de concluir que não há pendência.
  const missed = active.filter((_, f) => missedIn[f].length === works.length);
  if (missed.length) {
    for (const { field, raw } of missed) {
      const options = new Map<string, string>();
      for (const work of works)
        for (const option of [...(work.options[field.input] ?? []), ...work.rows.map(row => row.fields[field.input] ?? '')]) {
          const key = keyOf(option);
          if (key && !options.has(key)) options.set(key, option.trim());
        }
      const sorted = [...options.values()].sort(compareText);
      const where = multiple ? 'nas obras' : 'na obra';
      lines.push(
        `Filtro ${field.label} "${raw}": nada casa${multiple ? ' em nenhuma obra' : ''}. ${
          sorted.length
            ? `${capitalize(field.plural)} ${where}: ${sorted.slice(0, OPTIONS_SHOWN).join('; ')}${sorted.length > OPTIONS_SHOWN ? ` (+${sorted.length - OPTIONS_SHOWN})` : ''}.`
            : `Não há ${field.plural} ${where}.`
        }`,
      );
    }
    return lines.join('\n');
  }
  active.forEach(({ field, raw }, f) => {
    // Obra sem nenhum registro já aparece em "Sem … registrada"; aqui só as que têm dados e não casam.
    const names = missedIn[f].filter(w => works[w].rows.length).map(w => works[w].workName);
    if (!names.length) return;
    lines.push(
      `Obs.: ${field.label} "${raw}" não casa com nada em ${names.length === 1 ? names[0] : `${names.length} obras (${names.slice(0, 6).join(', ')}${names.length > 6 ? '…' : ''})`}.`,
    );
  });

  const all = filtered.flat();
  if (!all.length) {
    lines.push(`${capitalize(lex.noneSelected)} no recorte (${registered} ${multiple ? 'nas obras' : 'na obra'}, sem filtros).`);
    return lines.join('\n');
  }

  // Resumo: abertas e resolvidas, com os demais filtros (os cartões do topo da aba contam as duas situações).
  const totals = totalsOf(all, today);
  const otherFilters = active.length > 0 || !!from || !!to || searchTokens.length > 0;
  lines.push(
    `Resumo${multiple ? ` das ${works.length} obras` : ''}${situation === 'all' ? '' : ` (${lex.opens} e ${lex.dones}${otherFilters ? ', com os demais filtros' : ''})`}: ${count(totals.total, lex.one, lex.many)} · ${count(totals.open, lex.open, lex.opens)} · ${count(totals.resolved, lex.done, lex.dones)} · ${totals.percentLabel} ${lex.done}`,
  );
  lines.push(
    `Prazos: ${
      totals.avgResolve === undefined
        ? `média de dias para resolver — (${lex.noDone})`
        : `média de ${decimal(totals.avgResolve)} dias para resolver (${count(totals.resolvedWithDate, lex.done, lex.dones)})`
    } · ${lex.opens} há mais de ${OPEN_OVER_DAYS} dias: ${totals.over7} · há mais de ${OLD_DAYS} dias: ${totals.over30}${
      totals.avgOpen === undefined ? '' : ` · média de ${Math.round(totals.avgOpen)} dias em aberto`
    }`,
  );
  if (totals.oldest)
    lines.push(
      `${lex.oldest}: ${multiple ? `${totals.oldest.workName} | ` : ''}${totals.oldest.brief} — desde ${dmy(totals.oldest.observedOn)}, há ${count(totals.oldest.days, 'dia', 'dias')}`,
    );
  lines.push(
    `Últimos ${RECENT_DAYS} dias (${dm(addDays(today, -(RECENT_DAYS - 1)))} a ${dm(today)}): ${count(totals.openedRecent, lex.observedOne, lex.observedMany)} · ${count(totals.resolvedRecent, lex.done, lex.dones)}`,
  );
  lines.push(
    totals.issuePhotos || totals.correctionPhotos
      ? `Fotos (só a contagem; as imagens não chegam aqui): ${totals.issuePhotos} ${lex.issuePhotos} · ${totals.correctionPhotos} da correção · ${count(totals.openWithoutPhoto, lex.open, lex.opens)} sem foto ${lex.issuePhotos}`
      : 'Fotos: nenhuma no recorte.',
  );
  const extra = def.extra?.(all);
  if (extra) lines.push(extra);

  // Comparativo por obra.
  if (multiple) {
    const perWork = works.map((work, w) => ({ work, w, t: totalsOf(filtered[w], today) }));
    const withRows = perWork
      .filter(p => p.t.total)
      .sort((a, b) => b.t.open - a.t.open || b.t.total - a.t.total || compareText(a.work.workName, b.work.workName));
    lines.push(`Comparativo por obra (mais ${lex.opens} primeiro):`);
    lines.push(
      `obra | total | ${lex.opens} | ${lex.dones} | % ${lex.done} | ${lex.opens} >${OPEN_OVER_DAYS} d | >${OLD_DAYS} d | ${lex.oldest.toLowerCase()}`,
    );
    for (const { work, t } of withRows)
      lines.push(
        `${work.workName} | ${t.total} | ${t.open} | ${t.resolved} | ${t.percentLabel} | ${t.over7} | ${t.over30} | ${t.oldest ? `${dmy(t.oldest.observedOn)} (${t.oldest.days} d)` : '-'}`,
      );
    const empty = perWork.filter(p => !p.work.rows.length).map(p => p.work.workName);
    const outside = perWork.filter(p => p.work.rows.length && !p.t.total).map(p => p.work.workName);
    if (empty.length) lines.push(`${lex.noWorkData}: ${empty.join(', ')}.`);
    if (outside.length) lines.push(`Nada no recorte: ${outside.join(', ')}.`);
  }

  // Grupos e lista: só a situação pedida.
  const selected = situation === 'all' ? all : all.filter(row => row.open === (situation === 'open'));
  if (!selected.length) {
    lines.push(
      situation === 'open'
        ? `${capitalize(lex.noneOpen)} no recorte (${lex.allDone(all.length)}).`
        : `${capitalize(lex.noneDone)} no recorte (${lex.allOpen(all.length)}).`,
    );
    return finish(lines);
  }
  if (grouping.value !== 'nenhum') {
    const groups = groupRows(selected, grouping.value);
    lines.push(
      `Por ${grouping.label}${multiple ? ', somando as obras' : ''} (${count(selected.length, situationOne, situationMany)}, ${count(groups.length, 'grupo', 'grupos')}):`,
    );
    for (const group of groups.slice(0, MAX_GROUPS)) {
      const base =
        situation === 'all'
          ? `${group.label}: ${group.count} · ${count(group.open, lex.open, lex.opens)} · ${percentLabel({ percent: ((group.count - group.open) / group.count) * 100, open: group.open })} ${lex.done}`
          : `${group.label}: ${group.count} (${share(group.count, selected.length)})`;
      if (!multiple) {
        lines.push(base);
        continue;
      }
      const split = [...group.byWork].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
      const rest = split.length - SPLIT_WORKS;
      lines.push(
        `${base} — ${split
          .slice(0, SPLIT_WORKS)
          .map(([w, n]) => `${works[w].workName} ${n}`)
          .join(' · ')}${rest > 0 ? ` · +${rest} obras` : ''}`,
      );
    }
    const hidden = groups.slice(MAX_GROUPS);
    if (hidden.length)
      lines.push(`(+${count(hidden.length, 'grupo menor', 'grupos menores')}, somando ${hidden.reduce((sum, g) => sum + g.count, 0)})`);
  }

  if (limit === 0) {
    lines.push(`(Lista de ${lex.many} omitida: limite 0.)`);
    return finish(lines);
  }
  // Abertas primeiro, das mais antigas; resolvidas da correção mais recente para a mais antiga.
  const ordered = [...selected].sort((a, b) => {
    if (a.open !== b.open) return a.open ? -1 : 1;
    if (a.open) return olderFirst(a, b);
    return (b.correctedOn ?? '').localeCompare(a.correctedOn ?? '') || a.workIndex - b.workIndex || a.rank - b.rank;
  });
  const wanted = ordered.slice(0, limit);
  const columns = `${multiple ? 'obra | ' : ''}${def.columns}`;
  let budget = MAX_CHARS - [...lines, columns, def.legend].join('\n').length - CUT_RESERVE;
  const shown: string[] = [];
  for (const row of wanted) {
    const line = (multiple ? [row.workName, ...row.cells] : row.cells).join(' | ');
    if (line.length + 1 > budget) break;
    shown.push(line);
    budget -= line.length + 1;
  }
  const order =
    situation === 'open'
      ? `${lex.opens}, ${lex.oldestFirst}`
      : situation === 'resolved'
        ? `${lex.dones}, correção mais recente primeiro`
        : lex.orderAll;
  lines.push(`${lex.Many} (${order}; ${shown.length} de ${selected.length}):`, columns, def.legend, ...shown);
  if (shown.length < selected.length) {
    const bySize = shown.length < wanted.length;
    lines.push(
      `(lista cortada${bySize ? ' no tamanho máximo da resposta' : ''}: mostrando ${shown.length} de ${selected.length}. Para ver ${lex.others}, filtre por ${def.fieldHint} ou período${
        !bySize && limit < MAX_LIMIT ? `, ou aumente "limite" (até ${MAX_LIMIT})` : ''
      }.)`,
    );
  }
  return finish(lines);
}

/** Trava final do tamanho (muitas obras ou grupos de nome longo): corta na última linha inteira. */
function finish(lines: string[]) {
  const result = lines.join('\n');
  if (result.length <= MAX_CHARS) return result;
  const at = result.lastIndexOf('\n', MAX_CHARS - 120);
  return `${result.slice(0, at > 0 ? at : MAX_CHARS - 120)}\n(lista cortada no tamanho máximo da resposta; use filtros para ver o resto.)`;
}

// ─── Terminalidade (aba 5) ──────────────────────────────────────────────────────

/** O mesmo rótulo de `summarize` e `groupOf` (terminality-view.ts) para a pendência de pavimento apagado. */
const MISSING_FLOOR = 'Pavimento removido';
const NO_ATR_LABEL = 'Sem responsável ATR';

const TERMINALITY: ModuleDef = {
  lex: {
    title: 'Terminalidade (aba 2.1)',
    one: 'pendência',
    many: 'pendências',
    Many: 'Pendências',
    open: 'aberta',
    opens: 'abertas',
    done: 'resolvida',
    dones: 'resolvidas',
    all: 'todas',
    others: 'outras',
    observedOne: 'observada',
    observedMany: 'observadas',
    oldest: 'Mais antiga aberta',
    oldestFirst: 'mais antigas primeiro',
    orderAll: 'abertas primeiro, das mais antigas; depois as resolvidas, da correção mais recente',
    issuePhotos: 'do problema',
    noneRegistered: 'nenhuma pendência registrada',
    noWorkData: 'Sem pendência registrada',
    noneSelected: 'nenhuma pendência',
    noneOpen: 'nenhuma pendência aberta',
    noneDone: 'nenhuma pendência resolvida',
    noDone: 'nenhuma resolvida',
    allDone: n => (n === 1 ? 'a única está resolvida' : `as ${n} estão resolvidas`),
    allOpen: n => (n === 1 ? 'a única está aberta' : `as ${n} estão abertas`),
    inModule: 'na terminalidade',
  },
  fields: [
    { input: 'pavimento', label: 'pavimento', plural: 'pavimentos' },
    { input: 'apartamento', label: 'apartamento', plural: 'apartamentos' },
    { input: 'tipo', label: 'tipo', plural: 'tipos' },
    { input: 'empreiteiro', label: 'empreiteiro', plural: 'empreiteiros' },
    { input: 'responsavel_atr', label: 'responsável ATR', plural: 'responsáveis ATR' },
  ],
  groupings: [
    { value: 'pavimento', label: 'pavimento', aliases: ['local', 'andar', 'pavto'] },
    { value: 'apartamento', label: 'apartamento', aliases: ['apto', 'unidade'] },
    { value: 'tipo', label: 'tipo', aliases: [] },
    {
      value: 'empreiteiro',
      label: 'empreiteiro (responsável terceiro)',
      aliases: ['empresa', 'empreiteira', 'terceiro', 'responsavel_terceiro'],
    },
    { value: 'responsavel_atr', label: 'responsável ATR', aliases: ['atr', 'responsavel'] },
    { value: 'nenhum', label: 'nenhum', aliases: ['nada', 'sem'] },
  ],
  defaultGroup: 'pavimento',
  columns: 'local | apto | descrição | tipo | empreiteiro | resp. ATR | observada em | dias | situação | fotos',
  legend: '(dias: da observação até hoje, se aberta, ou até a correção, se resolvida; fotos: do problema + da correção)',
  fieldHint: 'pavimento, empreiteiro, tipo',
};

function terminalityRows(entry: ModuleReportEntry<TerminalityData>, workIndex: number, today: string): WorkRows {
  const { data } = entry;
  const index = indexTerminality(data);
  // Ordem padrão da aba 5 (pavimento, apto, data de observação): é o desempate da lista.
  const rows = [...data.items].sort(compareTerminalityItems(index)).map((item, rank): ReportRow => {
    const floor = floorName(index, item);
    const floorLabel = floor || MISSING_FLOOR;
    const unit = unitName(index, item);
    const place = unit ? `${floorLabel} · ${unit}` : `${floorLabel} · sem apto`;
    const type = terminalityTypeName(index, item);
    const contractor = (item.contractor ?? '').trim();
    const person = personName(index, item);
    const photos = terminalityPhotosOf(index, item.id);
    const open = item.status === 'open';
    const days = spanDays(item.observedOn, open ? today : (item.correctedOn ?? today));
    const note = item.resolutionNote ? `: ${clip(item.resolutionNote, NOTE_CHARS)}` : '';
    const situation = open ? 'aberta' : `resolvida${item.correctedOn ? ` em ${dmy(item.correctedOn)}` : ''}${note}`;
    return {
      workIndex,
      workName: entry.workName,
      rank,
      open,
      observedOn: item.observedOn,
      correctedOn: item.correctedOn,
      days,
      issuePhotos: photos.issue.length,
      correctionPhotos: photos.correction.length,
      fields: { pavimento: floor, apartamento: unit, tipo: type, empreiteiro: contractor, responsavel_atr: person },
      haystack: keyOf(item.description),
      groups: {
        pavimento: { key: keyOf(floorLabel), label: floorLabel, order: index.floors.get(item.floorId)?.orderIndex ?? LAST },
        apartamento: { key: keyOf(place), label: place, order: rank },
        tipo: type
          ? { key: keyOf(type), label: type, order: item.typeId ? (index.types.get(item.typeId)?.orderIndex ?? LAST) : LAST }
          : { key: NONE, label: NO_TERMINALITY_TYPE_LABEL, order: LAST },
        // Grafias equivalentes ("Hidrotec " e "HIDROTEC") somam juntas, como em `summarize` (terminality-view.ts).
        empreiteiro: contractor
          ? { key: keyOf(contractor), label: contractor, order: 0 }
          : { key: NONE, label: NO_CONTRACTOR_LABEL, order: LAST },
        responsavel_atr: person ? { key: keyOf(person), label: person, order: 0 } : { key: NONE, label: NO_ATR_LABEL, order: LAST },
      },
      cells: [
        floorLabel,
        unit || '-',
        clip(item.description, DESCRIPTION_CHARS) || '-',
        type || '-',
        contractor || '-',
        person || '-',
        dmy(item.observedOn),
        String(days),
        situation,
        `${photos.issue.length}+${photos.correction.length}`,
      ],
      brief: `${unit ? `${floorLabel} · ${unit}` : floorLabel} · ${clip(item.description, BRIEF_CHARS)}`,
    };
  });
  return {
    workName: entry.workName,
    rows,
    options: {
      pavimento: data.floors.map(f => f.name),
      apartamento: data.units.map(u => u.name),
      tipo: data.types.map(t => t.name),
      responsavel_atr: data.people.map(p => p.name),
    },
    notes: [],
  };
}

export function terminalityReport(entries: ModuleReportEntry<TerminalityData>[], input: Record<string, unknown>, today: string): string {
  return runReport(
    TERMINALITY,
    entries.map((entry, w) => terminalityRows(entry, w, today)),
    input,
    today,
  );
}

// ─── Segurança do trabalho (aba 6) ──────────────────────────────────────────────

/** O "Apontado por" do histórico importado, o mesmo texto da janela do apontamento (seguranca/item-dialog.tsx). */
const SPREADSHEET_AUTHOR = 'Planilha SST - Controle geral';
const UNKNOWN_AUTHOR = 'TST não identificado';

/** `SafetyData` não traz nomes de pessoas. A despachante pode juntar aos dados da obra `inspectors` (o mesmo
 * campo de `SafetyResponse`, os TSTs com a obra) e/ou `users` ({ id, name }), para a coluna "TST" e o filtro
 * `tst` mostrarem quem lançou, como o "Apontado por" da tela (que procura em usuários e TSTs). */
type SafetyNames = { inspectors?: SafetyInspector[]; users?: { id: string; name: string }[] };

const SAFETY: ModuleDef = {
  lex: {
    title: 'Segurança do trabalho (aba 3.1)',
    one: 'apontamento',
    many: 'apontamentos',
    Many: 'Apontamentos',
    open: 'aberto',
    opens: 'abertos',
    done: 'finalizado',
    dones: 'finalizados',
    all: 'todos',
    others: 'outros',
    observedOne: 'apontado',
    observedMany: 'apontados',
    oldest: 'Mais antigo aberto',
    oldestFirst: 'mais antigos primeiro',
    orderAll: 'abertos primeiro, dos mais antigos; depois os finalizados, da correção mais recente',
    issuePhotos: 'do apontamento',
    noneRegistered: 'nenhum apontamento registrado',
    noWorkData: 'Sem apontamento registrado',
    noneSelected: 'nenhum apontamento',
    noneOpen: 'nenhum apontamento aberto',
    noneDone: 'nenhum apontamento finalizado',
    noDone: 'nenhum finalizado',
    allDone: n => (n === 1 ? 'o único está finalizado' : `os ${n} estão finalizados`),
    allOpen: n => (n === 1 ? 'o único está aberto' : `os ${n} estão abertos`),
    inModule: 'na segurança do trabalho',
  },
  fields: [
    { input: 'tipo', label: 'tipo', plural: 'tipos' },
    { input: 'local', label: 'local', plural: 'locais' },
    { input: 'consequencia', label: 'consequência', plural: 'consequências', multi: true },
    { input: 'probabilidade', label: 'probabilidade', plural: 'probabilidades', multi: true },
    { input: 'tst', label: 'TST', plural: 'TSTs' },
  ],
  groupings: [
    { value: 'tipo', label: 'tipo de apontamento', aliases: [] },
    { value: 'local', label: 'local', aliases: [] },
    { value: 'consequencia', label: 'consequência do risco', aliases: ['risco'] },
    { value: 'probabilidade', label: 'probabilidade do risco', aliases: [] },
    { value: 'mes', label: 'mês do apontamento', aliases: ['mensal', 'meses'] },
    { value: 'tst', label: 'quem lançou (TST)', aliases: ['autor', 'tecnico'] },
    { value: 'nenhum', label: 'nenhum', aliases: ['nada', 'sem'] },
  ],
  defaultGroup: 'tipo',
  columns: 'tipo | risco (consequência · probabilidade) | local | descrição | apontado em | dias | situação | TST | fotos',
  legend:
    '(dias: os "Dias para resolver" da planilha, até hoje se aberto ou até a correção se finalizado; fotos: do apontamento + da correção)',
  fieldHint: 'tipo, local, consequência',
  extra: rows => {
    const open = rows.filter(row => row.open);
    if (!open.length) return undefined;
    const counts = SAFETY_CONSEQUENCES.map(c => [c, open.filter(row => row.consequence === c).length] as const).filter(([, n]) => n);
    return `Abertos por consequência: ${counts.map(([c, n]) => `${c} ${n}`).join(' · ')}`;
  },
};

function safetyRows(entry: ModuleReportEntry<SafetyData>, workIndex: number, today: string): WorkRows {
  const data = entry.data;
  const extra = data as SafetyData & SafetyNames;
  const names = new Map<string, string>();
  for (const person of [...(extra.inspectors ?? []), ...(extra.users ?? [])])
    if (person?.id && person.name?.trim() && !names.has(person.id)) names.set(person.id, person.name.trim());
  const index = indexSafety(data);
  let unnamed = 0;
  // Ordem padrão da aba 6 (o mais recente primeiro, depois a ordem dos tipos): é o desempate da lista.
  const rows = [...data.items].sort(compareSafetyItems(index)).map((item, rank): ReportRow => {
    const type = safetyTypeName(index, item);
    const location = locationLabel(index, item);
    const open = item.status === 'open';
    const fromSheet = item.origin === 'planilha';
    const author = fromSheet ? SPREADSHEET_AUTHOR : (names.get(item.createdBy) ?? '');
    if (!fromSheet && !author) unnamed++;
    const issue = photosOfKind(index, item.id, 'issue').length;
    const correction = photosOfKind(index, item.id, 'correction').length;
    const month = item.observedOn.slice(0, 7);
    const days = safetyDays(item, today);
    const note = item.resolutionNote ? `: ${clip(item.resolutionNote, NOTE_CHARS)}` : '';
    const situation = open ? 'aberto' : `finalizado${item.correctedOn ? ` em ${dmy(item.correctedOn)}` : ''}${note}`;
    return {
      workIndex,
      workName: entry.workName,
      rank,
      open,
      observedOn: item.observedOn,
      correctedOn: item.correctedOn,
      days,
      issuePhotos: issue,
      correctionPhotos: correction,
      fields: { tipo: type, local: location, consequencia: item.consequence, probabilidade: item.probability, tst: author },
      // A busca da tela (`filterItems`, safety-view.ts): descrição, local, tipo e "como foi corrigido".
      haystack: keyOf([item.description, item.location, type, item.resolutionNote ?? ''].join(' ')),
      groups: {
        tipo:
          type && item.typeId
            ? { key: item.typeId, label: type, order: index.types.get(item.typeId)?.orderIndex ?? LAST }
            : { key: NONE, label: NO_SAFETY_TYPE_LABEL, order: LAST },
        local: location
          ? { key: locationKey(item.location), label: location, order: 0 }
          : { key: NONE, label: NO_LOCATION_LABEL, order: LAST },
        consequencia: { key: item.consequence, label: item.consequence, order: consequenceRank(item.consequence) },
        probabilidade: { key: item.probability, label: item.probability, order: probabilityRank(item.probability) },
        mes: { key: month, label: monthLabel(month), order: 0 },
        tst: fromSheet
          ? { key: 'planilha', label: `${SPREADSHEET_AUTHOR} (histórico importado)`, order: 0 }
          : author
            ? { key: `p:${item.createdBy}`, label: author, order: 0 }
            : { key: NONE, label: UNKNOWN_AUTHOR, order: LAST },
      },
      cells: [
        type || '-',
        `${item.consequence} · ${item.probability}`,
        location || '-',
        clip(item.description, DESCRIPTION_CHARS) || '-',
        dmy(item.observedOn),
        String(days),
        situation,
        fromSheet ? 'Planilha SST' : author || UNKNOWN_AUTHOR,
        `${issue}+${correction}`,
      ],
      brief: `${type || NO_SAFETY_TYPE_LABEL} · ${location || 'sem local'} · ${item.consequence} · ${clip(item.description, BRIEF_CHARS)}`,
      consequence: item.consequence,
    };
  });
  return {
    workName: entry.workName,
    rows,
    options: {
      tipo: data.types.map(t => t.name),
      consequencia: [...SAFETY_CONSEQUENCES],
      probabilidade: [...SAFETY_PROBABILITIES],
      tst: [...names.values(), SPREADSHEET_AUTHOR],
    },
    notes: unnamed ? [`há lançamentos feitos no sistema sem o nome de quem lançou nos dados; aparecem como "${UNKNOWN_AUTHOR}".`] : [],
  };
}

export function safetyReport(entries: ModuleReportEntry<SafetyData>[], input: Record<string, unknown>, today: string): string {
  return runReport(
    SAFETY,
    entries.map((entry, w) => safetyRows(entry, w, today)),
    input,
    today,
  );
}
