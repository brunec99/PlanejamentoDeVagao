/** Gantt de legalização (04/11/2026, modelo de UX aprovado, regras 1–18): os 12 meses até a entrega
 * da obra, com o caminho crítico da obra e a legalização por órgão até as chaves. É o mesmo
 * cronograma do médio prazo (tabela e Gantt do Project, motor `analyzeSchedule`), gravado como um
 * `MediumTermPlan` com `kind: 'legalizacao'`; aqui ficam só o que é dele: o tipo, a janela, o modelo
 * ATR, o resumo do topo e a importação da Linha de Balanço. Funções puras. */
import type { Id, LocalDate, MediumTermPlan, PlanDependency, PlanTask } from './entities';
import { lobSpan, measuredPercents, type LobData } from './lob';
import {
  DEFAULT_CALENDAR,
  countedDays,
  isWorking,
  nextWorking,
  shift,
  signedWorkingDays,
  type ScheduleAnalysis,
  type TaskDuration,
  type WorkCalendar,
  scheduleTasks,
} from './plan-schedule';
import { rollUpPlan } from './rules';
import { validateDate } from './validation';

export const LEGALIZATION_KIND = 'legalizacao' as const;
/** Nome padrão do cronograma, quando a pessoa não dá outro. */
export const LEGALIZATION_DEFAULT_NAME = 'Gantt de legalização';
/** Meses da janela antes da entrega (regra 6). */
export const LEGALIZATION_WINDOW_MONTHS = 12;

/** O Gantt de legalização (e as linhas de base dele). */
export const isLegalizationPlan = (plan: Pick<MediumTermPlan, 'kind'> | undefined): boolean => plan?.kind === LEGALIZATION_KIND;
/** O plano mensal do médio prazo: tudo o que não é Gantt de legalização (regra 17). */
export const isMonthlyPlan = (plan: Pick<MediumTermPlan, 'kind'>): boolean => !isLegalizationPlan(plan);
/** Os ids dos cronogramas de legalização (vivos e linhas de base), para quem filtra tarefas sem passar pelos planos. */
export const legalizationPlanIds = (plans: readonly MediumTermPlan[]): Set<Id> => new Set(plans.filter(isLegalizationPlan).map(p => p.id));

/** A mesma data `months` meses antes ou depois; no dia 31 de um mês curto, o último dia dele. */
function addMonths(date: LocalDate, months: number): LocalDate {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}
const nextDay = (date: LocalDate) => new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

/** Janela de 12 meses que termina na entrega (regra 6): entrega 30/09/2027 → 01/10/2026 a 30/09/2027. */
export function legalizationWindow(deliveryDate: LocalDate): { start: LocalDate; end: LocalDate } {
  validateDate(deliveryDate);
  return { start: nextDay(addMonths(deliveryDate, -LEGALIZATION_WINDOW_MONTHS)), end: deliveryDate };
}
/** O `month` gravado no plano: o mês em que a janela começa (a coluna exige AAAA-MM). */
export const legalizationMonth = (deliveryDate: LocalDate) => legalizationWindow(deliveryDate).start.slice(0, 7);

// ─── Modelo ATR de legalização (regras 11 e 12) ─────────────────────────────────

const d = (value: number): TaskDuration => ({ value, unit: 'd' });
const dd = (value: number): TaskDuration => ({ value, unit: 'dd' });
interface TemplateLink {
  from: string;
  type?: PlanDependency['type'];
  lag?: number;
}
export interface LegalizationTemplateRow {
  key: string;
  name: string;
  level: number;
  /** Sem duração = linha de resumo (o órgão ou o bloco). Zero = marco. */
  duration?: TaskDuration;
  links?: TemplateLink[];
  /** Tarefa sem predecessora: dias úteis depois da origem do modelo; vira "Não iniciar antes de". */
  offset?: number;
  /** O marco da entrega: recebe o prazo final na data contratual. */
  delivery?: true;
}
/** As 38 linhas do modelo aprovado: o caminho crítico da obra, a legalização por órgão (as esperas de
 * órgão em dias corridos) e o marco da entrega. Os nomes de resumo são os que o resumo do topo
 * reconhece ("Legalização", "Caminho crítico da obra"). */
export const LEGALIZATION_TEMPLATE: readonly LegalizationTemplateRow[] = [
  { key: 'obra', name: 'Caminho crítico da obra', level: 0 },
  { key: 'alvenaria', name: 'Alvenaria e contrapiso dos últimos pavimentos', level: 1, duration: d(45), offset: 9 },
  {
    key: 'instalacoes',
    name: 'Instalações: prumadas, quadros e barramentos',
    level: 1,
    duration: d(70),
    links: [{ from: 'alvenaria', type: 'II', lag: 20 }],
  },
  { key: 'fachada', name: 'Fachada: reboco, revestimento e pintura', level: 1, duration: d(130), offset: 30 },
  {
    key: 'incendio',
    name: 'Sistema de incêndio: hidrantes, sprinklers, alarme e pressurização',
    level: 1,
    duration: d(55),
    links: [{ from: 'instalacoes', type: 'II', lag: 30 }],
  },
  { key: 'elevadores', name: 'Elevadores: montagem, ajustes e comissionamento', level: 1, duration: d(90), offset: 65 },
  { key: 'acabamentos', name: 'Acabamentos internos dos apartamentos', level: 1, duration: d(150), links: [{ from: 'alvenaria' }] },
  { key: 'areas', name: 'Áreas comuns, lazer e paisagismo', level: 1, duration: d(80), links: [{ from: 'fachada', type: 'II', lag: 60 }] },
  {
    key: 'limpeza',
    name: 'Limpeza final',
    level: 1,
    duration: d(15),
    links: [{ from: 'acabamentos' }, { from: 'areas' }, { from: 'fachada' }],
  },
  { key: 'vistoriaInterna', name: 'Vistoria interna de terminalidade', level: 1, duration: d(15), links: [{ from: 'limpeza' }] },
  { key: 'vistoriaClientes', name: 'Vistoria com os clientes', level: 1, duration: d(20), links: [{ from: 'vistoriaInterna' }] },
  { key: 'legal', name: 'Legalização', level: 0 },
  { key: 'bombeiros', name: 'Corpo de Bombeiros: AVCB', level: 1 },
  { key: 'projetoIncendio', name: 'Projeto de incêndio: revisão final aprovada', level: 2, duration: d(30), offset: 0 },
  {
    key: 'laudos',
    name: 'Laudos e ARTs (SPDA, pressurização, gás, iluminação de emergência)',
    level: 2,
    duration: d(10),
    links: [{ from: 'incendio' }],
  },
  {
    key: 'protocoloAvcb',
    name: 'Protocolo da vistoria',
    level: 2,
    duration: d(0),
    links: [{ from: 'laudos' }, { from: 'projetoIncendio' }],
  },
  { key: 'vistoriaBombeiros', name: 'Vistoria do Corpo de Bombeiros', level: 2, duration: dd(30), links: [{ from: 'protocoloAvcb' }] },
  { key: 'avcb', name: 'AVCB emitido', level: 2, duration: d(0), links: [{ from: 'vistoriaBombeiros' }] },
  { key: 'concessionarias', name: 'Concessionárias', level: 1 },
  { key: 'energiaProjeto', name: 'Energia: aprovação do projeto de entrada', level: 2, duration: dd(45), offset: 54 },
  {
    key: 'energiaLigacao',
    name: 'Energia: pedido de ligação, vistoria e ligação definitiva',
    level: 2,
    duration: dd(30),
    links: [{ from: 'energiaProjeto' }, { from: 'instalacoes' }],
  },
  { key: 'agua', name: 'Água e esgoto: vistoria e ligação definitiva', level: 2, duration: dd(30), links: [{ from: 'instalacoes' }] },
  { key: 'gas', name: 'Gás: teste de estanqueidade e ligação', level: 2, duration: d(10), links: [{ from: 'incendio' }] },
  {
    key: 'elevadoresLicenca',
    name: 'Elevadores: inspeção e licença de funcionamento',
    level: 2,
    duration: d(15),
    links: [{ from: 'elevadores' }],
  },
  { key: 'prefeitura', name: 'Prefeitura: Habite-se', level: 1 },
  {
    key: 'docsHabitese',
    name: 'Documentos do Habite-se (AVCB, ligações, laudos, ARTs, CTRs de resíduos)',
    level: 2,
    duration: d(10),
    links: [
      { from: 'avcb' },
      { from: 'energiaLigacao' },
      { from: 'agua' },
      { from: 'gas' },
      { from: 'elevadoresLicenca' },
      { from: 'areas' },
    ],
  },
  { key: 'protocoloHabitese', name: 'Protocolo do Habite-se', level: 2, duration: d(0), links: [{ from: 'docsHabitese' }] },
  { key: 'vistoriaPrefeitura', name: 'Vistoria da prefeitura', level: 2, duration: dd(60), links: [{ from: 'protocoloHabitese' }] },
  { key: 'habitese', name: 'Habite-se emitido', level: 2, duration: d(0), links: [{ from: 'vistoriaPrefeitura' }] },
  { key: 'receita', name: 'Receita Federal: CND da obra', level: 1 },
  {
    key: 'afericao',
    name: 'Aferição e regularização da obra (SERO e DCTFWeb)',
    level: 2,
    duration: dd(30),
    links: [{ from: 'protocoloHabitese' }],
  },
  { key: 'cnd', name: 'CND da obra emitida', level: 2, duration: d(0), links: [{ from: 'afericao' }] },
  { key: 'cartorio', name: 'Cartório e condomínio', level: 1 },
  {
    key: 'averbacao',
    name: 'Averbação da construção na matrícula',
    level: 2,
    duration: dd(45),
    links: [{ from: 'habitese' }, { from: 'cnd' }],
  },
  {
    key: 'instituicao',
    name: 'Instituição do condomínio e individualização das matrículas',
    level: 2,
    duration: dd(45),
    links: [{ from: 'averbacao' }],
  },
  { key: 'assembleia', name: 'Assembleia de instalação do condomínio', level: 2, duration: d(0), links: [{ from: 'habitese', lag: 10 }] },
  { key: 'manuais', name: 'Manuais do proprietário e das áreas comuns (NBR 14037)', level: 2, duration: d(20), offset: 174 },
  {
    key: 'entrega',
    name: 'Entrega das chaves',
    level: 0,
    duration: d(0),
    links: [{ from: 'vistoriaClientes' }, { from: 'instituicao' }, { from: 'assembleia' }, { from: 'manuais' }],
    delivery: true,
  },
];

export interface LegalizationBuildInput {
  planId: Id;
  deliveryDate: LocalDate;
  template: 'atr' | 'blank';
  calendar?: WorkCalendar;
  newId: () => Id;
  now: string;
}
/** As linhas e os vínculos com que o Gantt nasce, já agendados pelo motor (o servidor confere as
 * datas a cada gravação). "Em branco" é só o marco da entrega com o prazo final. O modelo ATR é
 * montado de trás para frente (regra 12): a origem anda em dias úteis até o marco da entrega cair na
 * data contratual (ou no dia útil anterior, quando ela cai em fim de semana); as tarefas sem
 * predecessora ficam com "Não iniciar antes de" e, daí em diante, o motor agenda para frente. */
export function buildLegalizationTasks(input: LegalizationBuildInput): { tasks: PlanTask[]; links: PlanDependency[] } {
  const { planId, deliveryDate, now } = input;
  const calendar = input.calendar ?? DEFAULT_CALENDAR;
  validateDate(deliveryDate);
  const stamp = { createdAt: now, updatedAt: now };
  const rows = input.template === 'blank' ? LEGALIZATION_TEMPLATE.filter(r => r.delivery) : LEGALIZATION_TEMPLATE;
  const ids = new Map(rows.map(r => [r.key, input.newId()]));
  const linksOf = (r: LegalizationTemplateRow) => (r.links ?? []).filter(l => ids.has(l.from));
  const links: PlanDependency[] = rows.flatMap(r =>
    linksOf(r).map(l => ({
      id: input.newId(),
      ...stamp,
      predecessorId: ids.get(l.from)!,
      successorId: ids.get(r.key)!,
      type: l.type ?? 'TI',
      lagDays: l.lag ?? 0,
      lagBusiness: true,
    })),
  );
  const at = (origin: LocalDate): PlanTask[] =>
    rows.map((r, index) => {
      const start = r.offset === undefined ? origin : shift(origin, r.offset, true, calendar);
      const root = r.duration !== undefined && !linksOf(r).length;
      return {
        id: ids.get(r.key)!,
        ...stamp,
        planId,
        name: r.name,
        plannedStart: start,
        plannedEnd: start,
        ...(r.duration ? { duration: r.duration } : {}),
        // O marco da entrega sozinho ("Em branco") fica na data guardada, a da entrega.
        ...(root && !r.delivery ? { constraintType: 'SNET' as const, constraintDate: start } : {}),
        ...(r.delivery ? { deadline: deliveryDate } : {}),
        progress: 0,
        order: index + 1,
        level: r.level,
      };
    });
  // Entrega em fim de semana ou feriado: o marco fica no dia útil anterior, para não nascer atrasado.
  const target = isWorking(deliveryDate, calendar) ? deliveryDate : shift(deliveryDate, -1, true, calendar);
  if (input.template === 'blank') return { tasks: scheduleTasks(at(target), links, calendar), links };
  const deliveryId = ids.get(rows.find(r => r.delivery)!.key)!;
  // Chute inicial: a rede do modelo tem cerca de 280 dias úteis; o laço corrige o resto.
  let origin = shift(target, -280, true, calendar);
  let best: PlanTask[] | undefined;
  for (let round = 0; round < 8; round++) {
    const scheduled = scheduleTasks(at(origin), links, calendar);
    const finish = scheduled.find(t => t.id === deliveryId)!.plannedEnd;
    // Marco depois de espera em dias corridos pode cair no domingo: zero dia útil de diferença, mas depois do prazo.
    let gap = signedWorkingDays(finish, target, calendar);
    if (gap === 0 && finish > target) gap = -1;
    if (finish <= target && (!best || finish > best.find(t => t.id === deliveryId)!.plannedEnd)) best = scheduled;
    if (gap === 0) break;
    origin = shift(origin, gap, true, calendar);
  }
  return { tasks: best ?? scheduleTasks(at(origin), links, calendar), links };
}

// ─── Resumo do topo (regras 9 e 10) ─────────────────────────────────────────────

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const isMilestoneTask = (t: Pick<PlanTask, 'duration'>) => t.duration?.value === 0;

/** As folhas abaixo da linha de resumo com este nome (sem acento), na ordem da tabela. */
function leavesUnder(tasks: PlanTask[], name: string): PlanTask[] {
  const rows = tasks.slice().sort((a, b) => a.order - b.order);
  const at = rows.findIndex(t => plain(t.name) === plain(name));
  if (at < 0) return [];
  const result: PlanTask[] = [];
  for (let i = at + 1; i < rows.length && rows[i].level > rows[at].level; i++)
    if (!(rows[i + 1]?.level > rows[i].level)) result.push(rows[i]);
  return result;
}

export interface LegalizationSummary {
  deliveryDate: LocalDate;
  /** O marco que carrega o prazo final da entrega; sem ele, o fim do cronograma. */
  deliveryTaskId?: Id;
  forecast?: LocalDate;
  /** Dias úteis entre a entrega contratual e a prevista: positivo = atraso. */
  lateDays: number;
  /** Folga total do marco da entrega (negativa quando a entrega passa do prazo). */
  deliverySlack?: number;
  criticalCount: number;
  milestones: { done: number; total: number };
  next?: { id: Id; name: string; date: LocalDate };
  /** A cadeia que segura a entrega, das predecessoras determinantes críticas, da mais antiga à
   * entrega. Marcos intermediários ficam de fora para a frase caber numa linha. */
  chain: { id: Id; name: string }[];
  /** Menor folga entre as tarefas do bloco "Caminho crítico da obra", quando ele existe. */
  workSlack?: number;
}
/** O que o topo do Gantt mostra, calculado sobre o rascunho já analisado pelo motor. */
export function legalizationSummary(
  tasks: PlanTask[],
  analysis: Pick<ScheduleAnalysis, 'info' | 'projectFinish'>,
  deliveryDate: LocalDate,
  today: LocalDate,
  calendar: WorkCalendar = DEFAULT_CALENDAR,
): LegalizationSummary {
  const roll = rollUpPlan(tasks);
  const leaves = tasks.filter(t => !roll.get(t.id)?.summary);
  const info = (id: Id) => analysis.info.get(id);
  // O marco da entrega é a folha com o prazo final na entrega; se outra tarefa também tem esse prazo
  // ("tem de estar pronta até lá"), o marco (duração zero) e, entre marcos, o último da tabela ganham.
  const withDeadline = leaves.filter(t => t.deadline === deliveryDate);
  const delivery =
    withDeadline.filter(isMilestoneTask).sort((a, b) => b.order - a.order)[0] ??
    withDeadline.sort((a, b) => b.order - a.order)[0] ??
    leaves.find(t => isMilestoneTask(t) && plain(t.name).includes('entrega'));
  const forecast = delivery ? (roll.get(delivery.id)?.plannedEnd ?? delivery.plannedEnd) : analysis.projectFinish;
  const legal = leavesUnder(tasks, 'Legalização').filter(isMilestoneTask);
  const upcoming = legal
    .filter(t => t.progress < 100)
    .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart) || a.order - b.order)
    .find(t => t.plannedStart >= today);
  const chain: { id: Id; name: string }[] = [];
  if (delivery) {
    const seen = new Set<Id>();
    let current: PlanTask | undefined = delivery;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      if (current === delivery || !isMilestoneTask(current)) chain.unshift({ id: current.id, name: current.name });
      const drivers: Id[] = info(current.id)?.driverIds ?? [];
      current = drivers
        .map(id => leaves.find(t => t.id === id))
        .filter((t): t is PlanTask => !!t)
        .sort(
          (a, b) =>
            Number(!!info(b.id)?.critical) - Number(!!info(a.id)?.critical) ||
            (info(a.id)?.totalSlack ?? 0) - (info(b.id)?.totalSlack ?? 0),
        )[0];
    }
  }
  const work = leavesUnder(tasks, 'Caminho crítico da obra')
    .map(t => info(t.id)?.totalSlack)
    .filter((n): n is number => n !== undefined);
  return {
    deliveryDate,
    deliveryTaskId: delivery?.id,
    forecast,
    lateDays: forecast ? signedWorkingDays(deliveryDate, forecast, calendar) || 0 : 0,
    deliverySlack: delivery ? info(delivery.id)?.totalSlack : undefined,
    criticalCount: leaves.filter(t => info(t.id)?.critical).length,
    milestones: { done: legal.filter(t => t.progress === 100).length, total: legal.length },
    next: upcoming ? { id: upcoming.id, name: upcoming.name, date: upcoming.plannedStart } : undefined,
    chain,
    workSlack: work.length ? Math.min(...work) : undefined,
  };
}

// ─── Trazer da Linha de Balanço (regras 15 e 16) ────────────────────────────────

export interface LobServiceRow {
  serviceId: Id;
  name: string;
  locals: number;
  /** Início do primeiro local e término (último dia útil) do último. */
  start: LocalDate;
  finish: LocalDate;
  /** % medido do serviço: os blocos ponderados pela duração, pela última medição fechada. */
  percent: number;
  /** Termina dentro da janela (ou depois dela, começando antes do fim): entra marcado. */
  inWindow: boolean;
}
/** Um resumo por serviço da Linha de Balanço, na ordem dos serviços. */
export function lobServiceRows(
  lob: Pick<LobData, 'services' | 'activities' | 'measurements' | 'items'>,
  window: { start: LocalDate; end: LocalDate },
): LobServiceRow[] {
  const percents = measuredPercents(lob.measurements, lob.items);
  return lob.services
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex || a.name.localeCompare(b.name))
    .flatMap(service => {
      const blocks = lob.activities.filter(a => a.serviceId === service.id);
      const span = lobSpan(blocks);
      if (!span) return [];
      const weight = blocks.reduce((n, a) => n + Math.max(1, a.durationDays), 0);
      const done = blocks.reduce((n, a) => n + Math.max(1, a.durationDays) * (percents[a.id] ?? 0), 0);
      return [
        {
          serviceId: service.id,
          name: service.name,
          locals: new Set(blocks.map(a => a.localId)).size,
          start: span.start,
          finish: span.finish,
          percent: Math.round(done / weight),
          inWindow: span.finish >= window.start && span.start <= window.end,
        },
      ];
    });
}

/** Leva os serviços escolhidos para o rascunho (regra 15): linha nova no fim do bloco "Caminho
 * crítico da obra" (ou no fim do cronograma, se ele não existir), com "Não iniciar antes de" no
 * início da Linha de Balanço, duração em dias úteis do primeiro ao último dia e o % medido. Linha que
 * já veio deste serviço é atualizada (regra 16) — início, duração e %, sem tocar em nome, vínculos,
 * nível ou anotações. Devolve as tarefas na ordem nova; o chamador reagenda. */
export function applyLobImport(
  tasks: PlanTask[],
  rows: LobServiceRow[],
  options: { planId: Id; calendar?: WorkCalendar; newId: () => Id; now: string },
): { tasks: PlanTask[]; added: number; updated: number } {
  const calendar = options.calendar ?? DEFAULT_CALENDAR;
  const list = tasks.slice().sort((a, b) => a.order - b.order);
  const fields = (row: LobServiceRow) => {
    const start = nextWorking(row.start, calendar);
    const finish = row.finish < start ? start : row.finish;
    const progress = Math.max(0, Math.min(100, Math.round(row.percent)));
    return {
      constraintType: 'SNET' as const,
      constraintDate: start,
      plannedStart: start,
      plannedEnd: finish,
      duration: { value: countedDays(start, finish, true, calendar), unit: 'd' as const },
      progress,
      actualStart: progress > 0 ? start : undefined,
      actualEnd: progress === 100 ? finish : undefined,
      anchorStart: undefined,
    };
  };
  let added = 0,
    updated = 0;
  const fresh: PlanTask[] = [];
  for (const row of rows) {
    const at = list.findIndex(t => t.lobServiceId === row.serviceId);
    if (at >= 0) {
      list[at] = { ...list[at], ...fields(row), updatedAt: options.now };
      updated++;
      continue;
    }
    fresh.push({
      id: options.newId(),
      createdAt: options.now,
      updatedAt: options.now,
      planId: options.planId,
      name: row.name,
      lobServiceId: row.serviceId,
      ...fields(row),
      order: 0,
      level: 0,
    });
    added++;
  }
  if (fresh.length) {
    const group = list.findIndex(t => plain(t.name) === plain('Caminho crítico da obra'));
    let insertAt = list.length,
      level = 0;
    if (group >= 0) {
      insertAt = group + 1;
      while (insertAt < list.length && list[insertAt].level > list[group].level) insertAt++;
      level = list[group].level + 1;
    }
    list.splice(insertAt, 0, ...fresh.map(t => ({ ...t, level })));
  }
  return { tasks: list.map((t, i) => ({ ...t, order: i + 1 })), added, updated };
}
