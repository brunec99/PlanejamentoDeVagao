import type { ConstraintType, LinkType, LocalDate } from './entities';
import { constraintNeedsDate, countedDays, planWindow, type TaskDuration, type WorkCalendar } from './plan-schedule';

/** Leitura do XML do Microsoft Project (MSPDI, o "Salvar como > XML" do Project 2007+) para o
 * médio prazo. É o inverso de `mspdi.ts`: lá o plano vira XML, aqui o XML vira um rascunho que a
 * tela confere e grava pelo `save_plan_revision`.
 *
 * Duas etapas, as duas puras (sem biblioteca, rodam no navegador e no Node):
 * 1. `parseMspdi` lê o texto com um tokenizador próprio e devolve o que o arquivo diz, campo a
 *    campo, sem interpretar (datas e durações continuam no formato do XSD). Os blocos
 *    `<TimephasedData>` — a maior parte do arquivo, a distribuição de trabalho dia a dia — são
 *    pulados sem montar nó nenhum.
 * 2. `buildPlanImport` converte para o que o servidor aceita, nas regras do `save_plan_revision` e
 *    do motor (`analyzeSchedule`): resumo não tem vínculo, restrição, prazo final nem data real;
 *    defasagem é inteira (de -365 a 365); hierarquia não pula nível; % acima de zero exige início
 *    real e término real exige 100%. Tudo que muda no caminho vira aviso, agrupado por código.
 *
 * As datas planejadas que saem aqui são as do arquivo (o que o Project mostra); o servidor só
 * aceita as que o motor calcula, então a tela passa o rascunho pelo motor e compara com
 * `fileDates` antes de gravar. */

const NAMESPACE = 'http://schemas.microsoft.com/project';
const NOT_PROJECT_HINT = 'No Project, use Arquivo > Salvar como > XML (*.xml) e envie esse arquivo.';

// ————— Tipos do que o arquivo diz (etapa 1) —————

export interface MspdiWorkingTime {
  /** `HH:MM:SS`, como no arquivo. */
  from: string;
  to: string;
}
export interface MspdiTimePeriod {
  /** `xsd:dateTime` sem fuso, como no arquivo. */
  from?: string;
  to?: string;
}
/** Dia da semana do calendário: `dayType` 1 = domingo … 7 = sábado; 0 é a exceção no formato
 * antigo (Project 2002), com `timePeriod`. */
export interface MspdiWeekDay {
  dayType: number;
  dayWorking: boolean;
  workingTimes: MspdiWorkingTime[];
  timePeriod?: MspdiTimePeriod;
}
/** Exceção do calendário (Project 2003+). `type`: 1 diária, 2 anual por dia do mês, 3 anual por
 * posição, 4 mensal por dia do mês, 5 mensal por posição, 6 semanal, 7 diária por contagem. */
export interface MspdiException {
  name?: string;
  timePeriod: MspdiTimePeriod;
  occurrences?: number;
  type?: number;
  enteredByOccurrences?: boolean;
  /** "A cada N" dias, semanas ou meses. */
  period?: number;
  /** Semanal: bits 1 domingo, 2 segunda, 4 terça … 64 sábado. */
  daysOfWeek?: number;
  /** Por posição: 0 dia, 1 dia útil, 2 dia de fim de semana, 3 domingo … 9 sábado. */
  monthItem?: number;
  /** Por posição: 0 primeiro … 3 quarto, 4 último. */
  monthPosition?: number;
  /** Anual: 0 janeiro … 11 dezembro. */
  month?: number;
  monthDay?: number;
  dayWorking: boolean;
  workingTimes: MspdiWorkingTime[];
}
export interface MspdiCalendar {
  uid: number;
  name: string;
  isBaseCalendar: boolean;
  /** Calendário de que este deriva; ausente (ou -1) no calendário base. */
  baseCalendarUid?: number;
  weekDays: MspdiWeekDay[];
  exceptions: MspdiException[];
  /** Semanas de trabalho alternativas (`<WorkWeeks>`), que o sistema não tem. */
  workWeekCount: number;
}
export interface MspdiPredecessorLink {
  /** UID (não o ID) da predecessora. */
  predecessorUid: number;
  /** 0 TT, 1 TI, 2 IT, 3 II. */
  type: number;
  crossProject: boolean;
  /** Em décimos de minuto (ou em porcentagem, quando `lagFormat` é 19/20). */
  linkLag: number;
  lagFormat?: number;
}
export interface MspdiBaseline {
  number: number;
  start?: string;
  finish?: string;
  duration?: string;
}
export interface MspdiTask {
  uid: number;
  id?: number;
  name: string;
  active: boolean;
  manual: boolean;
  isNull: boolean;
  outlineLevel?: number;
  summary: boolean;
  milestone: boolean;
  estimated: boolean;
  start?: string;
  finish?: string;
  /** `xsd:duration`, em geral `PT80H0M0S`. */
  duration?: string;
  durationFormat?: number;
  percentComplete: number;
  actualStart?: string;
  actualFinish?: string;
  /** 0 OMBP, 1 OMTP, 2 DIE, 3 DTE, 4 NIAD, 5 NIDD, 6 NTAD, 7 NTDD. */
  constraintType: number;
  constraintDate?: string;
  deadline?: string;
  notes?: string;
  predecessorLinks: MspdiPredecessorLink[];
  baselines: MspdiBaseline[];
}
export interface MspdiResource {
  uid: number;
  name: string;
  /** 0 material, 1 trabalho, 2 custo. */
  type?: number;
  isNull: boolean;
}
export interface MspdiAssignment {
  taskUid: number;
  /** -65535 = sem recurso. */
  resourceUid: number;
  units?: number;
}
export interface MspdiProject {
  title?: string;
  name?: string;
  startDate?: string;
  calendarUid?: number;
  minutesPerDay?: number;
  minutesPerWeek?: number;
  daysPerMonth?: number;
  /** Formato padrão das durações (`<DurationFormat>` do cabeçalho), o que vale para o formato nulo. */
  durationFormat?: number;
  calendars: MspdiCalendar[];
  tasks: MspdiTask[];
  resources: MspdiResource[];
  assignments: MspdiAssignment[];
}

// ————— Tipos do rascunho (etapa 2) —————

export interface PlanImportOptions {
  /** Mês do plano (`AAAA-MM`): centra a janela em que as recorrências do calendário são expandidas. */
  month: string;
  /** Nome do arquivo enviado, para nomear o plano quando o título do projeto é vazio ou genérico. */
  fileName?: string;
}
/** Linha do rascunho, já nas regras do servidor. `key` é o UID do arquivo em texto; a tela troca
 * por um id novo ao gravar. */
export interface DraftTask {
  key: string;
  uid: number;
  /** O ID (número da linha) que o Project mostra. */
  fileId?: number;
  name: string;
  level: number;
  /** Posição a partir de 1, na ordem do arquivo. */
  order: number;
  summary: boolean;
  /** Só nas folhas; no resumo a duração é a dos filhos. */
  duration?: TaskDuration;
  plannedStart: LocalDate;
  plannedEnd: LocalDate;
  actualStart?: LocalDate;
  actualEnd?: LocalDate;
  progress: number;
  /** Ausente = "O mais breve possível", como o servidor grava. */
  constraintType?: ConstraintType;
  constraintDate?: LocalDate;
  deadline?: LocalDate;
  notes?: string;
  /** Nome do recurso (empreiteiro) da primeira atribuição. */
  resourceName?: string;
  /** Era agendada manualmente no Project. */
  manual?: boolean;
  /** A duração era estimada ("?") no Project. */
  estimated?: boolean;
}
export interface DraftLink {
  predecessorKey: string;
  successorKey: string;
  type: LinkType;
  lagDays: number;
  lagBusiness: boolean;
  /** Veio de um vínculo com tarefa-resumo, passado para as subtarefas. */
  redistributed?: boolean;
}
export interface ImportWarning {
  code: string;
  message: string;
  /** Ocorrências (tarefas, vínculos ou exceções, conforme o código). */
  count: number;
  /** Chaves (UID) das tarefas envolvidas, sem repetição; inclui as que ficaram de fora. */
  taskKeys?: string[];
}
export interface PlanImportStats {
  tasks: number;
  summaries: number;
  leaves: number;
  milestones: number;
  links: number;
  completed: number;
  inProgress: number;
  withBaseline: number;
  manual: number;
  estimated: number;
  constrained: number;
  deadlines: number;
  withResource: number;
  holidays: number;
  ignoredNull: number;
  ignoredInactive: number;
}
export interface PlanImportDraft {
  name: string;
  calendar: WorkCalendar;
  /** Data de início do projeto (`StartDate`), quando houver. */
  projectStart?: LocalDate;
  tasks: DraftTask[];
  links: DraftLink[];
  /** Linha de base 0, por chave, para as tarefas que a têm. */
  baseline?: Record<string, { start: LocalDate; end: LocalDate }>;
  /** As datas que o Project mostra, por chave, para comparar com o motor. */
  fileDates: Record<string, { start: LocalDate; end: LocalDate }>;
  resources: { name: string; taskCount: number }[];
  warnings: ImportWarning[];
  stats: PlanImportStats;
}

// ————— Leitor XML mínimo —————

interface XmlElement {
  /** Nome local, sem prefixo de namespace. */
  name: string;
  /** Nome como está no arquivo, para casar com a marca de fechamento. */
  qname: string;
  attributes: string;
  children: XmlElement[];
  /** Texto do elemento folha (o de quem tem filhos é descartado). */
  text: string;
}

/** Blocos pulados inteiros: a distribuição no tempo, que pesa megabytes e não interessa aqui. */
const SKIPPED = new Set(['TimephasedData']);
const ENTITY = /&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g;
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const NAME = /^[A-Za-z_][\w.:-]*$/;

function lineAt(xml: string, position: number) {
  let line = 1;
  for (let i = 0; i < position && i < xml.length; i++) if (xml.charCodeAt(i) === 10) line++;
  return line;
}
function malformed(xml: string, position: number, detail: string): never {
  throw new Error(`XML malformado (linha ${lineAt(xml, position)}): ${detail}.`);
}
/** Entidades do XML e quebras de linha normalizadas para `\n`, como o XML 1.0 manda. */
function decode(raw: string): string {
  const text = raw.indexOf('\r') >= 0 ? raw.replace(/\r\n?/g, '\n') : raw;
  if (text.indexOf('&') < 0) return text;
  return text.replace(ENTITY, (_match, ref: string) => {
    if (ref[0] !== '#') return NAMED[ref];
    const code = ref[1] === 'x' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '�';
  });
}

function parseXml(xml: string): XmlElement {
  const n = xml.length;
  let position = xml.charCodeAt(0) === 0xfeff ? 1 : 0;
  const stack: XmlElement[] = [];
  let root: XmlElement | undefined;
  while (position < n) {
    const lt = xml.indexOf('<', position);
    const textEnd = lt < 0 ? n : lt;
    if (textEnd > position) {
      const top = stack[stack.length - 1];
      if (top) {
        if (!top.children.length) top.text += decode(xml.slice(position, textEnd));
      } else if (xml.slice(position, textEnd).trim())
        malformed(xml, position, root ? 'há conteúdo depois do elemento raiz' : 'há texto antes do elemento raiz');
    }
    if (lt < 0) break;
    const next = xml.charCodeAt(lt + 1);
    if (next === 63 /* ? */) {
      const end = xml.indexOf('?>', lt + 2);
      if (end < 0) malformed(xml, lt, 'declaração "<?" sem fim');
      position = end + 2;
      continue;
    }
    if (next === 33 /* ! */) {
      if (xml.startsWith('<!--', lt)) {
        const end = xml.indexOf('-->', lt + 4);
        if (end < 0) malformed(xml, lt, 'comentário sem fim');
        position = end + 3;
        continue;
      }
      if (xml.startsWith('<![CDATA[', lt)) {
        const end = xml.indexOf(']]>', lt + 9);
        if (end < 0) malformed(xml, lt, 'bloco CDATA sem fim');
        const top = stack[stack.length - 1];
        if (!top) malformed(xml, lt, 'bloco CDATA fora do elemento raiz');
        if (!top.children.length) top.text += xml.slice(lt + 9, end).replace(/\r\n?/g, '\n');
        position = end + 3;
        continue;
      }
      if (xml.startsWith('<!DOCTYPE', lt)) {
        const close = xml.indexOf('>', lt);
        const bracket = xml.indexOf('[', lt);
        const end = bracket >= 0 && bracket < close ? xml.indexOf('>', xml.indexOf(']', bracket)) : close;
        if (end < 0) malformed(xml, lt, 'DOCTYPE sem fim');
        position = end + 1;
        continue;
      }
      malformed(xml, lt, 'marcação "<!" desconhecida');
    }
    if (next === 47 /* / */) {
      const end = xml.indexOf('>', lt + 2);
      if (end < 0) malformed(xml, lt, 'marca de fechamento sem ">"');
      const qname = xml.slice(lt + 2, end).trim();
      const top = stack.pop();
      if (!top) malformed(xml, lt, `</${qname}> sem abertura`);
      if (top.qname !== qname) malformed(xml, lt, `</${qname}> fecha <${top.qname}>`);
      position = end + 1;
      continue;
    }
    // Marca de abertura: o ">" que a fecha não pode estar dentro de aspas de atributo.
    let end = xml.indexOf('>', lt + 1);
    if (end < 0) malformed(xml, lt, 'marca sem ">"');
    const head = xml.slice(lt + 1, end);
    if (head.indexOf('"') >= 0 || head.indexOf("'") >= 0) {
      let quote = 0;
      for (end = lt + 1; end < n; end++) {
        const ch = xml.charCodeAt(end);
        if (quote) {
          if (ch === quote) quote = 0;
        } else if (ch === 34 || ch === 39) quote = ch;
        else if (ch === 62) break;
      }
      if (end >= n) malformed(xml, lt, 'atributo sem aspas de fechamento');
    }
    const selfClosing = xml.charCodeAt(end - 1) === 47;
    const inner = xml.slice(lt + 1, selfClosing ? end - 1 : end);
    if (inner.indexOf('<') >= 0) malformed(xml, lt, '"<" dentro de uma marca');
    const space = inner.search(/\s/);
    const qname = space < 0 ? inner : inner.slice(0, space);
    if (!NAME.test(qname)) malformed(xml, lt, `nome de elemento inválido "${qname.slice(0, 40)}"`);
    const top = stack[stack.length - 1];
    if (!top && root) malformed(xml, lt, 'há mais de um elemento raiz');
    const colon = qname.indexOf(':');
    const name = colon < 0 ? qname : qname.slice(colon + 1);
    if (top && !selfClosing && SKIPPED.has(name)) {
      // Não se aninha: o primeiro fechamento com o mesmo nome encerra o bloco.
      const close = xml.indexOf(`</${qname}`, end);
      const after = close < 0 ? -1 : xml.indexOf('>', close);
      if (after < 0) malformed(xml, lt, `<${qname}> sem fechamento`);
      position = after + 1;
      continue;
    }
    const element: XmlElement = { name, qname, attributes: space < 0 ? '' : inner.slice(space), children: [], text: '' };
    if (top) {
      if (!top.children.length) top.text = '';
      top.children.push(element);
    } else root = element;
    if (!selfClosing) stack.push(element);
    position = end + 1;
  }
  if (stack.length) malformed(xml, n, `<${stack[stack.length - 1].qname}> não foi fechado`);
  if (!root) throw new Error(`O arquivo não tem conteúdo XML. ${NOT_PROJECT_HINT}`);
  return root;
}

function attribute(attributes: string, name: string): string | undefined {
  for (const match of attributes.matchAll(/([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))
    if (match[1] === name) return decode(match[2] ?? match[3] ?? '');
  return undefined;
}

/** Acesso aos filhos de um elemento pelo nome: o primeiro de cada nome, em texto ou número. */
function fieldsOf(element: XmlElement | undefined) {
  const first = new Map<string, XmlElement>();
  for (const child of element?.children ?? []) if (!first.has(child.name)) first.set(child.name, child);
  const text = (name: string) => {
    const value = first.get(name)?.text.trim();
    return value ? value : undefined;
  };
  const num = (name: string) => {
    const value = text(name);
    if (value === undefined) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const bool = (name: string, fallback = false) => {
    const value = text(name);
    return value === undefined ? fallback : value === '1' || value.toLowerCase() === 'true';
  };
  const child = (name: string) => first.get(name);
  const all = (name: string) => (element?.children ?? []).filter(c => c.name === name);
  return { text, num, bool, child, all };
}

function workingTimesOf(element: XmlElement | undefined): MspdiWorkingTime[] {
  return fieldsOf(element)
    .all('WorkingTime')
    .map(fieldsOf)
    .map(f => ({ from: f.text('FromTime') ?? '', to: f.text('ToTime') ?? '' }))
    .filter(t => t.from && t.to);
}
function timePeriodOf(element: XmlElement | undefined): MspdiTimePeriod | undefined {
  if (!element) return undefined;
  const f = fieldsOf(element);
  return { from: f.text('FromDate'), to: f.text('ToDate') };
}

function readCalendar(element: XmlElement): MspdiCalendar | undefined {
  const f = fieldsOf(element);
  const uid = f.num('UID');
  if (uid === undefined) return undefined;
  const base = f.num('BaseCalendarUID');
  const weekDays = fieldsOf(f.child('WeekDays'))
    .all('WeekDay')
    .map((day): MspdiWeekDay => {
      const d = fieldsOf(day);
      const period = timePeriodOf(d.child('TimePeriod'));
      return {
        dayType: d.num('DayType') ?? -1,
        dayWorking: d.bool('DayWorking'),
        workingTimes: workingTimesOf(d.child('WorkingTimes')),
        ...(period ? { timePeriod: period } : {}),
      };
    });
  const exceptions = fieldsOf(f.child('Exceptions'))
    .all('Exception')
    .map((item): MspdiException => {
      const e = fieldsOf(item);
      const optional = {
        name: e.text('Name'),
        occurrences: e.num('Occurrences'),
        type: e.num('Type'),
        period: e.num('Period'),
        daysOfWeek: e.num('DaysOfWeek'),
        monthItem: e.num('MonthItem'),
        monthPosition: e.num('MonthPosition'),
        month: e.num('Month'),
        monthDay: e.num('MonthDay'),
      };
      const entered = e.text('EnteredByOccurrences');
      return {
        ...(Object.fromEntries(Object.entries(optional).filter(([, v]) => v !== undefined)) as Partial<MspdiException>),
        ...(entered !== undefined ? { enteredByOccurrences: entered === '1' } : {}),
        timePeriod: timePeriodOf(e.child('TimePeriod')) ?? {},
        dayWorking: e.bool('DayWorking'),
        workingTimes: workingTimesOf(e.child('WorkingTimes')),
      };
    });
  return {
    uid,
    name: f.text('Name') ?? '',
    isBaseCalendar: f.bool('IsBaseCalendar'),
    ...(base !== undefined && base >= 0 ? { baseCalendarUid: base } : {}),
    weekDays,
    exceptions,
    workWeekCount: fieldsOf(f.child('WorkWeeks')).all('WorkWeek').length,
  };
}

function readTask(element: XmlElement): MspdiTask | undefined {
  const f = fieldsOf(element);
  const uid = f.num('UID');
  if (uid === undefined) return undefined;
  const optional = {
    id: f.num('ID'),
    outlineLevel: f.num('OutlineLevel'),
    start: f.text('Start'),
    finish: f.text('Finish'),
    duration: f.text('Duration'),
    durationFormat: f.num('DurationFormat'),
    actualStart: f.text('ActualStart'),
    actualFinish: f.text('ActualFinish'),
    constraintDate: f.text('ConstraintDate'),
    deadline: f.text('Deadline'),
    notes: f.child('Notes')?.text.trim() || undefined,
  };
  return {
    uid,
    ...(Object.fromEntries(Object.entries(optional).filter(([, v]) => v !== undefined)) as Partial<MspdiTask>),
    name: f.child('Name')?.text.trim() ?? '',
    // Arquivos do Project 2007 não trazem `Active`: toda tarefa é ativa.
    active: f.bool('Active', true),
    manual: f.bool('Manual'),
    isNull: f.bool('IsNull'),
    summary: f.bool('Summary'),
    milestone: f.bool('Milestone'),
    estimated: f.bool('Estimated'),
    percentComplete: f.num('PercentComplete') ?? 0,
    constraintType: f.num('ConstraintType') ?? 0,
    predecessorLinks: f
      .all('PredecessorLink')
      .map(fieldsOf)
      .flatMap(l => {
        const predecessorUid = l.num('PredecessorUID');
        if (predecessorUid === undefined) return [];
        const lagFormat = l.num('LagFormat');
        return [
          {
            predecessorUid,
            type: l.num('Type') ?? 1,
            crossProject: l.bool('CrossProject'),
            linkLag: l.num('LinkLag') ?? 0,
            ...(lagFormat !== undefined ? { lagFormat } : {}),
          },
        ];
      }),
    baselines: f
      .all('Baseline')
      .map(fieldsOf)
      .map(b => {
        const optionalBaseline = { start: b.text('Start'), finish: b.text('Finish'), duration: b.text('Duration') };
        return {
          number: b.num('Number') ?? 0,
          ...(Object.fromEntries(Object.entries(optionalBaseline).filter(([, v]) => v !== undefined)) as Partial<MspdiBaseline>),
        };
      }),
  } as MspdiTask;
}

/** Lê o XML do Project (MSPDI). Erro em português quando o texto não é XML, está malformado ou
 * não tem a raiz `<Project>` no namespace do Project. */
export function parseMspdi(xml: string): MspdiProject {
  if (typeof xml !== 'string' || !xml.replace(/^﻿/, '').trim()) throw new Error(`O arquivo está vazio. ${NOT_PROJECT_HINT}`);
  const firstMark = xml.replace(/^﻿/, '').trimStart();
  if (firstMark[0] !== '<') throw new Error(`O arquivo não é XML (o .mpp não é aceito). ${NOT_PROJECT_HINT}`);
  const root = parseXml(xml);
  const colon = root.qname.indexOf(':');
  const namespace = attribute(root.attributes, colon < 0 ? 'xmlns' : `xmlns:${root.qname.slice(0, colon)}`);
  if (root.name !== 'Project' || namespace !== NAMESPACE)
    throw new Error(
      `O arquivo não é um XML do Microsoft Project: a raiz deveria ser <Project> no namespace ${NAMESPACE}. ${NOT_PROJECT_HINT}`,
    );
  const f = fieldsOf(root);
  const header = {
    title: f.text('Title'),
    name: f.text('Name'),
    startDate: f.text('StartDate'),
    calendarUid: f.num('CalendarUID'),
    minutesPerDay: f.num('MinutesPerDay'),
    minutesPerWeek: f.num('MinutesPerWeek'),
    daysPerMonth: f.num('DaysPerMonth'),
    durationFormat: f.num('DurationFormat'),
  };
  return {
    ...(Object.fromEntries(Object.entries(header).filter(([, v]) => v !== undefined)) as Partial<MspdiProject>),
    calendars: fieldsOf(f.child('Calendars'))
      .all('Calendar')
      .map(readCalendar)
      .filter((c): c is MspdiCalendar => !!c),
    tasks: fieldsOf(f.child('Tasks'))
      .all('Task')
      .map(readTask)
      .filter((t): t is MspdiTask => !!t),
    resources: fieldsOf(f.child('Resources'))
      .all('Resource')
      .map(fieldsOf)
      .flatMap(r => {
        const uid = r.num('UID');
        const type = r.num('Type');
        return uid === undefined
          ? []
          : [{ uid, name: r.text('Name') ?? '', isNull: r.bool('IsNull'), ...(type !== undefined ? { type } : {}) }];
      }),
    assignments: fieldsOf(f.child('Assignments'))
      .all('Assignment')
      .map(fieldsOf)
      .flatMap(a => {
        const taskUid = a.num('TaskUID'),
          resourceUid = a.num('ResourceUID'),
          units = a.num('Units');
        return taskUid === undefined || resourceUid === undefined
          ? []
          : [{ taskUid, resourceUid, ...(units !== undefined ? { units } : {}) }];
      }),
  };
}

// ————— Datas, durações e dias —————

const DAY_MS = 86400000;
const WEEKDAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
/** A data (`AAAA-MM-DD`) de um `xsd:dateTime`; indefinida se não for uma data válida. */
function datePart(value: string | undefined): LocalDate | undefined {
  const match = value?.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return undefined;
  const time = Date.parse(`${match[1]}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === match[1] ? match[1] : undefined;
}
const dayNumber = (date: LocalDate) => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
const dayString = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
/** 0 = domingo … 6 = sábado (o dia 0 da conta, 01/01/1970, foi quinta). */
const weekdayOf = (day: number) => (((day + 4) % 7) + 7) % 7;
const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const XSD_DURATION =
  /^(-)?P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;
/** `xsd:duration` em horas: `PT80H0M0S` → 80, `P1DT2H` → 26 (o dia do XSD tem 24 h; ano e mês,
 * que o Project não grava, contam 365 e 30 dias). Indefinida se não for uma duração. */
export function parseXsdDuration(value: string | undefined): number | undefined {
  const match = value?.trim().match(XSD_DURATION);
  if (!match || match.slice(2).every(part => part === undefined)) return undefined;
  const [, negative, years, months, weeks, days, hours, minutes, seconds] = match.map(part => part ?? '');
  const n = (part: string) => (part ? Number(part) : 0);
  const total = (n(years) * 365 + n(months) * 30 + n(weeks) * 7 + n(days)) * 24 + n(hours) + n(minutes) / 60 + n(seconds) / 3600;
  return negative ? -total : total;
}
/** Horas de uma lista de faixas; `00:00:00` no fim é meia-noite (24:00). */
function hoursOf(times: MspdiWorkingTime[]): number {
  const clock = (value: string) => {
    const [h, m, s] = value.split(':').map(Number);
    return (h || 0) + (m || 0) / 60 + (s || 0) / 3600;
  };
  return times.reduce((sum, t) => {
    const from = clock(t.from);
    let to = clock(t.to);
    if (to <= from) to += 24;
    return sum + (to - from);
  }, 0);
}

// ————— Avisos —————

type Warn = (code: string, message: string, options?: { key?: string; count?: number }) => void;
function warningCollector() {
  const list: ImportWarning[] = [];
  const byCode = new Map<string, { warning: ImportWarning; keys: Set<string> }>();
  const add: Warn = (code, message, options = {}) => {
    let entry = byCode.get(code);
    if (!entry) {
      entry = { warning: { code, message, count: 0 }, keys: new Set() };
      byCode.set(code, entry);
      list.push(entry.warning);
    }
    entry.warning.count += options.count ?? 1;
    if (options.key !== undefined && !entry.keys.has(options.key)) {
      entry.keys.add(options.key);
      (entry.warning.taskKeys ??= []).push(options.key);
    }
  };
  return { list, add };
}

// ————— Calendário —————

/** Datas de uma exceção, dentro da janela; indefinida quando o tipo de recorrência não é conhecido. */
function expandException(exception: MspdiException, range: { start: number; end: number }): number[] | undefined {
  const fromDate = datePart(exception.timePeriod.from);
  if (!fromDate) return [];
  const from = dayNumber(fromDate);
  const toDate = datePart(exception.timePeriod.to);
  let to = toDate ? dayNumber(toDate) : from;
  // Fim exatamente à meia-noite: aquele dia já não entra.
  if (to > from && /T00:00(:00)?$/.test(exception.timePeriod.to ?? '')) to--;
  if (to < from) to = from;
  const type = exception.type ?? 1;
  const period = exception.period && exception.period > 0 ? Math.floor(exception.period) : 1;
  const limit = exception.occurrences && exception.occurrences > 0 ? exception.occurrences : Infinity;
  const days: number[] = [];
  const take = (day: number) => {
    if (day >= range.start && day <= range.end) days.push(day);
  };
  if (type === 1 || type === 7) {
    // Diária: o intervalo manda (as ocorrências são os dias dele), de N em N dias com período.
    const first = from + Math.max(0, Math.ceil((range.start - from) / period)) * period;
    for (let day = first, last = Math.min(to, range.end); day <= last; day += period) take(day);
    return days;
  }
  if (type === 6) {
    const mask = exception.daysOfWeek ?? 0;
    if (!mask) return undefined;
    const weekStart = from - weekdayOf(from);
    let count = 0;
    for (let day = from; day <= to && count < limit; day++) {
      if (Math.floor((day - weekStart) / 7) % period !== 0 || !(mask & (1 << weekdayOf(day)))) continue;
      count++;
      take(day);
    }
    return days;
  }
  if (type >= 2 && type <= 5) {
    const yearly = type <= 3,
      relative = type === 3 || type === 5;
    const start = new Date(from * DAY_MS);
    const year = start.getUTCFullYear();
    let month = yearly ? (exception.month ?? start.getUTCMonth()) : start.getUTCMonth();
    const step = yearly ? 12 : period;
    let count = 0;
    for (let guard = 0; guard < 6000 && count < limit; guard++, month += step) {
      const y = year + Math.floor(month / 12),
        m = month % 12;
      const length = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      const first = dayNumber(`${y}-${String(m + 1).padStart(2, '0')}-01`);
      let day: number | undefined;
      if (relative) {
        // 0 qualquer dia, 1 dia útil (seg–sex), 2 fim de semana, 3 domingo … 9 sábado.
        const item = exception.monthItem ?? -1;
        if (item < 0 || item > 9) return undefined;
        const matches = (d: number) => {
          const w = weekdayOf(d);
          return item === 0 || (item === 1 ? w >= 1 && w <= 5 : item === 2 ? w === 0 || w === 6 : w === item - 3);
        };
        const candidates: number[] = [];
        for (let d = first; d < first + length; d++) if (matches(d)) candidates.push(d);
        const position = exception.monthPosition ?? 0;
        day = position >= 4 ? candidates[candidates.length - 1] : candidates[position];
      } else {
        if (!exception.monthDay) return undefined;
        // Dia 31 em mês de 30 dias cai no último dia, como no Project.
        day = first + clamp(exception.monthDay, 1, length) - 1;
      }
      if (day === undefined) continue;
      if (day > to || day > range.end) break;
      if (day < from) continue;
      count++;
      take(day);
    }
    return days;
  }
  return undefined;
}

function buildCalendar(project: MspdiProject, month: string, warn: Warn): WorkCalendar {
  const byUid = new Map(project.calendars.map(c => [c.uid, c]));
  let main = project.calendarUid !== undefined ? byUid.get(project.calendarUid) : undefined;
  if (!main) {
    main = project.calendars.find(c => c.isBaseCalendar) ?? project.calendars[0];
    warn(
      'calendario_ausente',
      main
        ? `O calendário do projeto não foi encontrado; foi usado o calendário "${main.name}".`
        : 'O arquivo não tem calendário; foi usado o padrão (segunda a sexta, 8 h, sem feriados).',
    );
  }
  // Do calendário do projeto ao base de que ele deriva: o derivado sobrepõe o base.
  const chain: MspdiCalendar[] = [];
  for (
    let c: MspdiCalendar | undefined = main;
    c && !chain.includes(c);
    c = c.baseCalendarUid !== undefined ? byUid.get(c.baseCalendarUid) : undefined
  )
    chain.push(c);

  const weekdays: number[] = [];
  const hoursByDay = new Map<number, number>();
  for (let dayType = 1; dayType <= 7; dayType++) {
    const entry = chain.map(c => c.weekDays.find(w => w.dayType === dayType)).find(w => !!w);
    const working = entry ? entry.dayWorking : dayType >= 2 && dayType <= 6;
    if (!working) continue;
    weekdays.push(dayType - 1);
    const hours = entry ? hoursOf(entry.workingTimes) : 0;
    if (hours > 0) hoursByDay.set(dayType - 1, hours);
  }
  if (!weekdays.length) {
    weekdays.push(1, 2, 3, 4, 5);
    warn('semana_sem_dia_util', 'O calendário não tem dia útil na semana; foi usada a semana de segunda a sexta.');
  }
  const minutes = project.minutesPerDay;
  const fromHeader = minutes !== undefined && minutes > 0 && minutes <= 1440 ? minutes / 60 : undefined;
  const hoursPerDay = round(fromHeader ?? hoursByDay.values().next().value ?? 8, 4);
  const different = [...hoursByDay].filter(([, hours]) => Math.abs(hours - hoursPerDay) > 0.01);
  if (different.length)
    warn(
      'jornada_diferente',
      `A jornada do calendário (${different.map(([day, hours]) => `${WEEKDAY_NAMES[day]} ${round(hours, 2)} h`).join(', ')}) difere das ` +
        `${hoursPerDay} h por dia usadas para converter as durações; o sistema conta dias inteiros e ignora a diferença.`,
      { count: different.length },
    );
  const header = project.daysPerMonth;
  const daysPerMonth = header !== undefined && header >= 1 && header <= 31 ? Math.round(header) : 20;

  // Exceções expandidas dia a dia numa janela de um ano antes a três anos depois do mês do plano.
  const [year, monthIndex] = month.split('-').map(Number);
  const range = {
    start: dayNumber(new Date(Date.UTC(year - 1, monthIndex - 1, 1)).toISOString().slice(0, 10)),
    end: dayNumber(new Date(Date.UTC(year + 3, monthIndex, 0)).toISOString().slice(0, 10)),
  };
  const nonWorking = new Set<number>();
  const workingNames: string[] = [];
  let workingCount = 0;
  const unknownTypes = new Set<string>();
  let unknownCount = 0;
  for (const calendar of chain.slice().reverse()) {
    // Sem `<Exceptions>` (Project 2002), valem as exceções antigas, `WeekDay` com `DayType` 0.
    const list: MspdiException[] = calendar.exceptions.length
      ? calendar.exceptions
      : calendar.weekDays
          .filter(w => w.dayType === 0 && w.timePeriod)
          .map(w => ({ timePeriod: w.timePeriod!, type: 1, dayWorking: w.dayWorking, workingTimes: w.workingTimes }));
    for (const exception of list) {
      const days = expandException(exception, range);
      if (!days) {
        unknownCount++;
        unknownTypes.add(String(exception.type ?? '?'));
        continue;
      }
      if (exception.dayWorking) {
        if (days.length) {
          workingCount++;
          if (exception.name && workingNames.length < 3) workingNames.push(`"${exception.name}"`);
        }
        for (const day of days) nonWorking.delete(day);
      } else for (const day of days) nonWorking.add(day);
    }
    if (calendar.workWeekCount)
      warn('semana_alternativa', 'Semanas de trabalho alternativas do calendário foram ignoradas; vale a semana padrão.', {
        count: calendar.workWeekCount,
      });
  }
  if (workingCount)
    warn(
      'excecao_dia_util',
      `Exceções que tornam um dia útil ou mudam a jornada${workingNames.length ? ` (${workingNames.join(', ')})` : ''} não existem no ` +
        'sistema; esses dias seguem a semana padrão.',
      { count: workingCount },
    );
  if (unknownCount)
    warn(
      'recorrencia_desconhecida',
      `Exceções do calendário com recorrência desconhecida (tipo ${[...unknownTypes].join(', ')}) foram ignoradas; confira os feriados.`,
      { count: unknownCount },
    );
  // Só os dias que seriam úteis: o recesso que pega um fim de semana não vira feriado no sábado.
  let holidays = [...nonWorking]
    .filter(day => weekdays.includes(weekdayOf(day)))
    .sort((a, b) => a - b)
    .map(dayString);
  if (holidays.length > 1000) {
    warn('feriados_demais', 'O calendário tem mais de 1000 dias de exceção; ficaram os 1000 primeiros.', { count: holidays.length - 1000 });
    holidays = holidays.slice(0, 1000);
  }
  return { weekdays: weekdays.sort((a, b) => a - b), hoursPerDay, daysPerMonth, holidays };
}

// ————— Conversão para o rascunho —————

/** Inverso de `CONSTRAINT_CODES` (mspdi.ts). */
const CONSTRAINT_BY_CODE: ConstraintType[] = ['ASAP', 'ALAP', 'MSO', 'MFO', 'SNET', 'SNLT', 'FNET', 'FNLT'];
/** Inverso de `LINK_CODES` (mspdi.ts). */
const LINK_BY_CODE: LinkType[] = ['TT', 'TI', 'IT', 'II'];
const GENERIC_TITLE = /^(msproj\d*|projeto\d*|project\d*|sem t[íi]tulo|untitled)$/i;
/** `DurationFormat` e `LagFormat` estimados (35–53) são os mesmos códigos somados de 32. */
const baseFormat = (format: number | undefined) => (format !== undefined && format >= 35 && format <= 53 ? format - 32 : format);
/** Quantos dias de motor cada unidade vale (`durationDays` arredonda para cima). */
const daysPerUnit = (unit: TaskDuration['unit'], c: WorkCalendar) =>
  unit === 'h' ? 1 / c.hoursPerDay : unit === 'mês' ? c.daysPerMonth : unit === 'md' ? 30 : 1;

function planName(project: MspdiProject, fileName: string | undefined): string {
  const title = project.title?.trim();
  if (title && !GENERIC_TITLE.test(title)) return title;
  const file = (fileName ?? project.name ?? '')
    .split(/[\\/]/)
    .pop()!
    .replace(/\.[^.]+$/, '')
    .trim();
  return file || title || 'Plano importado';
}

/** Duração da folha na unidade do sistema mais próxima do formato do Project. */
function leafDuration(
  task: MspdiTask,
  start: LocalDate,
  finish: LocalDate,
  c: WorkCalendar,
  defaultFormat: number | undefined,
  key: string,
  warn: Warn,
): TaskDuration {
  const hours = parseXsdDuration(task.duration);
  if (task.milestone) {
    if (hours !== undefined && hours > 0)
      warn('marco_com_duracao', 'Marcos com duração no Project entraram como marco de duração zero.', { key });
    return { value: 0, unit: 'd' };
  }
  // Formato nulo (21, ou 53 estimado) é o padrão do projeto, como o MPXJ lê; o padrão nulo, dias.
  let format = baseFormat(task.durationFormat);
  if (format === undefined || format === 21) format = baseFormat(defaultFormat);
  if (format === undefined || format === 21) format = 7;
  if (hours === undefined || hours <= 0) {
    // Folha sem duração (a manual com duração em branco): os dias úteis entre o início e o término.
    const days = Math.max(1, countedDays(start, finish, true, c));
    warn('duracao_por_datas', 'Tarefas sem duração no arquivo ficaram com os dias úteis entre o início e o término.', { key });
    return { value: days, unit: 'd' };
  }
  let unit: TaskDuration['unit'];
  let value: number;
  let converted = false;
  switch (format) {
    case 5: // horas
      [unit, value] = ['h', hours];
      break;
    case 3: // minutos
      [unit, value, converted] = ['h', hours, true];
      break;
    case 7: // dias
      [unit, value] = ['d', hours / c.hoursPerDay];
      break;
    case 9: // semanas
    case 19: // porcentagem
      [unit, value, converted] = ['d', hours / c.hoursPerDay, true];
      break;
    case 8: // dias decorridos
      [unit, value] = ['dd', hours / 24];
      break;
    case 4: // minutos decorridos
    case 6: // horas decorridas
    case 10: // semanas decorridas
    case 20: // porcentagem decorrida
      [unit, value, converted] = ['dd', hours / 24, true];
      break;
    case 11: // meses: o "mês" do sistema é o mesmo do Project, `daysPerMonth` dias úteis
      [unit, value] = ['mês', hours / (c.hoursPerDay * c.daysPerMonth)];
      break;
    case 12: // meses decorridos: 30 dias corridos nos dois
      [unit, value] = ['md', hours / (24 * 30)];
      break;
    default:
      [unit, value, converted] = ['d', hours / c.hoursPerDay, true];
  }
  if (converted)
    warn(
      'unidade_convertida',
      'Durações em minutos, horas decorridas, semanas ou porcentagem foram convertidas para a unidade mais próxima do sistema.',
      { key },
    );
  value = Math.max(0, value);
  const rounded = round(value, 2);
  // Duração positiva que o arredondamento zeraria viraria marco.
  value = rounded === 0 && value > 0 ? 0.01 : rounded;
  if (value > 10000) {
    warn('duracao_limitada', 'Durações acima de 10000 unidades foram limitadas a 10000.', { key });
    value = 10000;
  }
  const engineDays = value * daysPerUnit(unit, c);
  if (Math.abs(engineDays - Math.round(engineDays)) > 1e-6)
    warn(
      'duracao_fracionada',
      'Durações com fração de dia foram mantidas, mas o cálculo do sistema conta dias inteiros (arredonda para cima).',
      { key },
    );
  return { value, unit };
}

interface Lag {
  lagDays: number;
  lagBusiness: boolean;
}
function convertLag(link: MspdiPredecessorLink, predecessorDays: number, c: WorkCalendar, key: string, warn: Warn): Lag {
  const format = baseFormat(link.lagFormat) ?? 7;
  let days: number;
  let business: boolean;
  if (format === 19 || format === 20) {
    // Porcentagem da duração da predecessora.
    business = format === 19;
    days = (link.linkLag / 100) * predecessorDays;
    warn('defasagem_percentual', 'Defasagens em porcentagem foram convertidas para dias pela duração da predecessora.', { key });
  } else {
    business = ![4, 6, 8, 10, 12].includes(format);
    const hours = link.linkLag / 600;
    days = hours / (business ? c.hoursPerDay : 24);
    if (![7, 8].includes(format) && link.linkLag !== 0)
      warn('defasagem_convertida', 'Defasagens em minutos, horas, semanas ou meses foram convertidas para dias.', { key });
  }
  let lagDays = Math.round(days) || 0;
  if (Math.abs(days - lagDays) > 1e-6)
    warn('defasagem_arredondada', 'Defasagens com fração de dia foram arredondadas para dias inteiros.', { key });
  if (Math.abs(lagDays) > 365) {
    warn('defasagem_limitada', 'Defasagens acima de 365 dias foram limitadas a 365.', { key });
    lagDays = Math.sign(lagDays) * 365;
  }
  return { lagDays, lagBusiness: business };
}

/** Converte o projeto lido para o rascunho do plano, nas regras do servidor, com os avisos do que
 * mudou no caminho. */
export function buildPlanImport(project: MspdiProject, options: PlanImportOptions): PlanImportDraft {
  const planStart = planWindow(options.month).start;
  const warnings = warningCollector();
  const warn = warnings.add;
  const calendar = buildCalendar(project, options.month, warn);

  // ——— Linhas que entram e o nível de cada uma ———
  interface Row {
    task: MspdiTask;
    key: string;
    level: number;
  }
  const rows: Row[] = [];
  const seen = new Set<number>();
  // Níveis originais dos ancestrais que entraram: o pai é o anterior mais próximo de nível menor,
  // então tirar uma tarefa (inativa) ou pular um degrau no arquivo não embaralha os irmãos.
  const outline: number[] = [];
  let ignoredNull = 0,
    ignoredInactive = 0;
  for (const task of project.tasks) {
    const key = String(task.uid);
    if (task.isNull) {
      ignoredNull++;
      continue;
    }
    // A tarefa de nível 0 é o resumo do projeto, que o sistema não tem.
    if (task.outlineLevel === 0 || (task.outlineLevel === undefined && task.uid === 0)) continue;
    if (seen.has(task.uid)) {
      warn('uid_repetido', 'Tarefas com UID repetido ficaram de fora (vale a primeira).', { key });
      continue;
    }
    seen.add(task.uid);
    if (!task.active) {
      ignoredInactive++;
      warn('tarefa_inativa', 'Tarefas inativas no Project ficaram de fora.', { key });
      continue;
    }
    const original = Math.max(1, Math.round(task.outlineLevel ?? 1));
    while (outline.length && outline[outline.length - 1] >= original) outline.pop();
    const level = outline.length;
    outline.push(original);
    if (level !== original - 1)
      warn('nivel_corrigido', 'O recuo foi corrigido para não pular nível (a tarefa-mãe ficou de fora ou o arquivo pulava um nível).', {
        key,
      });
    rows.push({ task, key, level });
  }
  const n = rows.length;
  const summary = rows.map((row, i) => i + 1 < n && rows[i + 1].level > row.level);
  // Fim da subárvore de cada linha: o primeiro índice que já não é descendente dela.
  const end = new Array<number>(n).fill(n);
  {
    const stack: number[] = [];
    for (let i = 0; i < n; i++) {
      while (stack.length && rows[stack[stack.length - 1]].level >= rows[i].level) end[stack.pop()!] = i;
      stack.push(i);
    }
  }
  const inside = (ancestor: number, row: number) => row > ancestor && row < end[ancestor];

  // ——— Recursos: o da primeira atribuição válida ———
  const resourceNames = new Map(project.resources.filter(r => !r.isNull && r.name.trim()).map(r => [r.uid, r.name.trim()]));
  const assigned = new Map<number, string[]>();
  for (const assignment of project.assignments) {
    const name = resourceNames.get(assignment.resourceUid);
    if (!name) continue;
    const list = assigned.get(assignment.taskUid) ?? [];
    if (!list.includes(name)) list.push(name);
    assigned.set(assignment.taskUid, list);
  }

  // ——— Tarefas ———
  const fallbackStart = datePart(project.startDate) ?? planStart;
  const fileDates: Record<string, { start: LocalDate; end: LocalDate }> = {};
  const baseline: Record<string, { start: LocalDate; end: LocalDate }> = {};
  let manualCount = 0;
  const tasks: DraftTask[] = rows.map((row, index): DraftTask => {
    const { task, key } = row;
    const isSummary = summary[index];
    let name = task.name.trim();
    if (!name) {
      name = `Tarefa sem nome (ID ${task.id ?? task.uid})`;
      warn('sem_nome', 'Tarefas sem nome receberam o nome "Tarefa sem nome (ID n)".', { key });
    }
    let start = datePart(task.start),
      finish = datePart(task.finish);
    if (!start || !finish) {
      warn('sem_datas', 'Tarefas sem início ou término no arquivo ficaram com as datas do início do projeto.', { key });
      start ??= finish ?? fallbackStart;
      finish ??= start;
    }
    if (finish < start) {
      warn('datas_invertidas', 'Tarefas com término antes do início ficaram com o término no início.', { key });
      finish = start;
    }
    fileDates[key] = { start, end: finish };
    const draft: DraftTask = {
      key,
      uid: task.uid,
      ...(task.id !== undefined ? { fileId: task.id } : {}),
      name,
      level: row.level,
      order: index + 1,
      summary: isSummary,
      plannedStart: start,
      plannedEnd: finish,
      progress: clamp(task.percentComplete, 0, 100),
    };
    if (task.manual) {
      draft.manual = true;
      manualCount++;
    }
    if (isSummary) {
      // Resumo: datas, duração, % e reais saem dos filhos; restrição e prazo final não são aceitos.
      if (task.manual)
        warn('resumo_manual', 'Tarefas-resumo agendadas manualmente passam a ter as datas calculadas pelas subtarefas.', { key });
      if (task.constraintType !== 0)
        warn('resumo_restricao', 'Restrições em tarefas-resumo foram descartadas (o sistema só aceita restrição nas subtarefas).', {
          key,
        });
      if (datePart(task.deadline))
        warn('resumo_prazo_final', 'Prazos finais em tarefas-resumo foram descartados (o sistema só aceita nas subtarefas).', { key });
    } else {
      if (task.summary)
        warn('resumo_sem_filhos', 'Tarefas-resumo cujas subtarefas ficaram todas de fora entraram como tarefas comuns.', { key });
      draft.duration = leafDuration(task, start, finish, calendar, project.durationFormat, key, warn);
      if (task.estimated || (task.durationFormat !== undefined && task.durationFormat >= 35 && task.durationFormat <= 53)) {
        draft.estimated = true;
        warn('duracao_estimada', 'Durações estimadas (com "?") entraram sem a marca de estimada.', { key });
      }
      let type: ConstraintType | undefined = CONSTRAINT_BY_CODE[task.constraintType];
      if (!type) {
        warn('restricao_desconhecida', 'Tipos de restrição desconhecidos viraram "O mais breve possível".', { key });
        type = 'ASAP';
      }
      let date = constraintNeedsDate(type) ? datePart(task.constraintDate) : undefined;
      if (constraintNeedsDate(type) && !date) {
        warn('restricao_sem_data', 'Restrições sem data viraram "O mais breve possível".', { key });
        type = 'ASAP';
      }
      if (task.manual) {
        // O sistema só agenda automático: a manual fica onde estava com "Não iniciar antes de".
        warn(
          'tarefa_manual',
          'Tarefas agendadas manualmente viraram automáticas; as sem restrição ganharam "Não iniciar antes de" no início que tinham.',
          { key },
        );
        if (type === 'ASAP') [type, date] = ['SNET', start];
      }
      if (type !== 'ASAP') draft.constraintType = type;
      if (date) draft.constraintDate = date;
      const deadline = datePart(task.deadline);
      if (deadline) draft.deadline = deadline;
      // Reais e %: as regras do servidor (término real só com 100%, % só com início real).
      let actualStart = datePart(task.actualStart),
        actualEnd = datePart(task.actualFinish);
      let progress = draft.progress;
      const before = JSON.stringify([actualStart, actualEnd, progress]);
      if (actualEnd && !actualStart) actualStart = start < actualEnd ? start : actualEnd;
      if (actualStart && actualEnd && actualEnd < actualStart) actualEnd = actualStart;
      if (actualEnd && progress < 100) progress = 100;
      if (!actualEnd && progress >= 100) {
        actualStart ??= start;
        actualEnd = finish > actualStart ? finish : actualStart;
      }
      if (progress > 0 && !actualStart) actualStart = start;
      if (JSON.stringify([actualStart, actualEnd, progress]) !== before)
        warn('real_ajustado', 'Datas reais e % concluída incoerentes foram ajustados (ex.: % sem início real, término real sem 100%).', {
          key,
        });
      draft.progress = progress;
      if (actualStart) draft.actualStart = actualStart;
      if (actualEnd) draft.actualEnd = actualEnd;
    }
    if (task.notes?.trim()) draft.notes = task.notes.trim();
    const names = assigned.get(task.uid);
    if (names?.length) {
      draft.resourceName = names[0];
      if (names.length > 1) warn('varios_recursos', 'Tarefas com mais de um recurso ficaram só com o primeiro.', { key });
    }
    const base = task.baselines.find(b => b.number === 0);
    const baseStart = datePart(base?.start),
      baseEnd = datePart(base?.finish);
    if (baseStart && baseEnd && baseEnd >= baseStart) baseline[key] = { start: baseStart, end: baseEnd };
    return draft;
  });
  // Resumo guarda o envelope das folhas (o que o sistema calcula na leitura), não a data do
  // arquivo — o resumo manual do Project pode estar a anos dos filhos.
  for (let i = 0; i < n; i++) {
    if (!summary[i]) continue;
    let first: LocalDate | undefined, last: LocalDate | undefined;
    for (let j = i + 1; j < end[i]; j++) {
      if (summary[j]) continue;
      if (!first || tasks[j].plannedStart < first) first = tasks[j].plannedStart;
      if (!last || tasks[j].plannedEnd > last) last = tasks[j].plannedEnd;
    }
    if (first && last) [tasks[i].plannedStart, tasks[i].plannedEnd] = [first, last];
  }

  // ——— Vínculos ———
  const indexByUid = new Map(rows.map((row, i) => [row.task.uid, i]));
  const durationInDays = (i: number) => {
    const t = tasks[i];
    return t.duration
      ? t.duration.value * daysPerUnit(t.duration.unit, calendar)
      : countedDays(t.plannedStart, t.plannedEnd, true, calendar);
  };
  interface RawLink extends Lag {
    from: number;
    to: number;
    type: LinkType;
  }
  const raw: RawLink[] = [];
  rows.forEach((row, to) => {
    for (const link of row.task.predecessorLinks) {
      if (link.crossProject) {
        warn('vinculo_externo', 'Vínculos com outros projetos foram descartados.', { key: row.key });
        continue;
      }
      const from = indexByUid.get(link.predecessorUid);
      if (from === to) {
        warn('vinculo_ciclo', 'Vínculos que fechariam um ciclo entre as tarefas foram descartados.', { key: row.key });
        continue;
      }
      if (from === undefined) {
        warn(
          'predecessora_ausente',
          'Vínculos cuja predecessora não entrou (inexistente, nula, inativa ou o resumo do projeto) foram descartados.',
          { key: row.key },
        );
        continue;
      }
      let type: LinkType | undefined = LINK_BY_CODE[link.type];
      if (!type) {
        warn('vinculo_tipo_desconhecido', 'Vínculos de tipo desconhecido entraram como término-início (TI).', { key: row.key });
        type = 'TI';
      }
      raw.push({ from, to, type, ...convertLag(link, durationInDays(from), calendar, row.key, warn) });
    }
  });

  // Folhas de borda de um resumo: as de entrada não recebem vínculo de dentro dele; as de saída não
  // mandam vínculo para dentro dele (o vínculo pode estar num resumo intermediário, que vale para
  // todas as folhas abaixo).
  const edgeMemo = new Map<string, number[]>();
  const edgeLeaves = (group: number, side: 'entry' | 'exit'): number[] => {
    const memo = edgeMemo.get(`${group}:${side}`);
    if (memo) return memo;
    const blocked = new Set<number>();
    for (const link of raw) {
      if (!inside(group, link.from) || !inside(group, link.to)) continue;
      const target = side === 'entry' ? link.to : link.from;
      if (summary[target]) for (let j = target + 1; j < end[target]; j++) blocked.add(j);
      else blocked.add(target);
    }
    const leaves: number[] = [],
      all: number[] = [];
    for (let j = group + 1; j < end[group]; j++)
      if (!summary[j]) {
        all.push(j);
        if (!blocked.has(j)) leaves.push(j);
      }
    const result = leaves.length ? leaves : all;
    edgeMemo.set(`${group}:${side}`, result);
    return result;
  };
  let links: DraftLink[] = [];
  const pairs = new Set<string>();
  const push = (from: number, to: number, link: RawLink, redistributed: boolean): 'ok' | 'repeated' => {
    const pair = `${from}>${to}`;
    if (pairs.has(pair)) return 'repeated';
    pairs.add(pair);
    links.push({
      predecessorKey: rows[from].key,
      successorKey: rows[to].key,
      type: link.type,
      lagDays: link.lagDays,
      lagBusiness: link.lagBusiness,
      ...(redistributed ? { redistributed: true } : {}),
    });
    return 'ok';
  };
  // Os vínculos diretos entre folhas vêm antes: valem sobre o que a redistribuição repetiria.
  for (const link of raw)
    if (!summary[link.from] && !summary[link.to] && push(link.from, link.to, link, false) === 'repeated')
      warn('vinculo_repetido', 'Vínculos repetidos entre as mesmas tarefas foram descartados.', { key: rows[link.to].key });
  let fromSummary = 0,
    created = 0,
    repeated = 0;
  const summaryKeys = new Set<string>();
  for (const link of raw) {
    if (!summary[link.from] && !summary[link.to]) continue;
    if (inside(link.from, link.to) || inside(link.to, link.from)) {
      warn('vinculo_resumo_proprio', 'Vínculos entre uma tarefa-resumo e as próprias subtarefas foram descartados.', {
        key: rows[link.to].key,
      });
      continue;
    }
    fromSummary++;
    summaryKeys.add(rows[link.from].key).add(rows[link.to].key);
    // O lado do vínculo diz a ponta do resumo: término (T) sai das folhas de saída, início (I) das de entrada.
    const sources = summary[link.from] ? edgeLeaves(link.from, link.type[0] === 'T' ? 'exit' : 'entry') : [link.from];
    const targets = summary[link.to] ? edgeLeaves(link.to, link.type[1] === 'I' ? 'entry' : 'exit') : [link.to];
    for (const source of sources)
      for (const target of targets)
        if (push(source, target, link, true) === 'ok') created++;
        else repeated++;
  }
  if (fromSummary) {
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    const result = [
      created ? plural(created, 'vínculo novo entre subtarefas', 'vínculos novos entre subtarefas') : '',
      repeated
        ? plural(repeated, 'que já existia entre as subtarefas e foi descartado', 'que já existiam entre as subtarefas e foram descartados')
        : '',
    ]
      .filter(Boolean)
      .join(' e ');
    const message =
      `${plural(fromSummary, 'vínculo do arquivo ligado a tarefa-resumo foi passado', 'vínculos do arquivo ligados a tarefas-resumo foram passados')} ` +
      `para as subtarefas (o sistema só vincula subtarefas)${result ? `: ${result}` : ''}. O que chega no resumo vai ` +
      'para as subtarefas sem predecessora dentro dele; o que sai, das subtarefas sem sucessora dentro dele.';
    warn('vinculo_resumo', message, { count: fromSummary });
    for (const key of summaryKeys) warn('vinculo_resumo', message, { key, count: 0 });
  }
  links = dropCycles(links, warn);

  // ——— Recursos, limites e números ———
  const counts = new Map<string, number>();
  for (const task of tasks) if (task.resourceName) counts.set(task.resourceName, (counts.get(task.resourceName) ?? 0) + 1);
  const resources = [...new Set([...resourceNames.values(), ...counts.keys()])]
    .filter(name => counts.has(name))
    .map(name => ({ name, taskCount: counts.get(name)! }));
  if (tasks.length > 3000 || links.length > 10000)
    warn(
      'limite_excedido',
      `O sistema grava até 3000 tarefas e 10000 vínculos por plano; o arquivo tem ${tasks.length} tarefas e ${links.length} vínculos.`,
    );
  const leaves = tasks.filter(t => !t.summary);
  const stats: PlanImportStats = {
    tasks: tasks.length,
    summaries: tasks.length - leaves.length,
    leaves: leaves.length,
    milestones: leaves.filter(t => t.duration?.value === 0).length,
    links: links.length,
    completed: leaves.filter(t => t.actualEnd).length,
    inProgress: leaves.filter(t => t.actualStart && !t.actualEnd).length,
    withBaseline: Object.keys(baseline).length,
    manual: manualCount,
    estimated: leaves.filter(t => t.estimated).length,
    constrained: leaves.filter(t => t.constraintType).length,
    deadlines: leaves.filter(t => t.deadline).length,
    withResource: tasks.filter(t => t.resourceName).length,
    holidays: calendar.holidays.length,
    ignoredNull,
    ignoredInactive,
  };
  const projectStart = datePart(project.startDate);
  return {
    name: planName(project, options.fileName),
    calendar,
    ...(projectStart ? { projectStart } : {}),
    tasks,
    links,
    ...(Object.keys(baseline).length ? { baseline } : {}),
    fileDates,
    resources,
    warnings: warnings.list,
    stats,
  };
}

/** O motor recusa ciclo; o Project também, mas a redistribuição dos resumos ou um arquivo mexido à
 * mão podem fechar um. Os vínculos entram na ordem e cai o que fecharia o ciclo. */
function dropCycles(links: DraftLink[], warn: Warn): DraftLink[] {
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const link of links) {
    indegree.set(link.successorKey, (indegree.get(link.successorKey) ?? 0) + 1);
    if (!indegree.has(link.predecessorKey)) indegree.set(link.predecessorKey, 0);
    outgoing.set(link.predecessorKey, [...(outgoing.get(link.predecessorKey) ?? []), link.successorKey]);
  }
  const queue = [...indegree].filter(([, d]) => d === 0).map(([key]) => key);
  for (let i = 0; i < queue.length; i++)
    for (const next of outgoing.get(queue[i]) ?? []) {
      indegree.set(next, indegree.get(next)! - 1);
      if (!indegree.get(next)) queue.push(next);
    }
  if (queue.length === indegree.size) return links;
  const graph = new Map<string, string[]>();
  const reaches = (from: string, target: string) => {
    const stack = [from],
      visited = new Set<string>();
    while (stack.length) {
      const key = stack.pop()!;
      if (key === target) return true;
      if (visited.has(key)) continue;
      visited.add(key);
      stack.push(...(graph.get(key) ?? []));
    }
    return false;
  };
  return links.filter(link => {
    if (reaches(link.successorKey, link.predecessorKey)) {
      warn('vinculo_ciclo', 'Vínculos que fechariam um ciclo entre as tarefas foram descartados.', { key: link.successorKey });
      return false;
    }
    graph.set(link.predecessorKey, [...(graph.get(link.predecessorKey) ?? []), link.successorKey]);
    return true;
  });
}
