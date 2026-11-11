import type { Activity, PlanningData, Restriction, User } from '../../domain/entities';
import { nameKey, type AgentBriefing } from '../../domain/agent-briefing';
import type { TerminalityData } from '../../domain/terminality';
import type { SafetyData } from '../../domain/safety';
import {
  closedMeasurements,
  delayDays,
  isLate,
  lobSpan,
  measuredPercents,
  openMeasurement,
  physicalProgress,
  plannedPercent,
  plannedProgress,
  type LobActivity,
  type LobData,
  type LobMeasurementItem,
} from '../../domain/lob';
import {
  formatIdp,
  IDP_TONE_LABEL,
  idpTone,
  lobPerformance,
  servicePerformance,
  weightingLabel,
  type LobPerformance,
} from '../../domain/lob-performance';
import { leadTimeDeadline } from '../../domain/rules';
import { addDays, startOfWeek } from '../../domain/validation';
import { weekNumberFrom } from '../../domain/week-numbering';
import { bucketKey, bucketLabel, isBucketKey, type PeriodGrouping, type PeriodSelection } from '../../modules/dashboard/period';
import { boardStatusLabels, releaseLabels, statusLabels, wagonLabel } from '../../shared/format';
import { AGENT_TOOL_SPECS, runAgentTool, type AgentToolSpec, type ToolContext, type ToolOutcome } from './agent-tools';
import { SAFETY_TOOL_SPEC, safetyReport, TERMINALITY_TOOL_SPEC, terminalityReport, type ModuleReportEntry } from './agent-module-reports';
import { selectWorkPlanning, type Planning } from './get-planning';

/** Ferramentas da Claudia geral (08/11/2026, aprovada pelo usuário): a janela flutuante do admin, em qualquer
 * tela, conversa sobre QUALQUER obra e QUALQUER módulo e compara obras. Este arquivo é a despachante: recebe o
 * nome da ferramenta, descobre a obra (parâmetro `obra` ou a obra da tela em que a pessoa está), pede os dados
 * ao carregador do servidor (`AgentDataLoader`, preguiçoso e memorizado por requisição) e devolve texto.
 *
 * Decisões de 08/11/2026:
 * - As sete ferramentas da Claudia de uma obra (`agent-tools.ts`) entram com o mesmo nome e o mesmo esquema,
 *   mais `obra`; o texto volta prefixado com a obra ("Obra Mozine (MZN). …") para o modelo nunca misturar
 *   obras, e a proposta leva `workId`/`workName` para o cartão dizer de que obra é. O modelo continua sem
 *   gravar nada: as ferramentas de edição devolvem propostas que a tela aplica.
 * - Acesso: a Claudia geral é só do admin, e o carregador já recorta as obras e os dados; aqui não se
 *   confere módulo liberado. Os `levels` que vêm em `workContext` seguem valendo nas ferramentas antigas.
 * - Todo resultado (menos o do manual, que tem limite próprio) é cortado em `MAX_RESULT_CHARS`, com aviso.
 *   Nada sai desta função como exceção: obra desconhecida, entrada inválida ou falha do carregador viram
 *   `{ error: true }` com explicação em português.
 * - `workIds` diz quais obras a chamada leu, para atribuir o custo: a obra cujos dados foram carregados (mesmo
 *   que a ferramenta antiga recuse a entrada depois), vazio no manual, na lista e quando a leitura falha.
 *   `consulted` (o selo cinza sob a resposta) só sai quando a chamada deu certo. */

// ─── Contrato ───────────────────────────────────────────────────────────────────

export interface AgentWorkRef {
  id: string;
  name: string;
  code: string;
  active: boolean;
}
export interface WorkSettingsInfo {
  weekOne?: string;
  place?: string;
}
/** Implementado no servidor (preguiçoso, memorizado por requisição). */
export interface AgentDataLoader {
  /** O mesmo ToolContext da Claudia de uma obra (planejamento recortado, plano de longo prazo, semana 1, níveis, autor, newId). */
  workContext(workId: string): Promise<ToolContext>;
  /** Dossiê determinístico da obra (`buildBriefing`), com os achados do radar. */
  briefing(workId: string): Promise<AgentBriefing>;
  /** Saída de `getPlanning()` recortada para a obra (vagões com status, takt vencido e avanço). */
  planning(workId: string): Promise<Planning>;
  /** null = módulo indisponível (migração não aplicada). */
  terminality(workId: string): Promise<TerminalityData | null>;
  safety(workId: string): Promise<SafetyData | null>;
  lob(workId: string): Promise<LobData | null>;
  workSettings(workId: string): Promise<WorkSettingsInfo>;
  /** Comparação entre obras (os mesmos números do Dashboard geral) já em texto compacto, uma linha por obra. */
  portfolio(selection: PeriodSelection, workIds: string[]): Promise<string>;
}
export interface GlobalToolContext {
  /** Obras que a pessoa pode abrir (profile.workIds), ativas e inativas. */
  works: AgentWorkRef[];
  /** Obra da tela em que a pessoa está, se houver. */
  contextWorkId?: string;
  /** AAAA-MM-DD, São Paulo. */
  today: string;
  actor: { id: string; role: User['role'] };
  loader: AgentDataLoader;
  newId: () => string;
  /** Opcional: recebe as falhas do carregador (para a rota registrar); a pessoa só vê a mensagem em português. */
  onError?: (cause: unknown, info: { tool: string; workId?: string }) => void;
}
export interface GlobalToolOutcome extends ToolOutcome {
  /** Selo curto mostrado em cinza sob a resposta: "Terminalidade · Mozine", "Panorama das obras", "Manual do sistema". */
  consulted?: string;
  /** Obras que esta chamada leu (para atribuir o custo). Vazio no manual e na lista. */
  workIds: string[];
}

// ─── Limites e textos ───────────────────────────────────────────────────────────

export const MAX_RESULT_CHARS = 12_000;
/** Quantas semanas o panorama compara quando o modelo não diz o período. */
export const PANORAMA_DEFAULT_WEEKS = 4;
const MAX_WAGONS = 150;
const MAX_ITEMS = 40;
const MAX_LATE_BLOCKS = 15;
const MAX_RELEASES = 5;
const MAX_TEAMS = 200;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (value: string) => DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const dm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const dmy = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
const pct = (n: number) => `${Math.round(n)}%`;
const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const cut = (value: string, max = 120) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);
const text = (value: unknown) =>
  typeof value === 'string' ? value.trim() : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const withoutObra = (args: Record<string, unknown>) => Object.fromEntries(Object.entries(args).filter(([key]) => key !== 'obra'));

/** Corta o texto no limite, numa quebra de linha quando dá, com o aviso no fim. */
export function capResult(value: string, max = MAX_RESULT_CHARS): string {
  if (value.length <= max) return value;
  const note = `\n(lista cortada no limite de ${thousands(max)} caracteres: peça um filtro, um período menor ou uma obra por vez.)`;
  const room = Math.max(0, max - note.length);
  const lineBreak = value.lastIndexOf('\n', room);
  return `${value.slice(0, lineBreak > room / 2 ? lineBreak : room)}${note}`;
}

/** "Mozine (MZN)", "Tauá (TAU, inativa)". */
const workTitle = (work: AgentWorkRef) => {
  const tags = [work.code, work.active ? '' : 'inativa'].filter(Boolean);
  return `${work.name}${tags.length ? ` (${tags.join(', ')})` : ''}`;
};
const workPrefix = (work: AgentWorkRef) => `Obra ${workTitle(work)}.`;

const failure = (result: string): GlobalToolOutcome => ({ result, error: true, workIds: [] });
const readFailure = (what: string, work: AgentWorkRef) =>
  failure(`Não foi possível ler ${what} da obra ${work.name} agora. Tente de novo em instantes.`);

/** Chama o carregador sem deixar exceção escapar (nem a síncrona). */
async function attempt<T>(
  load: () => Promise<T>,
  ctx: GlobalToolContext,
  tool: string,
  workId?: string,
): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await load() };
  } catch (cause) {
    ctx.onError?.(cause, { tool, ...(workId ? { workId } : {}) });
    return { ok: false };
  }
}

// ─── Obras ──────────────────────────────────────────────────────────────────────

/** Lista compacta para o prompt do sistema, uma linha por obra: "MZN | Mozine | ativa". */
export function worksListText(works: AgentWorkRef[]): string {
  return works.map(w => `${w.code || '-'} | ${w.name} | ${w.active ? 'ativa' : 'inativa'}`).join('\n');
}
const availableWorks = (works: AgentWorkRef[]) =>
  works.length ? `Obras disponíveis (sigla | nome | situação):\n${worksListText(works)}` : 'A pessoa não tem nenhuma obra liberada.';
const ambiguous = (raw: string, works: AgentWorkRef[]) => ({
  error: `"${raw}" casa com mais de uma obra: ${works.map(workTitle).join('; ')}. Pergunte qual, ou use a sigla.`,
});

/** A obra pedida: id, sigla ou nome, sem acento nem caixa (`nameKey`); trecho do nome que case com uma obra só
 * também vale, e o nome ou a sigla citados dentro de uma frase ("obra Mozine", "MZN · Mozine") também. Vazio =
 * a obra da tela. Ambíguo, não achado ou vazio fora de uma obra = erro com a lista das obras. */
export function resolveWork(value: unknown, ctx: GlobalToolContext): { work: AgentWorkRef } | { error: string } {
  const raw = text(value);
  if (!raw) {
    const current = ctx.contextWorkId ? ctx.works.find(w => w.id === ctx.contextWorkId) : undefined;
    if (current) return { work: current };
    return { error: `Diga de qual obra: a pessoa não está na tela de uma obra. ${availableWorks(ctx.works)}` };
  }
  const byId = ctx.works.find(w => w.id === raw);
  if (byId) return { work: byId };
  const key = nameKey(raw);
  const exact = ctx.works.filter(w => (w.code && nameKey(w.code) === key) || nameKey(w.name) === key);
  if (exact.length === 1) return { work: exact[0] };
  if (exact.length > 1) return ambiguous(raw, exact);
  const partial = key.length >= 3 ? ctx.works.filter(w => nameKey(w.name).includes(key)) : [];
  if (partial.length === 1) return { work: partial[0] };
  if (partial.length > 1) return ambiguous(raw, partial);
  // O nome (com quatro letras ou mais) ou a sigla (como palavra) dentro do texto; entre nomes contidos um no
  // outro ("Brizz" e "Brizz Sul" em "obra Brizz Sul"), vence o mais longo.
  const words = new Set(key.split(/[^a-z0-9]+/).filter(Boolean));
  const contained = ctx.works
    .map(w => ({ w, name: nameKey(w.name) }))
    .filter(({ w, name }) => (name.length >= 4 && key.includes(name)) || (!!w.code && words.has(nameKey(w.code))))
    .sort((a, b) => b.name.length - a.name.length);
  if (contained.length === 1) return { work: contained[0].w };
  if (contained.length > 1) {
    const [first, second] = contained;
    if (key.includes(first.name) && first.name.length > second.name.length && first.name.includes(second.name)) return { work: first.w };
    return ambiguous(
      raw,
      contained.map(c => c.w),
    );
  }
  return { error: `Obra "${raw}" não encontrada entre as obras que a pessoa pode abrir. ${availableWorks(ctx.works)}` };
}

const ALL_WORKS = new Set(['todas', 'todas as obras', 'todas obras', 'todos', 'tudo', '*']);
const isAllWorks = (value: unknown) => ALL_WORKS.has(nameKey(text(value)));

// ─── Especificações ─────────────────────────────────────────────────────────────

const OBRA_INPUT = { type: 'string', description: 'Nome, sigla ou id da obra. Sem ela, vale a obra da tela em que a pessoa está.' };
const WORK_TOOLS = [
  'listar_semana',
  'listar_tarefas_mes',
  'listar_servicos_macro',
  'propor_levar',
  'propor_criar_linhas',
  'propor_apontar',
];
/** O módulo de cada ferramenta antiga, para o selo "Curto prazo · Mozine". */
const WORK_TOOL_AREA: Record<string, string> = {
  listar_semana: 'Curto prazo',
  listar_tarefas_mes: 'Médio prazo',
  listar_servicos_macro: 'Longo prazo',
  propor_levar: 'Curto prazo',
  propor_criar_linhas: 'Curto prazo',
  propor_apontar: 'Curto prazo',
};
/** O plano que `listar_servicos_macro` lê é o do Planejador; desde 04/11/2026 a visão padrão da aba 1 é a Linha de
 * Balanço nova, lida por `consultar_lob`. A frase evita que o modelo confunda as duas. */
const MACRO_NOTE =
  ' É o plano do Planejador (serviço por pavimentos); para a Linha de Balanço por serviço × local, com medições e atrasos, use consultar_lob.';

function withObra(spec: AgentToolSpec): AgentToolSpec {
  const properties = asRecord(spec.input_schema.properties);
  return {
    ...spec,
    description: spec.name === 'listar_servicos_macro' ? `${spec.description}${MACRO_NOTE}` : spec.description,
    input_schema: { ...spec.input_schema, properties: { obra: OBRA_INPUT, ...properties } },
  };
}

const SCALES = ['semana', 'mes', 'trimestre', 'ano', 'personalizado'] as const;
const VAGOES_FILTERS = ['em_producao', 'atrasados', 'todos'] as const;

const PANORAMA_SPEC: AgentToolSpec = {
  name: 'panorama_obras',
  description: `Compara as obras lado a lado, uma linha por obra, com os mesmos números do Dashboard geral: PPC do curto prazo e posição entre as obras, avanço físico medido × previsto do longo prazo, vagões (takt e restrições vencidas), plano do mês, terminalidade e segurança do trabalho. Use para perguntas que cruzam obras ("qual obra está pior", "como foram as obras em outubro"). Sem escala, vale o personalizado com as ${PANORAMA_DEFAULT_WEEKS} últimas semanas: da segunda-feira de ${PANORAMA_DEFAULT_WEEKS - 1} semanas atrás até hoje.`,
  input_schema: {
    type: 'object',
    properties: {
      escala: {
        type: 'string',
        enum: [...SCALES],
        description: `semana, mes, trimestre, ano ou personalizado (padrão, com as ${PANORAMA_DEFAULT_WEEKS} últimas semanas).`,
      },
      chave: {
        type: 'string',
        description:
          'Período nas escalas fixas: semana = uma data AAAA-MM-DD dentro dela; mes = "AAAA-MM" (ex.: "2026-10"); trimestre = "AAAA-T1" a "AAAA-T4" (ex.: "2026-T4"); ano = "AAAA". Sem ela, o período mais recente da escala.',
      },
      de: {
        type: 'string',
        description: `Início do personalizado, AAAA-MM-DD (recua para a segunda-feira). Padrão: a segunda-feira de ${PANORAMA_DEFAULT_WEEKS - 1} semanas atrás.`,
      },
      ate: { type: 'string', description: 'Fim do personalizado, AAAA-MM-DD (vai até o sábado da semana). Padrão: hoje.' },
      obras: {
        type: 'array',
        items: { type: 'string' },
        description: 'Nomes, siglas ou ids das obras a comparar. Sem ela, todas as obras que a pessoa pode abrir.',
      },
    },
    additionalProperties: false,
  },
};

const RESUMO_SPEC: AgentToolSpec = {
  name: 'resumo_obra',
  description:
    'Dossiê de uma obra montado pelo sistema: longo prazo (plano macro e vagões), médio prazo (plano do mês) e curto prazo (planilha semanal com PPC e causas), com os achados do radar (alertas, pontos de atenção e o que vai bem). Use para "como está a obra X" e antes de comparar duas obras em detalhe.',
  input_schema: { type: 'object', properties: { obra: OBRA_INPUT }, additionalProperties: false },
};

const VAGOES_SPEC: AgentToolSpec = {
  name: 'consultar_vagoes',
  description:
    'Vagões da obra (aba 2) por sequência: número, status (terminal, em produção, com restrição, não iniciado), datas previstas, início real, avanço ponderado e takt vencido; mais as restrições abertas (limite, o que bloqueiam, coluna do quadro, responsável), as pendências abertas, as dívidas de terminalidade e as liberações recentes. Filtro: em_producao (em produção, inclusive os com restrição que já começaram), atrasados (takt vencido) ou todos (padrão). Restrições e pendências listadas são as dos vagões do filtro.',
  input_schema: {
    type: 'object',
    properties: { obra: OBRA_INPUT, filtro: { type: 'string', enum: [...VAGOES_FILTERS] } },
    additionalProperties: false,
  },
};

const LOB_SPEC: AgentToolSpec = {
  name: 'consultar_lob',
  description:
    'Linha de Balanço da obra (aba 1, visão padrão "Linha de Balanço": blocos por serviço × local, medidos em rodadas): avanço físico medido × previsto para hoje da obra e de cada serviço, o IDP (índice de desempenho de prazo = % físico real ÷ % físico planejado na última medição fechada, contra a linha de base manual mais recente ou o cronograma atual; 1,00 ou mais em dia, 0,90 a 0,99 atenção, abaixo de 0,90 atrasado) da obra e de cada serviço, blocos atrasados com o atraso em dias úteis e o motivo informado na medição, e a última medição fechada. Avanço, previsto e IDP vêm no mesmo peso, dito no texto: por custo quando todos os pacotes de serviço com blocos têm custo apropriado, senão pela duração (valores em reais não saem desta ferramenta). Para o plano do Planejador (serviço por pavimentos), use listar_servicos_macro.',
  input_schema: { type: 'object', properties: { obra: OBRA_INPUT }, additionalProperties: false },
};

const CONFIG_SPEC: AgentToolSpec = {
  name: 'consultar_configuracoes_obra',
  description:
    'Configurações da obra: se está ativa, a semana 1 e o número da semana atual, o local (cidade/endereço), as equipes cadastradas (empresa · equipe e capacidade) e os locais da obra, na ordem de baixo para cima.',
  input_schema: { type: 'object', properties: { obra: OBRA_INPUT }, additionalProperties: false },
};

export const GLOBAL_TOOL_SPECS: AgentToolSpec[] = [
  ...AGENT_TOOL_SPECS.map(spec => (WORK_TOOLS.includes(spec.name) ? withObra(spec) : spec)),
  PANORAMA_SPEC,
  RESUMO_SPEC,
  VAGOES_SPEC,
  LOB_SPEC,
  CONFIG_SPEC,
  TERMINALITY_TOOL_SPEC,
  SAFETY_TOOL_SPEC,
];

// ─── Ferramentas antigas, por obra ──────────────────────────────────────────────

async function runWorkTool(name: string, args: Record<string, unknown>, ctx: GlobalToolContext): Promise<GlobalToolOutcome> {
  const resolved = resolveWork(args.obra, ctx);
  if ('error' in resolved) return failure(resolved.error);
  const { work } = resolved;
  const loaded = await attempt(() => ctx.loader.workContext(work.id), ctx, name, work.id);
  if (!loaded.ok) return readFailure('o planejamento', work);
  const outcome = runAgentTool(name, withoutObra(args), loaded.value);
  const result = `${workPrefix(work)} ${outcome.result}`;
  if (outcome.error) return { result, error: true, workIds: [work.id] };
  return {
    result,
    ...(outcome.proposal ? { proposal: { ...outcome.proposal, workId: work.id, workName: work.name } } : {}),
    consulted: `${WORK_TOOL_AREA[name]} · ${work.name}`,
    workIds: [work.id],
  };
}

/** O manual não lê obra nenhuma: o contexto vai vazio só para cumprir a assinatura de `runAgentTool`. */
const emptyPlanning = (): PlanningData => ({
  works: [],
  locations: [],
  sequences: [],
  wagons: [],
  activities: [],
  criteria: [],
  pendingItems: [],
  restrictions: [],
  releases: [],
  debts: [],
  teams: [],
  progressEntries: [],
  commitments: [],
  baselines: [],
  dependencies: [],
  plans: [],
  planTasks: [],
  planDependencies: [],
  ifcModels: [],
  ifcVersions: [],
  linkRules: [],
  users: [],
  history: [],
});
function consultManual(args: Record<string, unknown>, ctx: GlobalToolContext): GlobalToolOutcome {
  const outcome = runAgentTool('consultar_manual', args, {
    data: emptyPlanning(),
    workId: '',
    today: ctx.today,
    actor: ctx.actor,
    levels: [],
    newId: ctx.newId,
  });
  return outcome.error
    ? { result: outcome.result, error: true, workIds: [] }
    : { result: outcome.result, consulted: 'Manual do sistema', workIds: [] };
}

// ─── Panorama das obras ─────────────────────────────────────────────────────────

/** Sem período pedido: o personalizado das `PANORAMA_DEFAULT_WEEKS` últimas semanas, da segunda-feira de três
 * semanas atrás até hoje (08/11/2026: um mês corrido sem esperar o mês fechar). */
export function defaultPanoramaSelection(today: string): PeriodSelection {
  return { scale: 'personalizado', from: addDays(startOfWeek(today), -7 * (PANORAMA_DEFAULT_WEEKS - 1)), to: today };
}
const KEY_FORMAT: Record<PeriodGrouping, string> = {
  semana: 'use uma data AAAA-MM-DD dentro da semana',
  mes: 'use "AAAA-MM", como "2026-10"',
  trimestre: 'use "AAAA-T1" a "AAAA-T4", como "2026-T4"',
  ano: 'use "AAAA", como "2026"',
};
const LATEST: Record<PeriodGrouping, string> = {
  semana: 'semana mais recente',
  mes: 'mês mais recente',
  trimestre: 'trimestre mais recente',
  ano: 'ano mais recente',
};

/** A escala e o período pedidos viram a seleção do Dashboard geral, com um rótulo para o modelo. */
export function panoramaSelection(
  args: Record<string, unknown>,
  today: string,
): { selection: PeriodSelection; label: string } | { error: string } {
  const scale = nameKey(text(args.escala)) || 'personalizado';
  if (!(SCALES as readonly string[]).includes(scale))
    return { error: `Escala "${text(args.escala)}" inválida: use semana, mes, trimestre, ano ou personalizado.` };
  if (scale === 'personalizado') {
    const de = text(args.de),
      ate = text(args.ate);
    if (de && !isDate(de)) return { error: `Data inicial "${de}" inválida: use AAAA-MM-DD.` };
    if (ate && !isDate(ate)) return { error: `Data final "${ate}" inválida: use AAAA-MM-DD.` };
    if (!de && !ate) {
      const selection = defaultPanoramaSelection(today);
      return { selection, label: `as ${PANORAMA_DEFAULT_WEEKS} últimas semanas, de ${dmy(selection.from!)} a ${dmy(today)}` };
    }
    let to = ate || today;
    let from = de || addDays(startOfWeek(to), -7 * (PANORAMA_DEFAULT_WEEKS - 1));
    if (from > to) [from, to] = [to, from];
    return { selection: { scale: 'personalizado', from, to }, label: `personalizado, de ${dmy(from)} a ${dmy(to)} (semanas inteiras)` };
  }
  const grouping = scale as PeriodGrouping;
  const raw = text(args.chave);
  if (!raw) return { selection: { scale: grouping }, label: LATEST[grouping] };
  let key = grouping === 'trimestre' ? raw.toUpperCase() : raw;
  if (grouping === 'semana' && isDate(key)) key = startOfWeek(key);
  if (!isBucketKey(grouping, key)) return { error: `Período "${raw}" inválido para a escala ${grouping}: ${KEY_FORMAT[grouping]}.` };
  if (key > bucketKey(grouping, today)) return { error: `O período ${bucketLabel(grouping, key, 'long')} ainda não começou.` };
  return { selection: { scale: grouping, key }, label: bucketLabel(grouping, key, 'long') };
}

async function panorama(args: Record<string, unknown>, ctx: GlobalToolContext): Promise<GlobalToolOutcome> {
  const period = panoramaSelection(args, ctx.today);
  if ('error' in period) return failure(period.error);
  const requested = (Array.isArray(args.obras) ? args.obras : text(args.obras) ? [args.obras] : []).map(text).filter(Boolean);
  let works: AgentWorkRef[];
  if (!requested.length || requested.some(isAllWorks)) works = ctx.works;
  else {
    works = [];
    const missing: string[] = [];
    for (const value of requested) {
      const resolved = resolveWork(value, ctx);
      if ('error' in resolved) missing.push(value);
      else if (!works.includes(resolved.work)) works.push(resolved.work);
    }
    if (missing.length)
      return failure(
        `Não reconheci ${missing.length === 1 ? 'a obra' : 'as obras'} ${missing.map(m => `"${m}"`).join(', ')} (ou o nome casa com mais de uma). ${availableWorks(ctx.works)}`,
      );
  }
  if (!works.length) return failure('A pessoa não tem nenhuma obra liberada para comparar.');
  const workIds = works.map(w => w.id);
  const loaded = await attempt(() => ctx.loader.portfolio(period.selection, workIds), ctx, 'panorama_obras');
  if (!loaded.ok) return failure('Não foi possível montar o panorama das obras agora. Tente de novo em instantes.');
  return {
    result: `Panorama das obras — período: ${period.label}; ${plural(works.length, 'obra', 'obras')}.\n${loaded.value}`,
    consulted: 'Panorama das obras',
    workIds,
  };
}

// ─── Resumo da obra ─────────────────────────────────────────────────────────────

async function workSummary(args: Record<string, unknown>, ctx: GlobalToolContext): Promise<GlobalToolOutcome> {
  const resolved = resolveWork(args.obra, ctx);
  if ('error' in resolved) return failure(resolved.error);
  const { work } = resolved;
  const loaded = await attempt(() => ctx.loader.briefing(work.id), ctx, 'resumo_obra', work.id);
  if (!loaded.ok) return readFailure('o dossiê', work);
  return {
    result: `Resumo da obra ${workTitle(work)}: dossiê do sistema, com os achados do radar.\n${loaded.value.text}`,
    consulted: `Resumo · ${work.name}`,
    workIds: [work.id],
  };
}

// ─── Vagões ─────────────────────────────────────────────────────────────────────

type WorkWagon = Planning['wagons'][number];
const STATUS_ORDER = ['terminal', 'in_production', 'restricted', 'not_started'] as const;
const dateOf = (timestamp: string) => timestamp.slice(0, 10);
/** O limite que o quadro de restrições mostra: com lead time e atividade, o início previsto atual dela menos o lead
 * time; senão, a data gravada (a mesma regra do quadro de vagões do dashboard). */
const restrictionDeadline = (r: Restriction, activities: Map<string, Activity>) => {
  const activity = r.activityId ? activities.get(r.activityId) : undefined;
  return r.leadTimeDays !== undefined && activity ? leadTimeDeadline(activity.plannedStart, r.leadTimeDays) : r.dueDate;
};
const isProducing = (w: WorkWagon) => w.status === 'in_production' || (w.status === 'restricted' && (!!w.actualStart || w.progress > 0));
const taktOf = (w: WorkWagon) => (w.overdue ? 'takt vencido' : w.status === 'terminal' ? 'concluído' : 'no prazo');

/** Os vagões da obra em texto: contagem por status, uma tabela por sequência e as listas de restrições, pendências,
 * dívidas e liberações. Puro. */
export function wagonsReport(planning: Planning, work: AgentWorkRef, filter: string): string {
  const selected = selectWorkPlanning(planning, work.id);
  if (!selected) return `${workPrefix(work)} A obra não aparece no planejamento carregado: sem dados de vagões.`;
  if (!selected.wagons.length) return `${workPrefix(work)} Sem vagões gerados para esta obra.`;
  const { data, today } = planning;
  const all = selected.wagons;
  const overdue = all.filter(w => w.overdue);
  const counts = STATUS_ORDER.map(status => `${all.filter(w => w.status === status).length} ${statusLabels[status].toLowerCase()}`);
  const lines = [
    `${workPrefix(work)} Vagões: ${all.length} (${counts.join(', ')}). Takt vencido: ${overdue.length}${overdue.length ? ` (${overdue.map(w => wagonLabel(w.number)).join(', ')})` : ''}.`,
  ];
  const shown = filter === 'em_producao' ? all.filter(isProducing) : filter === 'atrasados' ? overdue : all;
  if (!shown.length) lines.push(`Nenhum vagão no filtro "${filter}".`);
  let listed = 0;
  for (const sequence of selected.sequences) {
    const wagons = shown.filter(w => w.sequenceId === sequence.id).sort((a, b) => a.number - b.number);
    if (!wagons.length || listed >= MAX_WAGONS) continue;
    const calendar = sequence.calendar === 'calendar_days' ? 'corridos' : 'úteis';
    lines.push('', `Sequência ${sequence.name} (takt ${plural(sequence.defaultTaktDays, 'dia', 'dias')} ${calendar}), filtro ${filter}:`);
    lines.push('vagão | status | previsto | início real | avanço | takt');
    for (const w of wagons.slice(0, MAX_WAGONS - listed))
      lines.push(
        `${wagonLabel(w.number)} | ${statusLabels[w.status]} | ${dm(w.plannedStart)}–${dmy(w.plannedEnd)} | ${w.actualStart ? dmy(w.actualStart) : '-'} | ${pct(w.progress)} | ${taktOf(w)}`,
      );
    listed += Math.min(wagons.length, MAX_WAGONS - listed);
  }
  if (shown.length > listed) lines.push(`(Mostrando ${listed} de ${shown.length} vagões.)`);

  const ids = new Set(shown.map(w => w.id));
  const numberOf = new Map(all.map(w => [w.id, w.number]));
  const userName = (id: string) => data.users.find(u => u.id === id)?.name ?? '-';
  const activities = new Map(data.activities.map(a => [a.id, a]));
  const restrictions = data.restrictions
    .filter(r => r.status === 'open' && ids.has(r.wagonId))
    .map(r => ({ r, deadline: restrictionDeadline(r, activities) }))
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
  const late = restrictions.filter(({ deadline }) => deadline < today).length;
  lines.push('', `Restrições abertas: ${restrictions.length}${restrictions.length ? ` (${late} vencidas)` : ''}.`);
  for (const { r, deadline } of restrictions.slice(0, MAX_ITEMS)) {
    const blocks = [r.blocksExecution ? 'execução' : '', r.blocksTerminality ? 'terminalidade' : ''].filter(Boolean);
    lines.push(
      `- ${wagonLabel(numberOf.get(r.wagonId) ?? 0)} | ${cut(r.description)} | limite ${dmy(deadline)}${deadline < today ? ' (vencida)' : ''} | ${blocks.length ? `bloqueia ${blocks.join(' e ')}` : 'não bloqueia'} | ${boardStatusLabels[r.boardStatus]} | resp. ${userName(r.responsibleId)}`,
    );
  }
  if (restrictions.length > MAX_ITEMS) lines.push(`(Mostrando ${MAX_ITEMS} de ${restrictions.length} restrições.)`);

  const pending = data.pendingItems
    .filter(p => p.status === 'open' && ids.has(p.wagonId))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  lines.push('', `Pendências abertas: ${pending.length}.`);
  for (const p of pending.slice(0, MAX_ITEMS))
    lines.push(
      `- ${wagonLabel(numberOf.get(p.wagonId) ?? 0)} | ${cut(p.description)} | prazo ${dmy(p.dueDate)}${p.dueDate < today ? ' (vencido)' : ''}${p.blocksTerminality ? ' | bloqueia terminalidade' : ''} | resp. ${userName(p.responsibleId)}`,
    );
  if (pending.length > MAX_ITEMS) lines.push(`(Mostrando ${MAX_ITEMS} de ${pending.length} pendências.)`);

  const openDebts = selected.debts.filter(d => data.pendingItems.some(p => p.id === d.pendingItemId && p.status === 'open')).length;
  lines.push('', `Dívidas de terminalidade abertas (pendências aceitas em liberação, ainda abertas): ${openDebts}.`);

  const wagonIds = new Set(all.map(w => w.id));
  const releases = data.releases.filter(r => wagonIds.has(r.wagonId)).sort((a, b) => b.releasedAt.localeCompare(a.releasedAt));
  if (releases.length) {
    lines.push(`Liberações recentes (${Math.min(releases.length, MAX_RELEASES)} de ${releases.length}):`);
    for (const r of releases.slice(0, MAX_RELEASES))
      lines.push(
        `- ${dmy(dateOf(r.releasedAt))}: ${wagonLabel(numberOf.get(r.wagonId) ?? 0)}, liberação ${releaseLabels[r.type].toLowerCase()}${r.justification ? ` (${cut(r.justification, 80)})` : ''}`,
      );
  } else lines.push('Nenhuma liberação registrada.');
  return lines.join('\n');
}

async function wagonsTool(args: Record<string, unknown>, ctx: GlobalToolContext): Promise<GlobalToolOutcome> {
  const filter = text(args.filtro) || 'todos';
  if (!(VAGOES_FILTERS as readonly string[]).includes(filter))
    return failure(`Filtro "${filter}" inválido: use em_producao, atrasados ou todos.`);
  const resolved = resolveWork(args.obra, ctx);
  if ('error' in resolved) return failure(resolved.error);
  const { work } = resolved;
  const loaded = await attempt(() => ctx.loader.planning(work.id), ctx, 'consultar_vagoes', work.id);
  if (!loaded.ok) return readFailure('os vagões', work);
  return { result: wagonsReport(loaded.value, work, filter), consulted: `Vagões · ${work.name}`, workIds: [work.id] };
}

// ─── Linha de Balanço ───────────────────────────────────────────────────────────

/** O motivo do atraso que a medição fechada mais recente de cada bloco informou (sem motivo nela, nenhum). */
function delayCauses(lob: LobData, today: string): Map<string, string> {
  const byMeasurement = new Map<string, LobMeasurementItem[]>();
  for (const item of lob.items) {
    const list = byMeasurement.get(item.measurementId);
    if (list) list.push(item);
    else byMeasurement.set(item.measurementId, [item]);
  }
  const causes = new Map<string, string>();
  for (const m of closedMeasurements(lob.measurements)) {
    if (m.date > today) break;
    for (const item of byMeasurement.get(m.id) ?? []) {
      if (item.delayCause) causes.set(item.activityId, item.delayCause);
      else causes.delete(item.activityId);
    }
  }
  return causes;
}

const pct1 = (n: number) => `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/** A linha do IDP (11/11/2026, modelo "IDP na Linha de Balanço"): o número na medição fechada mais recente
 * (regra 3), a conta, a referência (regra 4) e o peso (regras 6 e 7); sem número nos casos da regra 11.
 * Nunca diz valor em reais. */
export function idpLine(performance: LobPerformance): string {
  const { weights, point, baseline } = performance;
  const reference = baseline ? `contra a linha de base "${baseline.name}"` : 'contra o cronograma atual';
  const weight =
    weights.fallback === 'missing'
      ? `; faltam custos em ${weights.missingServiceIds.length} de ${plural(weights.servicesWithBlocks.length, 'pacote', 'pacotes')}, então o peso é a duração.`
      : weights.fallback === 'zero'
        ? '; os custos apropriados somam zero, então o peso é a duração.'
        : `, ${weightingLabel(weights.mode)}.`;
  if (!point) return `IDP (desempenho de prazo): — (sem medição fechada)${weight}`;
  const at = `IDP (desempenho de prazo) na medição nº ${point.number} de ${dmy(point.date)}`;
  if (point.idp === undefined) return `${at}: — (nada previsto até a data, ${reference})${weight}`;
  return `${at}: ${formatIdp(point.idp)} — ${IDP_TONE_LABEL[idpTone(point.idp)]} (real ${pct1(point.real)} ÷ planejado ${pct1(point.planned)}, ${reference})${weight}`;
}

/** A Linha de Balanço em texto: avanço medido × previsto da obra e de cada serviço, IDP, blocos atrasados e
 * medições. Avanço, previsto e IDP no peso vigente da aba (regra 7 do IDP, 11/11/2026). Puro. */
export function lobReport(lob: LobData, work: AgentWorkRef, today: string): string {
  // A carga do servidor pode vir sem `costs` (antes da migração 0044): sem custo, o peso é a duração.
  const data: LobData = { ...lob, costs: lob.costs ?? [] };
  const { activities } = data;
  if (!activities.length) return `${workPrefix(work)} A Linha de Balanço não tem blocos lançados.`;
  const performance = lobPerformance(data);
  const weight = performance.weights.weight;
  const measured = measuredPercents(lob.measurements, lob.items, today);
  const physical = physicalProgress(activities, measured, weight) ?? 0;
  const planned = plannedProgress(activities, today, weight) ?? 0;
  const idpOf = new Map(servicePerformance(data, performance).map(row => [row.serviceId, row.idp]));
  const span = lobSpan(activities)!;
  const closed = closedMeasurements(lob.measurements).filter(m => m.date <= today);
  const last = closed.at(-1);
  const open = openMeasurement(lob.measurements);
  const lateBlocks = activities.filter(a => isLate(a, measured[a.id], today));
  const services = [...lob.services].sort((a, b) => a.orderIndex - b.orderIndex);
  const localName = new Map(lob.locals.map(l => [l.id, l.name]));
  const serviceName = new Map(services.map(s => [s.id, s.name]));
  const gap = Math.round(physical) - Math.round(planned);
  const lines = [
    `${workPrefix(work)} Linha de Balanço: ${plural(services.length, 'serviço', 'serviços')}, ${plural(lob.locals.length, 'local', 'locais')}, ${plural(activities.length, 'bloco', 'blocos')}; cronograma de ${dmy(span.start)} a ${dmy(span.finish)}.`,
    `Avanço físico medido: ${pct(physical)}; previsto para hoje: ${pct(planned)} (${gap === 0 ? 'em linha com o previsto' : `${Math.abs(gap)} pontos ${gap < 0 ? 'abaixo' : 'acima'} do previsto`}); ${weightingLabel(performance.weights.mode)}.`,
    idpLine(performance),
    last
      ? `Última medição fechada: nº ${last.number}, de ${dmy(last.date)}.`
      : 'Nenhuma medição fechada: o medido de todos os blocos é zero.',
  ];
  if (open)
    lines.push(`Medição nº ${open.number} aberta (em preenchimento), com data ${dmy(open.date)}: os valores dela ainda não contam.`);
  lines.push(`Blocos atrasados (previsto para hoje ao menos 10 pontos acima do medido): ${lateBlocks.length} de ${activities.length}.`);

  lines.push('', 'serviço | equipe | locais | período | previsto hoje | medido | IDP na última medição | situação');
  for (const service of services) {
    const blocks = activities.filter(a => a.serviceId === service.id);
    if (!blocks.length) {
      lines.push(`${service.name} | ${service.team || '-'} | 0 | - | - | - | - | sem blocos`);
      continue;
    }
    const serviceIdp = idpOf.get(service.id);
    const serviceSpan = lobSpan(blocks)!;
    const p = plannedProgress(blocks, today) ?? 0;
    const m = physicalProgress(blocks, measured) ?? 0;
    const late = blocks.filter(a => isLate(a, measured[a.id], today));
    const worst = Math.max(0, ...late.map(a => delayDays(a, measured[a.id], today)));
    const situation =
      m >= 99.95
        ? 'concluído'
        : late.length
          ? `atrasado: ${late.length} de ${blocks.length} blocos, até ${plural(worst, 'dia útil', 'dias úteis')}`
          : p === 0 && m === 0
            ? 'a iniciar'
            : 'em dia';
    lines.push(
      `${service.name} | ${service.team || '-'} | ${blocks.length} | ${dmy(serviceSpan.start)}–${dmy(serviceSpan.finish)} | ${pct(p)} | ${pct(m)} | ${serviceIdp !== undefined ? formatIdp(serviceIdp) : '-'} | ${situation}`,
    );
  }

  if (lateBlocks.length) {
    const causes = delayCauses(lob, today);
    const ranked = lateBlocks
      .map(a => ({ a, days: delayDays(a, measured[a.id], today) }))
      .sort((x, y) => y.days - x.days || x.a.start.localeCompare(y.a.start));
    lines.push('', `Blocos mais atrasados (${Math.min(ranked.length, MAX_LATE_BLOCKS)} de ${ranked.length}):`);
    for (const { a, days } of ranked.slice(0, MAX_LATE_BLOCKS))
      lines.push(lateLine(a, days, measured, causes, serviceName, localName, today));
  }
  return lines.join('\n');
}
const lateLine = (
  a: LobActivity,
  days: number,
  measured: Record<string, number>,
  causes: Map<string, string>,
  serviceName: Map<string, string>,
  localName: Map<string, string>,
  today: string,
) =>
  `- ${serviceName.get(a.serviceId) ?? '?'} · ${localName.get(a.localId) ?? '?'} | previsto ${pct(plannedPercent(a, today))} | medido ${pct(measured[a.id] ?? 0)} | atraso de ${plural(days, 'dia útil', 'dias úteis')}${causes.get(a.id) ? ` | motivo: ${causes.get(a.id)}` : ''}`;

async function lobTool(args: Record<string, unknown>, ctx: GlobalToolContext): Promise<GlobalToolOutcome> {
  const resolved = resolveWork(args.obra, ctx);
  if ('error' in resolved) return failure(resolved.error);
  const { work } = resolved;
  const loaded = await attempt(() => ctx.loader.lob(work.id), ctx, 'consultar_lob', work.id);
  if (!loaded.ok) return readFailure('a Linha de Balanço', work);
  const result = loaded.value
    ? lobReport(loaded.value, work, ctx.today)
    : `${workPrefix(work)} A Linha de Balanço ainda não está disponível no sistema.`;
  return { result, consulted: `Linha de Balanço · ${work.name}`, workIds: [work.id] };
}

// ─── Configurações da obra ──────────────────────────────────────────────────────

async function settingsTool(args: Record<string, unknown>, ctx: GlobalToolContext): Promise<GlobalToolOutcome> {
  const tool = 'consultar_configuracoes_obra';
  const resolved = resolveWork(args.obra, ctx);
  if ('error' in resolved) return failure(resolved.error);
  const { work } = resolved;
  const [settings, workCtx, lob] = await Promise.all([
    attempt(() => ctx.loader.workSettings(work.id), ctx, tool, work.id),
    attempt(() => ctx.loader.workContext(work.id), ctx, tool, work.id),
    attempt(() => ctx.loader.lob(work.id), ctx, tool, work.id),
  ]);
  if (!settings.ok && !workCtx.ok && !lob.ok) return readFailure('as configurações', work);
  const unreadable = 'não foi possível ler agora';
  const lines = [`${workPrefix(work)} Configurações da obra:`, `- Situação: ${work.active ? 'ativa' : 'inativa'}.`];
  const weekOne = (settings.ok ? settings.value.weekOne : undefined) ?? (workCtx.ok ? workCtx.value.weekOne : undefined);
  if (weekOne) {
    const monday = startOfWeek(weekOne);
    const current = startOfWeek(ctx.today);
    lines.push(
      `- Semana 1: a que começa na segunda-feira ${dmy(monday)}; semana atual: ${weekNumberFrom(monday, current)} (segunda-feira ${dmy(current)}).`,
    );
  } else
    lines.push(
      settings.ok ? '- Semana 1: não configurada (os números de semana saem da primeira linha da planilha).' : `- Semana 1: ${unreadable}.`,
    );
  lines.push(`- Local (cidade/endereço): ${settings.ok ? settings.value.place?.trim() || 'não informado' : unreadable}.`);
  if (workCtx.ok) {
    const teams = workCtx.value.data.teams
      .filter(t => t.workId === work.id)
      .sort((a, b) => a.company.localeCompare(b.company, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'));
    lines.push(
      `- Equipes cadastradas: ${teams.length}${teams.length ? ' (empresa · equipe, capacidade em atividades simultâneas por semana)' : ''}.`,
    );
    for (const t of teams.slice(0, MAX_TEAMS)) lines.push(`  - ${t.company || '-'} · ${t.name} (capacidade ${t.weeklyCapacity})`);
    if (teams.length > MAX_TEAMS) lines.push(`  (Mostrando ${MAX_TEAMS} de ${teams.length} equipes.)`);
  } else lines.push(`- Equipes: ${unreadable}.`);
  if (!lob.ok) lines.push(`- Locais da obra: ${unreadable}.`);
  else if (!lob.value) lines.push('- Locais da obra: a Linha de Balanço ainda não está disponível no sistema.');
  else {
    const locals = [...lob.value.locals].sort((a, b) => a.orderIndex - b.orderIndex);
    lines.push(
      locals.length
        ? `- Locais da obra (${locals.length}, de baixo para cima): ${locals.map(l => l.name).join(', ')}.`
        : '- Locais da obra: nenhum cadastrado.',
    );
  }
  return { result: lines.join('\n'), consulted: `Configurações · ${work.name}`, workIds: [work.id] };
}

// ─── Terminalidade e segurança do trabalho ──────────────────────────────────────

interface ModuleTool<T> {
  tool: string;
  /** "Terminalidade", para o selo. */
  label: string;
  /** "a terminalidade", para as frases. */
  what: string;
  load: (workId: string) => Promise<T | null>;
  report: (entries: ModuleReportEntry<T>[], input: Record<string, unknown>, today: string) => string;
}

/** Uma obra ou "todas": lê cada obra em paralelo, pula as sem o módulo (e diz quais) e passa as entradas ao
 * relatório do módulo, com a entrada da ferramenta sem `obra`. */
async function runModuleTool<T>(m: ModuleTool<T>, args: Record<string, unknown>, ctx: GlobalToolContext): Promise<GlobalToolOutcome> {
  const all = isAllWorks(args.obra);
  let targets: AgentWorkRef[];
  if (all) targets = ctx.works;
  else {
    const resolved = resolveWork(args.obra, ctx);
    if ('error' in resolved) return failure(resolved.error);
    targets = [resolved.work];
  }
  if (!targets.length) return failure('A pessoa não tem nenhuma obra liberada.');
  const reads = await Promise.all(targets.map(async work => ({ work, read: await attempt(() => m.load(work.id), ctx, m.tool, work.id) })));
  const entries: ModuleReportEntry<T>[] = [];
  const unavailable: AgentWorkRef[] = [];
  const failed: AgentWorkRef[] = [];
  for (const { work, read } of reads) {
    if (!read.ok) failed.push(work);
    else if (read.value === null || read.value === undefined) unavailable.push(work);
    else entries.push({ workId: work.id, workName: work.name, data: read.value });
  }
  if (!all) {
    const work = targets[0];
    if (failed.length) return readFailure(m.what, work);
    if (!entries.length)
      return {
        result: `${workPrefix(work)} ${m.label} ainda não está disponível no sistema.`,
        consulted: `${m.label} · ${work.name}`,
        workIds: [work.id],
      };
    return {
      result: `${workPrefix(work)} ${m.report(entries, withoutObra(args), ctx.today)}`,
      consulted: `${m.label} · ${work.name}`,
      workIds: [work.id],
    };
  }
  const names = (works: AgentWorkRef[]) => works.map(w => w.name).join(', ');
  const notes = [
    unavailable.length ? `Sem ${m.what} disponível no sistema: ${names(unavailable)}.` : '',
    failed.length ? `Não foi possível ler agora: ${names(failed)}.` : '',
  ].filter(Boolean);
  if (!entries.length) {
    const result = [`Nenhuma obra com ${m.what} para comparar.`, ...notes].join('\n');
    return failed.length ? { result, error: true, workIds: [] } : { result, consulted: `${m.label} · todas as obras`, workIds: [] };
  }
  return {
    result: [m.report(entries, withoutObra(args), ctx.today), ...notes].join('\n'),
    consulted: `${m.label} · todas as obras`,
    workIds: entries.map(e => e.workId),
  };
}

// ─── Despachante ────────────────────────────────────────────────────────────────

async function dispatch(name: string, args: Record<string, unknown>, ctx: GlobalToolContext): Promise<GlobalToolOutcome> {
  if (WORK_TOOLS.includes(name)) return runWorkTool(name, args, ctx);
  switch (name) {
    case 'consultar_manual':
      return consultManual(args, ctx);
    case 'panorama_obras':
      return panorama(args, ctx);
    case 'resumo_obra':
      return workSummary(args, ctx);
    case 'consultar_vagoes':
      return wagonsTool(args, ctx);
    case 'consultar_lob':
      return lobTool(args, ctx);
    case 'consultar_configuracoes_obra':
      return settingsTool(args, ctx);
    case TERMINALITY_TOOL_SPEC.name:
      return runModuleTool<TerminalityData>(
        { tool: name, label: 'Terminalidade', what: 'a terminalidade', load: id => ctx.loader.terminality(id), report: terminalityReport },
        args,
        ctx,
      );
    case SAFETY_TOOL_SPEC.name:
      return runModuleTool<SafetyData>(
        {
          tool: name,
          label: 'Segurança do trabalho',
          what: 'a segurança do trabalho',
          load: id => ctx.loader.safety(id),
          report: safetyReport,
        },
        args,
        ctx,
      );
    default:
      return failure(`Ferramenta "${name}" não existe.`);
  }
}

/** Executa uma ferramenta da Claudia geral pelo nome. Nunca lança: qualquer falha vira resultado de erro em
 * português, e todo texto sai cortado em `MAX_RESULT_CHARS`. A exceção é o manual, que já tem os limites dele
 * (seções até 7 mil caracteres; o índice, devolvido quando o tema não casa, passa de 12 mil e não pode sair cortado). */
export async function runGlobalTool(name: string, input: unknown, ctx: GlobalToolContext): Promise<GlobalToolOutcome> {
  let outcome: GlobalToolOutcome;
  try {
    outcome = await dispatch(name, asRecord(input), ctx);
  } catch (cause) {
    ctx.onError?.(cause, { tool: name });
    outcome = failure('Não foi possível concluir esta consulta agora. Tente de novo em instantes.');
  }
  return name === 'consultar_manual' ? outcome : { ...outcome, result: capResult(outcome.result) };
}
