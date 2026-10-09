/** Importação do histórico do curto prazo (compromissos semanais do Last Planner) a partir do CSV
 * normalizado que sai das planilhas do Google de cada obra. Este módulo é puro: lê o texto,
 * valida e aplica os comandos do domínio num rascunho (`PlanningData`). Quem grava é o chamador
 * — o script `scripts/import-curto-prazo.ts` roda isto dentro de uma única transação por obra.
 *
 * Formato do CSV (UTF-8, separador `;`, primeira linha é o cabeçalho, uma linha por linha da planilha):
 *
 *   obra;empresa;semana;inicio;termino;atividade;equipe;status;causa;justificativa
 *
 * - obra: nome da obra, comparado sem acento e sem caixa com `works.name` (ou criada com
 *   `createWorks`; com `workId` a coluna é ignorada).
 * - empresa: fornecedor (`supplier` do compromisso e `company` da equipe).
 * - semana: data ISO (AAAA-MM-DD) da segunda-feira; outra data vira a segunda daquela semana.
 * - inicio, termino: datas ISO dentro da semana (segunda a domingo). Em branco: inicio = semana,
 *   termino = inicio.
 * - atividade: texto livre, obrigatório (`name` do compromisso).
 * - equipe: opcional; reaproveita a equipe da obra com mesmo nome e empresa (sem acento/caixa) ou cria.
 * - status: `Sim`, `Não`/`Nao` ou em branco (ainda não apurado).
 * - causa: obrigatória quando status = Não; uma das NON_FULFILLMENT_CAUSES (sem acento/caixa) ou
 *   uma chave do mapa de causas.
 * - justificativa: texto livre, opcional.
 *
 * Idempotência: a linha é identificada pela chave natural (obra, semana, início, término,
 * atividade normalizada, empresa normalizada, equipe). Entre linhas de mesma chave, cada uma casa
 * primeiro com o compromisso gravado de mesmo apontamento; as que sobram casam pela ordem de
 * ocorrência (CSV × createdAt). O que casa não é recriado — só tem o apontamento atualizado
 * quando o CSV traz um status diferente do gravado. Compromissos criados recebem createdAt
 * distintos, na ordem do CSV. */
import type { LocalDate, NonFulfillmentCause, PlanningData, Team, WeeklyCommitment } from '../../domain/entities';
import { NON_FULFILLMENT_CAUSES } from '../../domain/entities';
import { ppcSeries, type WeekPpc } from '../../domain/rules';
import { addDays, startOfWeek, validateDate } from '../../domain/validation';
import { applyCommand, type CommandContext } from './commands';

export const IMPORT_COLUMNS = [
  'obra',
  'empresa',
  'semana',
  'inicio',
  'termino',
  'atividade',
  'equipe',
  'status',
  'causa',
  'justificativa',
] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

/** Capacidade da equipe criada pela importação — a mesma que a planilha semanal usa ao criar
 * uma equipe digitada na linha (`NEW_TEAM_CAPACITY` em commitments-overview.tsx). */
export const IMPORTED_TEAM_CAPACITY = 3;

export interface ImportIssue {
  line?: number;
  message: string;
}
export interface ImportRow {
  line: number;
  obra: string;
  supplier: string;
  weekStart: LocalDate;
  startDate: LocalDate;
  endDate: LocalDate;
  name: string;
  team?: string;
  /** `true` = Sim, `false` = Não, indefinido = não apurado. */
  fulfilled?: boolean;
  cause?: NonFulfillmentCause;
  justification?: string;
}
export type CausesMap = Map<string, NonFulfillmentCause>;

/** Sem acento, minúsculo, espaços colapsados — a comparação que a importação usa para obra,
 * equipe, empresa, atividade, status e causa. */
export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** CSV no padrão RFC 4180 com separador configurável: campos entre aspas podem conter o
 * separador, quebras de linha e aspas dobradas (`""`). `line` é a linha física onde o registro
 * começa (o cabeçalho é a linha 1). */
export function parseCsv(text: string, separator = ';'): { line: number; fields: string[] }[] {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: { line: number; fields: string[] }[] = [];
  let fields: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let recordLine = 1;
  let fieldStarted = false;
  const endRecord = () => {
    fields.push(field);
    records.push({ line: recordLine, fields });
    fields = [];
    field = '';
    fieldStarted = false;
  };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else {
        if (char === '\n') line++;
        field += char;
      }
      continue;
    }
    if (char === '"' && !fieldStarted) {
      quoted = true;
      fieldStarted = true;
    } else if (char === separator) {
      fields.push(field);
      field = '';
      fieldStarted = false;
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      endRecord();
      line++;
      recordLine = line;
    } else {
      field += char;
      fieldStarted = true;
    }
  }
  if (quoted) throw new Error(`Aspas sem fechamento no registro que começa na linha ${recordLine}.`);
  if (field !== '' || fields.length > 0) endRecord();
  return records;
}

/** Mapa de causas da planilha para a lista oficial: `{"texto da planilha": "causa oficial"}`.
 * O valor também é comparado sem acento e sem caixa; valor fora da lista é erro. */
export function loadCausesMap(json: unknown): CausesMap {
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('O mapa de causas deve ser um objeto JSON.');
  const map: CausesMap = new Map();
  const invalid: string[] = [];
  for (const [from, to] of Object.entries(json as Record<string, unknown>)) {
    const cause = typeof to === 'string' ? officialCause(to) : undefined;
    if (!cause) invalid.push(`"${from}" → ${JSON.stringify(to)}`);
    else map.set(normalizeText(from), cause);
  }
  if (invalid.length) throw new Error(`Mapa de causas aponta para causas fora da lista oficial: ${invalid.join('; ')}.`);
  return map;
}
function officialCause(text: string): NonFulfillmentCause | undefined {
  const key = normalizeText(text);
  return NON_FULFILLMENT_CAUSES.find(cause => normalizeText(cause) === key);
}
export function resolveCause(text: string, map?: CausesMap): NonFulfillmentCause | undefined {
  return officialCause(text) ?? map?.get(normalizeText(text));
}

const isoDate = (value: string, label: string): string => {
  try {
    validateDate(value);
  } catch {
    throw new Error(`${label} inválida: "${value}" (use AAAA-MM-DD).`);
  }
  return value;
};

export interface ParseResult {
  rows: ImportRow[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
  /** Causas do CSV que não estão na lista nem no mapa, com quantas linhas usam cada uma. */
  unmappedCauses: Map<string, number>;
}

/** Lê e valida o CSV normalizado. Linhas com erro ficam fora de `rows`; linhas inteiramente em
 * branco são ignoradas. */
export function parseCommitmentsCsv(text: string, options: { causesMap?: CausesMap; requireObra?: boolean } = {}): ParseResult {
  const result: ParseResult = { rows: [], errors: [], warnings: [], unmappedCauses: new Map() };
  let records: { line: number; fields: string[] }[];
  try {
    records = parseCsv(text);
  } catch (error) {
    result.errors.push({ message: (error as Error).message });
    return result;
  }
  const header = records.shift();
  if (!header) {
    result.errors.push({ message: 'Arquivo vazio: falta o cabeçalho.' });
    return result;
  }
  const names = header.fields.map(normalizeText);
  const index = new Map<ImportColumn, number>();
  for (const column of IMPORT_COLUMNS) {
    const at = names.indexOf(column);
    if (at >= 0) index.set(column, at);
  }
  const missing = IMPORT_COLUMNS.filter(c => !index.has(c));
  if (missing.length) {
    result.errors.push({
      line: header.line,
      message: `Cabeçalho sem as colunas: ${missing.join(', ')}. Esperado: ${IMPORT_COLUMNS.join(';')}.`,
    });
    return result;
  }
  const extra = header.fields.filter((_, i) => !(IMPORT_COLUMNS as readonly string[]).includes(names[i]));
  if (extra.length) result.warnings.push({ line: header.line, message: `Colunas ignoradas: ${extra.join(', ')}.` });
  for (const record of records) {
    const get = (column: ImportColumn) => (record.fields[index.get(column)!] ?? '').trim();
    if (record.fields.every(f => !f.trim())) continue;
    const errors: string[] = [];
    const attempt = <T>(fn: () => T): T | undefined => {
      try {
        return fn();
      } catch (error) {
        errors.push((error as Error).message);
        return undefined;
      }
    };
    const obra = get('obra');
    if (!obra && options.requireObra !== false) errors.push('Obra é obrigatória (ou use --work-id).');
    const name = get('atividade');
    if (!name) errors.push('Atividade é obrigatória.');
    const semana = get('semana');
    let weekStart: string | undefined;
    if (!semana) errors.push('Semana é obrigatória.');
    else weekStart = attempt(() => startOfWeek(isoDate(semana, 'Semana')));
    let startDate: string | undefined;
    let endDate: string | undefined;
    if (weekStart) {
      const inicio = get('inicio'),
        termino = get('termino');
      startDate = inicio ? attempt(() => isoDate(inicio, 'Início')) : weekStart;
      endDate = termino ? attempt(() => isoDate(termino, 'Término')) : startDate;
      const weekEnd = addDays(weekStart, 6);
      if (startDate && endDate) {
        if (endDate < startDate) errors.push(`Término (${endDate}) antes do início (${startDate}).`);
        else if (startDate < weekStart || endDate > weekEnd)
          errors.push(`Período ${startDate} a ${endDate} fora da semana ${weekStart} a ${weekEnd}.`);
      }
    }
    const supplier = get('empresa');
    const team = get('equipe') || undefined;
    if (team && !supplier) errors.push('Equipe informada sem empresa: a equipe da obra é cadastrada por empresa.');
    const statusText = normalizeText(get('status'));
    const causeText = get('causa');
    const justification = get('justificativa') || undefined;
    let fulfilled: boolean | undefined;
    let cause: NonFulfillmentCause | undefined;
    if (statusText === 'sim') fulfilled = true;
    else if (statusText === 'nao') fulfilled = false;
    else if (statusText) errors.push(`Status "${get('status')}" inválido: use Sim, Não ou deixe em branco.`);
    if (fulfilled === false) {
      if (!causeText) errors.push('Causa é obrigatória quando o status é Não.');
      else {
        cause = resolveCause(causeText, options.causesMap);
        if (!cause) {
          errors.push(`Causa "${causeText}" fora da lista oficial; mapeie-a em --causes-map.`);
          result.unmappedCauses.set(causeText, (result.unmappedCauses.get(causeText) ?? 0) + 1);
        }
      }
    } else if (causeText)
      result.warnings.push({
        line: record.line,
        message: `Causa "${causeText}" ignorada: só vale quando o status é Não.`,
      });
    if (justification && fulfilled === undefined)
      result.warnings.push({ line: record.line, message: 'Justificativa ignorada: a linha não tem status apurado.' });
    if (errors.length) {
      for (const message of errors) result.errors.push({ line: record.line, message });
      continue;
    }
    result.rows.push({
      line: record.line,
      obra,
      supplier,
      weekStart: weekStart!,
      startDate: startDate!,
      endDate: endDate!,
      name,
      team,
      fulfilled,
      cause,
      justification: fulfilled === undefined ? undefined : justification,
    });
  }
  return result;
}

export interface ImportGroup {
  /** Chave do grupo: o `workId` informado ou o nome da obra normalizado. */
  key: string;
  obra: string;
  workId?: string;
  rows: ImportRow[];
}
/** Uma obra por grupo, na ordem em que aparece no arquivo. Com `workId`, tudo vai para ela. */
export function groupRowsByWork(rows: ImportRow[], workId?: string): ImportGroup[] {
  const groups = new Map<string, ImportGroup>();
  for (const row of rows) {
    const key = workId ?? normalizeText(row.obra);
    let group = groups.get(key);
    if (!group) groups.set(key, (group = { key, obra: row.obra, workId, rows: [] }));
    group.rows.push(row);
  }
  return [...groups.values()];
}

/** O apontamento importado é datado no sábado da semana (meio-dia em São Paulo), e não no
 * momento da importação — para o histórico dizer quando a semana foi apurada. Semana que ainda
 * não chegou ao sábado fica com o momento da importação. */
export function recordedAtFor(weekStart: LocalDate, now: string): string {
  const saturday = `${addDays(weekStart, 5)}T15:00:00.000Z`;
  return saturday < now ? saturday : now;
}

const teamKey = (company: string, name: string) => `${normalizeText(company)}|${normalizeText(name)}`;
const commitmentKey = (c: { weekStart: string; startDate: string; endDate: string; name: string; supplier: string }, teamId = '') =>
  [c.weekStart, c.startDate, c.endDate, normalizeText(c.name), normalizeText(c.supplier), teamId].join('|');

/** Código gerado para a obra criada pela importação: o nome em maiúsculas, sem acento, único. */
export function workCodeFor(name: string, data: PlanningData): string {
  const base =
    normalizeText(name)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'OBRA';
  let code = base;
  for (let n = 2; data.works.some(w => w.code.toLowerCase() === code.toLowerCase()); n++) code = `${base}-${n}`;
  return code;
}

export interface ImportOptions {
  context: CommandContext;
  createWorks?: boolean;
  /** Na gravação: a obra que a simulação resolveu. Se o banco resolver outra (obra criada ou
   * renomeada entre a simulação e a gravação), a importação para em vez de duplicar linhas. */
  expectedWorkId?: string | null;
}
export interface WorkImportResult {
  key: string;
  obra: string;
  workId?: string;
  workName?: string;
  createdWork?: { name: string; code: string };
  rows: number;
  created: number;
  updated: number;
  unchanged: number;
  teamsCreated: { company: string; name: string }[];
  teamsReused: number;
  companies: string[];
  weeks?: { first: LocalDate; last: LocalDate; count: number };
  fulfilled: number;
  notFulfilled: number;
  pending: number;
  ppc: WeekPpc[];
  /** Compromissos que já estavam na obra e não correspondem a nenhuma linha do CSV — não são tocados. */
  untouchedExisting: number;
  errors: ImportIssue[];
  warnings: ImportIssue[];
}

/** Ator da importação: precisa existir e ser admin. A carga do histórico é operação administrativa e,
 * desde 08/10/2026, semana passada fica encerrada para quem não é admin (`domain/week-lock.ts`). */
export function checkImportActor(data: PlanningData, actorId: string) {
  const actor = data.users.find(u => u.id === actorId);
  if (!actor) throw new Error(`Perfil ${actorId} não encontrado.`);
  if (actor.role !== 'admin') throw new Error(`O perfil ${actor.name} é ${actor.role}; a importação exige admin.`);
  return actor;
}

const lines = (rows: ImportRow[]) => {
  const all = rows.map(r => r.line);
  return all.length > 8 ? `${all.slice(0, 8).join(', ')}… (${all.length} linhas)` : all.join(', ');
};

/** Aplica as linhas de uma obra no rascunho, pelos comandos do domínio. Erros de linha são
 * coletados com o número da linha, e a linha com erro fica de fora — quem grava deve descartar o
 * rascunho quando `errors` não estiver vazio. Erro de ator lança exceção. */
export function importGroup(draft: PlanningData, group: ImportGroup, options: ImportOptions): WorkImportResult {
  const { context } = options;
  const actor = checkImportActor(draft, context.actorId);
  const result: WorkImportResult = {
    key: group.key,
    obra: group.obra,
    rows: group.rows.length,
    created: 0,
    updated: 0,
    unchanged: 0,
    teamsCreated: [],
    teamsReused: 0,
    companies: [],
    fulfilled: 0,
    notFulfilled: 0,
    pending: 0,
    ppc: [],
    untouchedExisting: 0,
    errors: [],
    warnings: [],
  };
  const run = (command: Parameters<typeof applyCommand>[1]) => applyCommand(draft, command, context);

  // 1. A obra.
  let workId: string | undefined;
  if (group.workId) {
    if (!draft.works.some(w => w.id === group.workId)) result.errors.push({ message: `Obra ${group.workId} (--work-id) não encontrada.` });
    else workId = group.workId;
    const names = new Set(group.rows.map(r => normalizeText(r.obra)).filter(Boolean));
    if (names.size > 1)
      result.warnings.push({ message: `Coluna obra com ${names.size} valores diferentes, ignorada por causa de --work-id.` });
  } else {
    const matches = draft.works.filter(w => normalizeText(w.name) === group.key);
    if (matches.length > 1)
      result.errors.push({
        message: `Obra "${group.obra}" é ambígua: ${matches.map(w => `${w.name} (${w.id})`).join(', ')}. Use --work-id.`,
      });
    else if (matches.length === 1) workId = matches[0].id;
    else if (options.createWorks) {
      if (options.expectedWorkId) throw new Error(`A obra "${group.obra}" sumiu entre a simulação e a gravação.`);
      const code = workCodeFor(group.obra, draft);
      try {
        workId = run({ type: 'create_work', name: group.obra, code });
        result.createdWork = { name: group.obra, code };
      } catch (error) {
        result.errors.push({ message: `Não foi possível criar a obra "${group.obra}": ${(error as Error).message}` });
      }
    } else
      result.errors.push({
        message: `Obra "${group.obra}" não encontrada (linhas ${lines(group.rows)}). Use --create-works ou --work-id.`,
      });
  }
  if (options.expectedWorkId !== undefined && !result.createdWork && (options.expectedWorkId ?? undefined) !== workId)
    throw new Error(`A obra "${group.obra}" resolveu para outro cadastro na gravação; rode a simulação de novo.`);
  if (!workId) return result;
  result.workId = workId;
  result.workName = draft.works.find(w => w.id === workId)!.name;
  if (!actor.workIds.includes(workId)) {
    result.errors.push({ message: `O perfil ${actor.name} não tem acesso à obra ${result.workName}. Conceda o acesso antes de importar.` });
    return result;
  }

  // 2. As equipes: reaproveita por (empresa, nome) sem acento/caixa, cria as que faltam.
  const teams = new Map<string, Team>();
  for (const team of draft.teams) if (team.workId === workId) teams.set(teamKey(team.company, team.name), team);
  const reused = new Set<string>();
  const teamIdOf = new Map<ImportRow, string>();
  const failed = new Set<ImportRow>();
  for (const row of group.rows) {
    if (!row.team) continue;
    const key = teamKey(row.supplier, row.team);
    let team = teams.get(key);
    if (team) reused.add(team.id);
    else {
      try {
        const id = run({ type: 'create_team', workId, company: row.supplier, name: row.team, weeklyCapacity: IMPORTED_TEAM_CAPACITY });
        team = draft.teams.find(t => t.id === id)!;
        teams.set(key, team);
        result.teamsCreated.push({ company: team.company, name: team.name });
      } catch (error) {
        result.errors.push({ line: row.line, message: `Equipe "${row.team}": ${(error as Error).message}` });
        failed.add(row);
        continue;
      }
    }
    teamIdOf.set(row, team.id);
  }
  result.teamsReused = reused.size;

  // 3. Os compromissos, casando pela chave natural. Dentro de uma chave, primeiro cada linha
  // casa com o compromisso de mesmo apontamento (Realizado, causa, justificativa); o que sobra
  // casa pela ordem (CSV × createdAt, id). Casar só pela ordem trocava apontamentos entre linhas
  // iguais: compromissos de uma mesma importação nasciam com o mesmo createdAt e ficavam
  // ordenados pelo id aleatório, e a reimportação "atualizava" as duas linhas cruzadas.
  const existing = new Map<string, WeeklyCommitment[]>();
  const sorted = draft.commitments
    .filter(c => c.workId === workId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  for (const c of sorted) {
    const key = commitmentKey(c, c.teamId);
    existing.set(key, [...(existing.get(key) ?? []), c]);
  }
  const sameRecord = (c: WeeklyCommitment, row: ImportRow) =>
    (c.fulfilled ?? undefined) === row.fulfilled &&
    (c.cause ?? undefined) === (row.fulfilled ? undefined : row.cause) &&
    (c.justification ?? '') === (row.justification ?? '');
  const rowsByKey = new Map<string, ImportRow[]>();
  for (const row of group.rows) {
    if (failed.has(row)) continue;
    const key = commitmentKey(row, teamIdOf.get(row));
    rowsByKey.set(key, [...(rowsByKey.get(key) ?? []), row]);
  }
  const pairedWith = new Map<ImportRow, WeeklyCommitment>();
  for (const [key, rows] of rowsByKey) {
    const free = [...(existing.get(key) ?? [])];
    const rest: ImportRow[] = [];
    for (const row of rows) {
      const at = free.findIndex(c => sameRecord(c, row));
      if (at >= 0) pairedWith.set(row, free.splice(at, 1)[0]);
      else rest.push(row);
    }
    rest.forEach((row, i) => {
      if (free[i]) pairedWith.set(row, free[i]);
    });
  }
  const matched = new Set<string>();
  const touched: WeeklyCommitment[] = [];
  const record = (row: ImportRow, commitmentId: string) => {
    run({ type: 'record_fulfillment', commitmentId, fulfilled: row.fulfilled!, cause: row.cause, justification: row.justification });
    const commitment = draft.commitments.find(c => c.id === commitmentId)!;
    commitment.recordedAt = recordedAtFor(commitment.weekStart, context.now);
  };
  for (const row of group.rows) {
    if (failed.has(row)) continue;
    const teamId = teamIdOf.get(row);
    const current = pairedWith.get(row);
    try {
      if (current) {
        matched.add(current.id);
        const differs = row.fulfilled !== undefined && !sameRecord(current, row);
        if (differs) {
          record(row, current.id);
          result.updated++;
        } else {
          if (row.fulfilled === undefined && current.fulfilled !== undefined)
            result.warnings.push({
              line: row.line,
              message: 'Linha sem status no CSV já está apurada no sistema; o apontamento foi mantido.',
            });
          result.unchanged++;
        }
        touched.push(current);
      } else {
        const id = run({
          type: 'create_commitment',
          workId,
          name: row.name,
          weekStart: row.weekStart,
          responsibleId: actor.id,
          supplier: row.supplier,
          teamId: teamId ?? null,
          startDate: row.startDate,
          endDate: row.endDate,
        });
        if (row.fulfilled !== undefined) record(row, id);
        const commitment = draft.commitments.find(c => c.id === id)!;
        // createdAt distinto e na ordem do CSV (1 ms por linha criada): o comando carimba todas
        // as linhas da transação com o mesmo `now`, e a ordem de inclusão (planilha e reimportação)
        // ficaria pelo id aleatório.
        commitment.createdAt = new Date(Date.parse(context.now) + result.created).toISOString();
        if (commitment.updatedAt < commitment.createdAt) commitment.updatedAt = commitment.createdAt;
        result.created++;
        touched.push(commitment);
      }
    } catch (error) {
      result.errors.push({ line: row.line, message: (error as Error).message });
    }
  }
  result.untouchedExisting = sorted.filter(c => !matched.has(c.id)).length;

  // 4. O resumo, lido do estado resultante.
  const companies = new Map<string, string>();
  for (const c of touched)
    if (c.supplier && !companies.has(normalizeText(c.supplier))) companies.set(normalizeText(c.supplier), c.supplier);
  result.companies = [...companies.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  result.fulfilled = touched.filter(c => c.fulfilled === true).length;
  result.notFulfilled = touched.filter(c => c.fulfilled === false).length;
  result.pending = touched.filter(c => c.fulfilled === undefined).length;
  result.ppc = ppcSeries(touched);
  if (result.ppc.length)
    result.weeks = { first: result.ppc[0].weekStart, last: result.ppc[result.ppc.length - 1].weekStart, count: result.ppc.length };
  return result;
}
