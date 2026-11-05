import {
  SAFETY_CONSEQUENCES,
  SAFETY_LIMITS,
  SAFETY_PROBABILITIES,
  safetyPhotoPaths,
  type SafetyCommand,
  type SafetyConsequence,
  type SafetyData,
  type SafetyItem,
  type SafetyPhoto,
  type SafetyPhotoKind,
  type SafetyProbability,
  type SafetyType,
} from '../../domain/safety';
import { planSafetyCommand, SAFETY_TABLES, type SafetyContext, type SafetyMutation, type SafetyRowSet } from './safety-commands';

/**
 * Importação da planilha "SST - Controle geral" (aba SST) para a aba 6 (05/11/2026). Recebe a planilha
 * exportada em CSV e devolve o que gravar, passando cada linha pelos mesmos comandos da tela
 * (`planSafetyCommand`, com `importing: true`): o que a aba recusaria, a importação também recusa — com
 * duas diferenças de propósito da importação, que estão no planejador: o apontamento nasce com origem
 * `planilha` e a finalização dispensa a foto da correção (as fotos da planilha vêm numa passada posterior).
 * Puro, sem banco nem arquivos; o script (`scripts/import-seguranca.ts`) lê, baixa as fotos e grava.
 *
 * Idempotência: o id do apontamento sai do conteúdo da linha (obra, tipo, descrição, local e data, como
 * a planilha os escreveu) mais a ocorrência, para linhas idênticas. Rodar de novo não duplica, só
 * acrescenta apontamento novo, finalização nova e foto nova. Apontamento já gravado nunca tem os campos
 * sobrescritos, porque o TST pode ter corrigido na tela o que a planilha mantém errado.
 */

// ----- CSV (RFC 4180) -----

/** Lê CSV no formato RFC 4180: campo entre aspas pode ter vírgula, quebra de linha e aspas dobradas.
 * Aceita CRLF ou LF e ignora o BOM. Aspas no meio de um campo sem aspas ficam como texto. */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  let fieldStarted = false;
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"' && !fieldStarted) {
      quoted = true;
      fieldStarted = true;
    } else if (ch === ',') {
      record.push(field);
      field = '';
      fieldStarted = false;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      fieldStarted = false;
    } else {
      field += ch;
      fieldStarted = true;
    }
  }
  if (fieldStarted || record.length) {
    record.push(field);
    records.push(record);
  }
  return records;
}

/** Colunas usadas, achadas pelo nome do cabeçalho (sem acento nem caixa), não pela posição. "Dias para
 * resolver" é fórmula da planilha e fica de fora: a aba calcula (`safetyDays`). */
export const SST_HEADERS = {
  obra: 'Obra',
  tipo: 'Tipo de apontamento',
  consequencia: 'Risco: consequência',
  probabilidade: 'Risco: Probabilidade',
  descricao: 'Descrição',
  local: 'Local',
  observado: 'Data do apontamento',
  fotoApontamento: 'Foto do apontamento',
  corrigido: 'Data de correção',
  fotoCorrecao: 'Foto da correção',
} as const;

export type SheetRecord = { row: number } & Record<keyof typeof SST_HEADERS, string>;

/** Registros da aba SST. `row` é a linha da planilha (cabeçalho na 1, primeiro registro na 2), contada
 * por registro, não por linha do arquivo: um campo com quebra de linha não desloca a numeração. Registro
 * sem nada nas colunas usadas (o fim da planilha, onde só a fórmula de dias aparece) é pulado em silêncio. */
export function readSheet(records: string[][]): { rows: SheetRecord[]; blank: number } {
  const [header, ...data] = records;
  if (!header) throw new Error('O CSV está vazio.');
  const headerKeys = header.map(safetyKey);
  const index = {} as Record<keyof typeof SST_HEADERS, number>;
  const missing: string[] = [];
  for (const [field, label] of Object.entries(SST_HEADERS) as [keyof typeof SST_HEADERS, string][]) {
    index[field] = headerKeys.indexOf(safetyKey(label));
    if (index[field] < 0) missing.push(label);
  }
  if (missing.length) throw new Error(`Colunas não encontradas no cabeçalho: ${missing.join(', ')}.`);
  const rows: SheetRecord[] = [];
  let blank = 0;
  data.forEach((cells, i) => {
    const record = { row: i + 2 } as SheetRecord;
    for (const field of Object.keys(SST_HEADERS) as (keyof typeof SST_HEADERS)[]) record[field] = cells[index[field]] ?? '';
    if (Object.keys(SST_HEADERS).every(field => !record[field as keyof typeof SST_HEADERS].trim())) blank++;
    else rows.push(record);
  });
  return { rows, blank };
}

// ----- Normalização -----

const clean = (value: string | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
const stripAccents = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '');
/** Chave de comparação de nomes: sem acento, caixa nem pontuação ("SPIQ - Linha de Vida", "SPIQ (Linha de
 * vida)" e "SPIQ – Linha de Vida" são a mesma). */
export const safetyKey = (value: string) =>
  stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
/** Chave mais estrita, só acento, caixa e espaços: usada nos locais e na identidade da linha. */
const looseKey = (value: string) => stripAccents(clean(value)).toLowerCase();

/** Tudo minúsculo (e com alguma letra): só a primeira letra sobe. O resto fica como foi digitado. */
export function capitalizeIfLower(value: string): string {
  if (!value || value !== value.toLocaleLowerCase('pt-BR') || !/\p{L}/u.test(value)) return value;
  return value.charAt(0).toLocaleUpperCase('pt-BR') + value.slice(1);
}

/** Os 16 tipos que a migração 0040 semeia (aba "Página15" da planilha), com os mesmos ids. A simulação
 * usa esta lista quando a migração ainda não foi aplicada. */
export const SEEDED_SAFETY_TYPE_NAMES = [
  'Proteções periféricas',
  'SPIQ – Linha de Vida',
  'Máquinas e equipamentos',
  'Escada / Bancadas',
  'Elétrica irregular',
  'Fechamento de piso',
  'Área de vivência',
  'Instalações provisórias',
  'Sinalização',
  'Bandeja',
  'Documentação',
  "EPI's",
  'Organização / Limpeza',
  'Condições de trabalho',
  'Tela de Fachada',
  'Escavação',
] as const;

export const seededSafetyTypes = (now: string): SafetyType[] =>
  SEEDED_SAFETY_TYPE_NAMES.map((name, i) => ({
    id: `sst-tipo-${String(i + 1).padStart(2, '0')}`,
    name,
    orderIndex: i,
    active: true,
    createdAt: now,
    updatedAt: now,
  }));

/** Sinônimos claros, por chave: a grafia da planilha vira o tipo indicado (do catálogo ou novo). O resto
 * que não bate com o catálogo pela chave vira tipo novo, com o nome da primeira grafia vista. */
export const SAFETY_TYPE_SYNONYMS: Readonly<Record<string, string>> = {
  'escada bancadas rampas': 'Escada / Bancadas',
  escadas: 'Escada / Bancadas',
  escada: 'Escada / Bancadas',
  bancadas: 'Escada / Bancadas',
  'limpeza e organizacao': 'Organização / Limpeza',
  organizacao: 'Organização / Limpeza',
  'projetos sst': 'Projeto SST',
  // 05/11/2026, antes da primeira gravação: "Projeto" (1 linha) é o mesmo "Projeto SST"; as duas grafias
  // de condutores elétricos viram uma; dois erros de digitação corrigidos no nome do tipo.
  projeto: 'Projeto SST',
  'condutores eletricos extensoes': 'Condutores elétricos',
  'rico de queda': 'Risco de queda',
  'produtos inflamavel': 'Produtos inflamáveis',
};

/** Nome do tipo para uma grafia da planilha: sinônimo, ou a própria grafia limpa (só a primeira letra
 * sobe se estava tudo minúsculo). Vazio = sem tipo. Quem decide se é do catálogo é a chave. */
export function sheetTypeName(raw: string): string | undefined {
  const name = clean(raw);
  if (!name) return undefined;
  return SAFETY_TYPE_SYNONYMS[safetyKey(name)] ?? capitalizeIfLower(name);
}

export function parseConsequence(raw: string): SafetyConsequence | undefined {
  const key = safetyKey(raw);
  return key ? SAFETY_CONSEQUENCES.find(c => safetyKey(c) === key) : undefined;
}

/** Probabilidade; "Nenhum" (digitado uma vez na planilha) não existe na escala e vira a mais baixa, Rara. */
export function parseProbability(raw: string): { value?: SafetyProbability; fromNone?: boolean } {
  const key = safetyKey(raw);
  if (!key) return {};
  const value = SAFETY_PROBABILITIES.find(p => safetyKey(p) === key);
  if (value) return { value };
  if (key === 'nenhum' || key === 'nenhuma') return { value: 'Rara', fromNone: true };
  return {};
}

/** "2 pavimento", "02 pavimento", "2° Pavimento", "2ºPavimento", "2⁰pavimento", "2°andar". */
const FLOOR = /^0*(\d{1,3})\s*[°ºª⁰o]?\s*(?:pavimento|andar)$/i;
/** "2°" sozinho. */
const FLOOR_MARK = /^0*(\d{1,3})\s*[°º⁰]$/;
const LOCATION_WORDS: Readonly<Record<string, string>> = {
  terreo: 'Térreo',
  terriu: 'Térreo',
  atico: 'Ático',
  subsolo: 'Subsolo',
  mezanino: 'Mezanino',
};

/**
 * Local da planilha, com correção conservadora:
 * 1. espaços repetidos e quebras de linha viram um espaço; pontas aparadas;
 * 2. pavimento numerado ("2 pavimento", "02 pavimento", "2º Pavimento", "2°andar", "2°") vira "2° Pavimento";
 * 3. térreo/terreo/terriu vira "Térreo"; atico/ático em qualquer caixa, "Ático"; subsolo, "Subsolo";
 *    mezanino, "Mezanino" — só a palavra sozinha ("subsolo rampa" fica como está);
 * 4. o resto fica como foi digitado, e só a primeira letra sobe se estava tudo minúsculo.
 */
export function canonicalLocation(raw: string): string {
  const text = clean(raw);
  if (!text) return '';
  const floor = FLOOR.exec(text) ?? FLOOR_MARK.exec(text);
  if (floor) return `${Number(floor[1])}° Pavimento`;
  return LOCATION_WORDS[looseKey(text)] ?? capitalizeIfLower(text);
}

/**
 * Passo seguinte ao `canonicalLocation`, sobre os locais de uma obra: grafias que só diferem em acento ou
 * caixa ("Vestiário" e "VESTIÁRIO", "Carpintaria" e "Carpintária") ficam com uma só. Vale a já usada no
 * sistema (`preferred`, a mais frequente); senão, a mais frequente na planilha; empate, a primeira vista.
 * Devolve o mapa local canônico → grafia final.
 */
export function unifyLocations(values: string[], preferred: string[] = []): Map<string, string> {
  const tally = (list: string[]) => {
    const groups = new Map<string, Map<string, number>>();
    for (const value of list.filter(Boolean)) {
      const key = looseKey(value);
      const counts = groups.get(key) ?? new Map<string, number>();
      counts.set(value, (counts.get(value) ?? 0) + 1);
      groups.set(key, counts);
    }
    return groups;
  };
  const best = (counts: Map<string, number>) => [...counts].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  const fromSystem = tally(preferred);
  const fromSheet = tally(values);
  const result = new Map<string, string>();
  for (const [key, counts] of fromSheet) {
    const chosen = best(fromSystem.get(key) ?? counts);
    for (const value of counts.keys()) result.set(value, chosen);
  }
  return result;
}

const validIso = (year: number, month: number, day: number) => {
  const date = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : undefined;
};

/** "DD/MM/AAAA" em AAAA-MM-DD; inválida ou em outro formato, undefined. */
export function parseSheetDay(raw: string): string | undefined {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(clean(raw));
  return match ? validIso(Number(match[3]), Number(match[2]), Number(match[1])) : undefined;
}

export interface CorrectionDate {
  date?: string;
  /** `sem-ano`: "08/05" (ano do apontamento, ou o seguinte se ficaria antes dele); `ano-curto`: "27/10/25". */
  fixed?: 'sem-ano' | 'ano-curto';
  /** Havia texto, mas não deu para ler a data. */
  unreadable?: boolean;
}

/** Data de correção: DD/MM/AAAA; com ano de 2 dígitos (20AA) ou sem ano, lida com aviso. */
export function parseCorrectionDate(raw: string, observedOn: string): CorrectionDate {
  const text = clean(raw);
  if (!text) return {};
  const full = parseSheetDay(text);
  if (full) return { date: full };
  const short = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(text);
  if (short) {
    const date = validIso(2000 + Number(short[3]), Number(short[2]), Number(short[1]));
    return date ? { date, fixed: 'ano-curto' } : { unreadable: true };
  }
  const noYear = /^(\d{1,2})\/(\d{1,2})$/.exec(text);
  if (noYear) {
    const year = Number(observedOn.slice(0, 4));
    const sameYear = validIso(year, Number(noYear[2]), Number(noYear[1]));
    if (sameYear && sameYear >= observedOn) return { date: sameYear, fixed: 'sem-ano' };
    const nextYear = validIso(year + 1, Number(noYear[2]), Number(noYear[1]));
    return nextYear ? { date: nextYear, fixed: 'sem-ano' } : { unreadable: true };
  }
  return { unreadable: true };
}

/** Texto nas colunas de foto (a imagem não vem no CSV): vira observação. "?", "-" e uma data solta
 * (a mesma data de correção, repetida na coluna) não dizem nada e saem. */
export function photoColumnNote(raw: string): { note?: string; dateOnly?: boolean } {
  const text = clean(raw);
  if (!text || text === '?' || text === '-') return {};
  if (/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(text)) return { dateOnly: true };
  return { note: text };
}

// ----- Avisos e erros -----

export const SAFETY_IMPORT_WARNINGS = {
  'probabilidade-nenhum': 'Probabilidade "Nenhum" gravada como Rara',
  'correcao-sem-ano': 'Data de correção sem ano (ano deduzido do apontamento)',
  'correcao-ano-curto': 'Data de correção com ano de 2 dígitos (lido como 20AA)',
  'correcao-ilegivel': 'Data de correção ilegível; ficou aberto',
  'correcao-anterior': 'Correção antes do apontamento; ficou aberto',
  'correcao-futura': 'Correção no futuro; ficou aberto',
  'nota-data': 'Coluna de foto com só uma data; ignorada',
  'descricao-cortada': `Descrição com as observações passou de ${SAFETY_LIMITS.maxDescription} caracteres; cortada`,
  'nota-cortada': `"Como foi corrigido" passou de ${SAFETY_LIMITS.maxResolutionNote} caracteres; cortado`,
  'local-cortado': `Local passou de ${SAFETY_LIMITS.maxLocation} caracteres; cortado`,
  'tipo-desativado': 'Tipo desativado no sistema; importado sem tipo',
  'resolvido-no-sistema': 'Aberto na planilha e finalizado no sistema; mantido finalizado',
  'nao-finalizou': 'Corrigido na planilha, mas a finalização foi recusada; ficou aberto',
  'foto-url': 'Foto com endereço inválido; ignorada',
  'foto-recusada': 'Foto recusada pelas regras da aba',
  'foto-sem-linha': 'Foto de linha que não entra nesta importação',
} as const;
export const SAFETY_IMPORT_ERRORS = {
  'data-apontamento': 'Data do apontamento ilegível',
  consequencia: 'Consequência fora da lista',
  probabilidade: 'Probabilidade fora da lista',
  descricao: 'Sem descrição',
  recusado: 'Apontamento recusado pelas regras da aba',
} as const;
export type SafetyImportWarningKind = keyof typeof SAFETY_IMPORT_WARNINGS;
export type SafetyImportErrorKind = keyof typeof SAFETY_IMPORT_ERRORS;

export interface ImportIssue<K extends string = string> {
  row?: number;
  kind: K;
  message: string;
}

// ----- Linha normalizada -----

export interface NormalizedRow {
  row: number;
  obra: string;
  /** Grafias da planilha, para a identidade da linha (o id não muda se a normalização mudar). */
  rawType: string;
  rawDescription: string;
  rawLocation: string;
  /** Nome do tipo (catálogo, sinônimo ou novo); ausente = sem tipo. */
  typeName?: string;
  consequence: SafetyConsequence;
  probability: SafetyProbability;
  /** Descrição com as observações das colunas de foto ("… — Obs.: …"). */
  description: string;
  /** Local canônico (antes da unificação por obra). */
  location: string;
  observedOn: string;
  /** Presente se a linha deve entrar finalizada (data válida, não anterior ao apontamento nem futura). */
  correctedOn?: string;
  resolutionNote?: string;
  /** Quantas observações foram para a descrição. */
  notesInDescription: number;
}

/** Uma linha da planilha nos campos da aba. `today` = hoje (AAAA-MM-DD), para não finalizar no futuro. */
export function normalizeRecord(
  record: SheetRecord,
  today: string,
): { row?: NormalizedRow; warnings: ImportIssue<SafetyImportWarningKind>[]; errors: ImportIssue<SafetyImportErrorKind>[] } {
  const warnings: ImportIssue<SafetyImportWarningKind>[] = [];
  const errors: ImportIssue<SafetyImportErrorKind>[] = [];
  const warn = (kind: SafetyImportWarningKind, message: string) => warnings.push({ row: record.row, kind, message });
  const error = (kind: SafetyImportErrorKind, message: string) => errors.push({ row: record.row, kind, message });

  const observedOn = parseSheetDay(record.observado);
  if (!observedOn) error('data-apontamento', `Data do apontamento "${clean(record.observado)}" ilegível.`);
  const consequence = parseConsequence(record.consequencia);
  if (!consequence) error('consequencia', `Consequência "${clean(record.consequencia)}" fora da lista.`);
  const probability = parseProbability(record.probabilidade);
  if (!probability.value) error('probabilidade', `Probabilidade "${clean(record.probabilidade)}" fora da lista.`);
  else if (probability.fromNone) warn('probabilidade-nenhum', `Probabilidade "${clean(record.probabilidade)}" gravada como Rara.`);
  const base = clean(record.descricao);
  if (!base) error('descricao', 'Linha sem descrição.');
  if (errors.length || !observedOn || !consequence || !probability.value) return { warnings, errors };

  let correctedOn: string | undefined;
  const correction = parseCorrectionDate(record.corrigido, observedOn);
  if (correction.unreadable) warn('correcao-ilegivel', `Data de correção "${clean(record.corrigido)}" ilegível; ficou aberto.`);
  else if (correction.date) {
    if (correction.fixed === 'sem-ano')
      warn('correcao-sem-ano', `Data de correção "${clean(record.corrigido)}" lida como ${correction.date}.`);
    if (correction.fixed === 'ano-curto')
      warn('correcao-ano-curto', `Data de correção "${clean(record.corrigido)}" lida como ${correction.date}.`);
    if (correction.date < observedOn)
      warn('correcao-anterior', `Correção ${correction.date} antes do apontamento ${observedOn}; ficou aberto.`);
    else if (correction.date > today) warn('correcao-futura', `Correção ${correction.date} no futuro; ficou aberto.`);
    else correctedOn = correction.date;
  }

  const issueNote = photoColumnNote(record.fotoApontamento);
  const correctionNote = photoColumnNote(record.fotoCorrecao);
  if (issueNote.dateOnly) warn('nota-data', `"Foto do apontamento" com só a data "${clean(record.fotoApontamento)}"; ignorada.`);
  if (correctionNote.dateOnly) warn('nota-data', `"Foto da correção" com só a data "${clean(record.fotoCorrecao)}"; ignorada.`);
  const notes = [issueNote.note, correctedOn ? undefined : correctionNote.note].filter((n): n is string => Boolean(n));
  let description = [base, ...notes.map(n => `Obs.: ${n}`)].join(' — ');
  if (description.length > SAFETY_LIMITS.maxDescription) {
    warn('descricao-cortada', `Descrição com ${description.length} caracteres; cortada em ${SAFETY_LIMITS.maxDescription}.`);
    description = description.slice(0, SAFETY_LIMITS.maxDescription).trim();
  }
  let resolutionNote = correctedOn ? correctionNote.note : undefined;
  if (resolutionNote && resolutionNote.length > SAFETY_LIMITS.maxResolutionNote) {
    warn('nota-cortada', `"Como foi corrigido" com ${resolutionNote.length} caracteres; cortado.`);
    resolutionNote = resolutionNote.slice(0, SAFETY_LIMITS.maxResolutionNote).trim();
  }
  let location = canonicalLocation(record.local);
  if (location.length > SAFETY_LIMITS.maxLocation) {
    warn('local-cortado', `Local "${location}" cortado em ${SAFETY_LIMITS.maxLocation} caracteres.`);
    location = location.slice(0, SAFETY_LIMITS.maxLocation).trim();
  }

  return {
    row: {
      row: record.row,
      obra: clean(record.obra),
      rawType: clean(record.tipo),
      rawDescription: base,
      rawLocation: clean(record.local),
      typeName: sheetTypeName(record.tipo),
      consequence,
      probability: probability.value,
      description,
      location,
      observedOn,
      correctedOn,
      ...(resolutionNote ? { resolutionNote } : {}),
      notesInDescription: notes.length,
    },
    warnings,
    errors,
  };
}

// ----- Obras -----

export interface WorkRef {
  id: string;
  name: string;
  code: string;
}
export interface WorkMatch {
  obra: string;
  work: WorkRef;
  how: 'nome' | 'código' | 'indicada' | 'aproximada';
}

/** Obra do sistema para cada nome da planilha: a indicada em `overrides` (id ou código da obra), o nome ou
 * o código iguais (sem acento nem caixa), ou a única obra cujo nome contém o da planilha como palavra
 * ("Residencial Essenza"). A que não achar fica de fora: a importação nunca cria obra. */
export function matchWorks(
  obras: string[],
  works: WorkRef[],
  overrides: Record<string, string> = {},
): { matched: WorkMatch[]; unmatched: string[]; badOverrides: string[] } {
  const matched: WorkMatch[] = [];
  const unmatched: string[] = [];
  const badOverrides: string[] = [];
  const overrideByKey = new Map(Object.entries(overrides).map(([obra, target]) => [safetyKey(obra), { obra, target }]));
  for (const obra of obras) {
    const key = safetyKey(obra);
    const override = overrideByKey.get(key);
    if (override) {
      const work = works.find(w => w.id === override.target) ?? works.find(w => safetyKey(w.code) === safetyKey(override.target));
      if (work) matched.push({ obra, work, how: 'indicada' });
      else badOverrides.push(`${override.obra} → ${override.target}`);
      continue;
    }
    const byName = works.find(w => safetyKey(w.name) === key);
    const byCode = byName ? undefined : works.find(w => safetyKey(w.code) === key);
    const near = byName || byCode ? [] : works.filter(w => ` ${safetyKey(w.name)} `.includes(` ${key} `));
    if (byName) matched.push({ obra, work: byName, how: 'nome' });
    else if (byCode) matched.push({ obra, work: byCode, how: 'código' });
    else if (key && near.length === 1) matched.push({ obra, work: near[0], how: 'aproximada' });
    else unmatched.push(obra);
  }
  return { matched, unmatched, badOverrides };
}

// ----- Plano -----

/** Fotos por linha da planilha, para a passada posterior: `{ "<linha>": { "issue": [url], "correction": [url] } }`. */
export type PhotoSources = Record<string, { issue?: string[]; correction?: string[] }>;

/** Arquivo a baixar, comprimir e enviar ao bucket antes de gravar as linhas. */
export interface PhotoUpload {
  row: number;
  workId: string;
  itemId: string;
  photoId: string;
  kind: SafetyPhotoKind;
  url: string;
  storagePath: string;
  thumbPath: string;
}

export interface WorkTarget {
  /** Nome da obra como está na planilha. */
  obra: string;
  workId: string;
  workName: string;
  /** Apontamentos e fotos já gravados nesta obra. */
  items: SafetyItem[];
  photos: SafetyPhoto[];
}

export interface SafetyImportInput {
  rows: SheetRecord[];
  /** Lista única de tipos, como está no banco. */
  types: SafetyType[];
  /** Obras que entram; linha de obra fora desta lista é contada em `skipped`. */
  works: WorkTarget[];
  photos?: PhotoSources;
}

export interface SafetyImportContext extends Omit<SafetyContext, 'importing'> {
  /** Id estável (UUID) a partir de um texto: o mesmo texto dá sempre o mesmo id. */
  idFor: (seed: string) => string;
}

export interface WorkImportReport {
  obra: string;
  workId: string;
  workName: string;
  rows: number;
  created: number;
  existing: number;
  /** Finalizados por esta importação (novos ou já gravados que estavam abertos). */
  resolvedNow: number;
  /** Situação final dos apontamentos das linhas importadas. */
  resolved: number;
  open: number;
  notesInDescription: number;
  resolutionNotes: number;
  issuePhotos: number;
  correctionPhotos: number;
  /** Locais distintos como digitados × depois da correção. */
  locationsBefore: number;
  locationsAfter: number;
  warnings: ImportIssue<SafetyImportWarningKind>[];
  errors: ImportIssue<SafetyImportErrorKind>[];
}

export interface WorkImportPlan {
  target: WorkTarget;
  /** Tudo da obra numa gravação: apontamentos (os corrigidos já nascem finalizados), fotos e finalizações. */
  mutation: SafetyMutation;
  uploads: PhotoUpload[];
  report: WorkImportReport;
}

export interface TypeMapping {
  spelling: string;
  type: string;
  rows: number;
  how: 'catálogo' | 'sinônimo' | 'novo';
}

export interface SafetyImportPlan {
  /** Tipos novos, na lista única: gravar antes das obras. */
  types: { mutation: SafetyMutation; created: { name: string; spellings: string[]; rows: number }[] };
  typeMappings: TypeMapping[];
  works: WorkImportPlan[];
  /** Linhas de obras fora da importação (não achadas, fora por decisão ou fora do --only). */
  skipped: { obra: string; rows: number }[];
  /** Locais distintos em todas as obras importadas, como digitados × depois da correção. */
  locations: { before: number; after: number };
  /** Fotos indicadas para linhas que não entram (obra de fora, linha com erro, linha inexistente). */
  photoIssues: ImportIssue<SafetyImportWarningKind>[];
}

const emptyRows = (): SafetyRowSet => ({ types: [], items: [], photos: [] });
const emptyMutation = (workId?: string): SafetyMutation => ({
  ...(workId ? { workId } : {}),
  insert: emptyRows(),
  update: emptyRows(),
  delete: { types: [], items: [], photos: [] },
  removeFiles: [],
});

/** Junta a gravação de um comando à acumulada. Atualização de registro que a própria importação insere
 * vira a nova versão da inserção: no banco, a linha já nasce finalizada. */
function merge(total: SafetyMutation, part: SafetyMutation) {
  for (const table of SAFETY_TABLES) {
    const inserted = total.insert[table] as { id: string }[];
    const updated = total.update[table] as { id: string }[];
    inserted.push(...(part.insert[table] as { id: string }[]));
    for (const record of part.update[table] as { id: string }[]) {
      const i = inserted.findIndex(r => r.id === record.id);
      if (i >= 0) inserted[i] = record;
      else {
        const j = updated.findIndex(r => r.id === record.id);
        if (j >= 0) updated[j] = record;
        else updated.push(record);
      }
    }
    total.delete[table].push(...part.delete[table]);
  }
  total.removeFiles.push(...part.removeFiles);
}

function applyToData(data: SafetyData, part: SafetyMutation): SafetyData {
  const next = { ...data };
  for (const table of SAFETY_TABLES) {
    const removed = new Set(part.delete[table]);
    const updated = new Map((part.update[table] as { id: string }[]).map(r => [r.id, r]));
    (next as unknown as Record<string, unknown>)[table] = (data[table] as { id: string }[])
      .filter(r => !removed.has(r.id))
      .map(r => updated.get(r.id) ?? r)
      .concat(part.insert[table] as { id: string }[]);
  }
  return next;
}

const isHttpUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

/**
 * Monta a importação: 1) tipos novos na lista única; 2) por obra, cada linha vira `create_item` (pulada se
 * o id já existe), as fotos indicadas viram `add_photo` e a data de correção vira `resolve_item`. Linha de
 * obra fora de `works` não entra; linha com erro (data do apontamento, consequência, probabilidade ou
 * descrição) é relatada e pulada sem derrubar as demais.
 */
export function planSafetyImport(input: SafetyImportInput, ctx: SafetyImportContext): SafetyImportPlan {
  const today = ctx.today ?? ctx.now.slice(0, 10);
  const baseTime = Date.parse(ctx.now);
  let sequence = 0;
  // Cada comando com seu instante: a lista lê por created_at e mantém a ordem da planilha.
  const commandCtx = (newId: () => string = ctx.newId): SafetyContext => ({
    actorId: ctx.actorId,
    today,
    now: new Date(baseTime + sequence++).toISOString(),
    newId,
    importing: true,
  });

  const workByObra = new Map(input.works.map(w => [safetyKey(w.obra), w]));
  const skipped = new Map<string, number>();
  const included: SheetRecord[] = [];
  for (const record of input.rows) {
    if (workByObra.has(safetyKey(record.obra))) included.push(record);
    else skipped.set(clean(record.obra) || '(sem obra)', (skipped.get(clean(record.obra) || '(sem obra)') ?? 0) + 1);
  }

  // 1. Linhas normalizadas, por obra.
  const normalized = included.map(record => ({ record, ...normalizeRecord(record, today) }));

  // 2. Tipos: catálogo pela chave; o que faltar nasce na lista única, com a primeira grafia vista.
  let types = input.types;
  const typeMutation = emptyMutation();
  const created = new Map<string, { name: string; spellings: Set<string>; rows: number }>();
  const mappings = new Map<string, TypeMapping>();
  const typeByKey = (name: string) => types.find(t => safetyKey(t.name) === safetyKey(name));
  for (const { row } of normalized) {
    if (!row?.typeName) continue;
    const key = safetyKey(row.typeName);
    if (!typeByKey(row.typeName)) {
      const part = planSafetyCommand(
        { types, items: [], photos: [] },
        { type: 'create_type', name: row.typeName },
        commandCtx(() => ctx.idFor(`tipo|${key}`)),
      );
      types = applyToData({ types, items: [], photos: [] }, part).types;
      merge(typeMutation, part);
      created.set(key, { name: typeByKey(row.typeName)!.name, spellings: new Set(), rows: 0 });
    }
    const fresh = created.get(key);
    if (fresh) {
      fresh.spellings.add(row.rawType);
      fresh.rows++;
    }
    const mapping = mappings.get(row.rawType) ?? {
      spelling: row.rawType,
      type: typeByKey(row.typeName)!.name,
      rows: 0,
      how: fresh ? 'novo' : SAFETY_TYPE_SYNONYMS[safetyKey(row.rawType)] ? 'sinônimo' : 'catálogo',
    };
    mapping.rows++;
    mappings.set(row.rawType, mapping);
  }

  // 3. Obras.
  const rowWork = new Map<number, string>();
  const plans: WorkImportPlan[] = [];
  const allBefore = new Set<string>();
  const allAfter = new Set<string>();
  for (const target of input.works) {
    const key = safetyKey(target.obra);
    const entries = normalized.filter(n => safetyKey(n.record.obra) === key);
    let data: SafetyData = { types, items: target.items, photos: target.photos };
    const mutation = emptyMutation(target.workId);
    const uploads: PhotoUpload[] = [];
    const report: WorkImportReport = {
      obra: target.obra,
      workId: target.workId,
      workName: target.workName,
      rows: entries.length,
      created: 0,
      existing: 0,
      resolvedNow: 0,
      resolved: 0,
      open: 0,
      notesInDescription: 0,
      resolutionNotes: 0,
      issuePhotos: 0,
      correctionPhotos: 0,
      locationsBefore: 0,
      locationsAfter: 0,
      warnings: [],
      errors: [],
    };
    const run = (command: SafetyCommand) => {
      const part = planSafetyCommand(data, command, commandCtx());
      data = applyToData(data, part);
      merge(mutation, part);
    };
    const warn = (row: number, kind: SafetyImportWarningKind, message: string) => report.warnings.push({ row, kind, message });

    const locations = unifyLocations(
      entries.map(e => e.row?.location ?? ''),
      target.items.map(i => i.location),
    );
    const before = new Set(entries.map(e => clean(e.record.local)).filter(Boolean));
    const after = new Set(entries.map(e => (e.row ? (locations.get(e.row.location) ?? e.row.location) : '')).filter(Boolean));
    report.locationsBefore = before.size;
    report.locationsAfter = after.size;
    before.forEach(l => allBefore.add(l));
    after.forEach(l => allAfter.add(l));

    const occurrences = new Map<string, number>();
    for (const entry of entries) {
      report.warnings.push(...entry.warnings);
      report.errors.push(...entry.errors);
      const row = entry.row;
      if (!row) continue;
      const identity = [target.workId, row.rawType, row.rawDescription, row.rawLocation, row.observedOn].map(looseKey).join('|');
      const occurrence = (occurrences.get(identity) ?? 0) + 1;
      occurrences.set(identity, occurrence);
      const itemId = ctx.idFor(`item|${identity}|${occurrence}`);

      let item = data.items.find(i => i.id === itemId);
      if (item) report.existing++;
      else {
        let type = row.typeName ? typeByKey(row.typeName) : undefined;
        if (type && !type.active) {
          warn(row.row, 'tipo-desativado', `Tipo "${type.name}" desativado no sistema; importado sem tipo.`);
          type = undefined;
        }
        try {
          run({
            type: 'create_item',
            workId: target.workId,
            itemId,
            typeId: type?.id,
            consequence: row.consequence,
            probability: row.probability,
            description: row.description,
            location: locations.get(row.location) ?? row.location,
            observedOn: row.observedOn,
          });
        } catch (cause) {
          report.errors.push({ row: row.row, kind: 'recusado', message: (cause as Error).message });
          continue;
        }
        report.created++;
        report.notesInDescription += row.notesInDescription;
        item = data.items.find(i => i.id === itemId)!;
      }
      rowWork.set(row.row, target.workId);

      // Fotos da passada posterior: id da foto pelo apontamento, o tipo e o endereço.
      const sources = input.photos?.[String(row.row)];
      for (const kind of ['issue', 'correction'] as const) {
        const urls = sources?.[kind];
        if (!urls) continue;
        for (const url of [...new Set(Array.isArray(urls) ? urls : [])]) {
          if (!isHttpUrl(url)) {
            warn(row.row, 'foto-url', `Endereço de foto inválido: ${String(url).slice(0, 80)}`);
            continue;
          }
          const photoId = ctx.idFor(`foto|${itemId}|${kind}|${url}`);
          if (data.photos.some(p => p.id === photoId)) continue;
          const paths = safetyPhotoPaths(target.workId, itemId, photoId);
          try {
            run({ type: 'add_photo', itemId, photoId, kind, ...paths });
          } catch (cause) {
            warn(row.row, 'foto-recusada', (cause as Error).message);
            continue;
          }
          uploads.push({ row: row.row, workId: target.workId, itemId, photoId, kind, url, ...paths });
          if (kind === 'issue') report.issuePhotos++;
          else report.correctionPhotos++;
        }
      }

      if (row.correctedOn && item.status === 'open') {
        try {
          run({ type: 'resolve_item', itemId, correctedOn: row.correctedOn, resolutionNote: row.resolutionNote });
          report.resolvedNow++;
          if (row.resolutionNote) report.resolutionNotes++;
        } catch (cause) {
          warn(row.row, 'nao-finalizou', `Corrigido em ${row.correctedOn} na planilha, mas ficou aberto: ${(cause as Error).message}`);
        }
      } else if (!row.correctedOn && item.status === 'resolved')
        warn(row.row, 'resolvido-no-sistema', 'Aberto na planilha e finalizado no sistema; mantido finalizado.');
      if (data.items.find(i => i.id === itemId)!.status === 'resolved') report.resolved++;
      else report.open++;
    }
    plans.push({ target, mutation, uploads, report });
  }

  const photoIssues: ImportIssue<SafetyImportWarningKind>[] = [];
  for (const line of Object.keys(input.photos ?? {})) {
    if (!rowWork.has(Number(line)))
      photoIssues.push({
        row: Number(line) || undefined,
        kind: 'foto-sem-linha',
        message: `Fotos da linha ${line}, que não entra nesta importação.`,
      });
  }

  return {
    types: {
      mutation: typeMutation,
      created: [...created.values()].map(t => ({ name: t.name, spellings: [...t.spellings], rows: t.rows })),
    },
    typeMappings: [...mappings.values()],
    works: plans,
    skipped: [...skipped].map(([obra, rows]) => ({ obra, rows })),
    locations: { before: allBefore.size, after: allAfter.size },
    photoIssues,
  };
}
