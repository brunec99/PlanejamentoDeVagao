import type { PlanningData, PlanTask, Team, User, WeeklyCommitment } from '../../domain/entities';
import { NON_FULFILLMENT_CAUSES, type NonFulfillmentCause } from '../../domain/entities';
import { commitmentCompanyOf, nameKey, type BriefingLevel } from '../../domain/agent-briefing';
import { daysBetween, floorSchedule, latestPercents, type LongTermPlanDocument } from '../../domain/long-term-plan';
import { ppc, rollUpPlan, targetPercent } from '../../domain/rules';
import { addDays, startOfWeek } from '../../domain/validation';
import { canEditWeek } from '../../domain/week-lock';
import { weekNumberFrom } from '../../domain/week-numbering';
import type { Command, FulfillmentItem } from './commands';

/** Ferramentas do agente de IA (27/10/2026). O modelo nunca grava: as ferramentas de leitura devolvem
 * texto, e as de edição devolvem uma PROPOSTA — comandos prontos (`create_commitment`,
 * `record_fulfillments`) que a tela aplica com um clique pelo mesmo caminho da planilha (permissões,
 * projeção otimista e Desfazer já existentes). Cada linha e tarefa aparece ao modelo com um apelido
 * curto (`c:1a2b3c4d`, `t:…`, os oito primeiros caracteres do id), para a lista caber em poucos
 * tokens; o servidor resolve o apelido de volta ao id. Funções puras: a rota passa o contexto. */

export interface AgentToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}
export type ProposalKind = 'levar' | 'criar' | 'apontar';
export interface AgentProposal {
  id: string;
  kind: ProposalKind;
  title: string;
  /** Uma linha por comando, para a tela listar o que vai acontecer. */
  lines: string[];
  commands: Command[];
  weekStart: string;
  /** Pedidos que ficaram de fora e por quê (linha já levada, apelido não achado). */
  skipped: string[];
}
export interface ToolContext {
  data: PlanningData;
  workId: string;
  today: string;
  actor: { id: string; role: User['role'] };
  levels: BriefingLevel[];
  weekOne?: string;
  longTermPlan?: LongTermPlanDocument;
  newId: () => string;
}
export interface ToolOutcome {
  /** O que o modelo lê de volta. */
  result: string;
  proposal?: AgentProposal;
  error?: boolean;
}

export const MAX_LIST = 200;
export const MAX_PROPOSAL_ITEMS = 60;
const WEEK_INPUT = {
  type: 'string',
  description: 'Semana: "atual", "anterior", "proxima", o número da semana da obra (ex.: "113") ou uma data YYYY-MM-DD dentro dela.',
};

export const AGENT_TOOL_SPECS: AgentToolSpec[] = [
  {
    name: 'listar_semana',
    description:
      'Lista as linhas da planilha semanal (curto prazo) de uma semana: apelido, atividade, empresa, equipe, período e apontamento (Sim, Não com causa, ou sem apontamento). Use antes de propor levar ou apontar linhas.',
    input_schema: { type: 'object', properties: { semana: WEEK_INPUT }, required: ['semana'], additionalProperties: false },
  },
  {
    name: 'listar_tarefas_mes',
    description:
      'Lista as tarefas folha do plano do mês vivo (médio prazo): apelido, nome, período, percentual, equipe e situação. Filtros: semana_atual (previstas para esta semana), atrasadas (vencidas sem concluir), em_andamento, proximas (começam em até 14 dias) ou todas.',
    input_schema: {
      type: 'object',
      properties: { filtro: { type: 'string', enum: ['semana_atual', 'atrasadas', 'em_andamento', 'proximas', 'todas'] } },
      required: ['filtro'],
      additionalProperties: false,
    },
  },
  {
    name: 'listar_servicos_macro',
    description:
      'Lista os serviços do plano de longo prazo (Linha de Balanço): pavimentos, período, percentual medido e previsto para hoje.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'propor_levar',
    description:
      'Propõe levar linhas da planilha para outra semana: cria uma linha igual (mesma atividade, empresa, equipe e período deslocado) na semana de destino, sem apontamento; a linha de origem não muda. Padrão: a semana seguinte à da linha. A proposta só é gravada se a pessoa clicar em Aplicar.',
    input_schema: {
      type: 'object',
      properties: {
        linhas: { type: 'array', items: { type: 'string' }, description: 'Apelidos das linhas (ex.: "c:1a2b3c4d"), de listar_semana.' },
        semana: { ...WEEK_INPUT, description: `${WEEK_INPUT.description} Opcional: sem ela, a semana seguinte à de cada linha.` },
      },
      required: ['linhas'],
      additionalProperties: false,
    },
  },
  {
    name: 'propor_criar_linhas',
    description:
      'Propõe linhas novas na planilha de uma semana. Cada item pode vir de uma tarefa do plano do mês (apelido "t:…" de listar_tarefas_mes: nome, equipe e período saem dela) ou ser escrito (nome, empresa, equipe, início e fim). A proposta só é gravada se a pessoa clicar em Aplicar.',
    input_schema: {
      type: 'object',
      properties: {
        semana: WEEK_INPUT,
        itens: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tarefa: { type: 'string', description: 'Apelido da tarefa do plano do mês (ex.: "t:9f8e7d6c").' },
              nome: { type: 'string' },
              empresa: { type: 'string' },
              equipe: { type: 'string', description: 'Nome da equipe cadastrada na obra.' },
              inicio: { type: 'string', description: 'YYYY-MM-DD dentro da semana.' },
              fim: { type: 'string', description: 'YYYY-MM-DD dentro da semana.' },
            },
            additionalProperties: false,
          },
        },
      },
      required: ['semana', 'itens'],
      additionalProperties: false,
    },
  },
  {
    name: 'propor_apontar',
    description:
      'Propõe o apontamento de linhas da planilha: Sim (cumprido) ou Não com uma causa da lista fechada e justificativa opcional. A proposta só é gravada se a pessoa clicar em Aplicar.',
    input_schema: {
      type: 'object',
      properties: {
        itens: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              linha: { type: 'string', description: 'Apelido da linha (ex.: "c:1a2b3c4d").' },
              cumprido: { type: 'boolean' },
              causa: { type: 'string', description: `Obrigatória quando não cumprido. Uma de: ${NON_FULFILLMENT_CAUSES.join('; ')}.` },
              justificativa: { type: 'string' },
            },
            required: ['linha', 'cumprido'],
            additionalProperties: false,
          },
        },
      },
      required: ['itens'],
      additionalProperties: false,
    },
  },
];

// ─── Apelidos e semanas ─────────────────────────────────────────────────────────

export const handleOf = (id: string) => id.slice(0, 8);
const stripHandle = (value: string) =>
  value
    .trim()
    .replace(/^[ct]:/i, '')
    .toLowerCase();
/** O id inteiro ou o apelido (prefixo) que casa com uma só linha. */
export function resolveHandle<T extends { id: string }>(rows: T[], handle: string): T | undefined {
  const key = stripHandle(handle);
  if (!key) return undefined;
  const exact = rows.find(r => r.id === key);
  if (exact) return exact;
  const matches = rows.filter(r => r.id.toLowerCase().startsWith(key));
  return matches.length === 1 ? matches[0] : undefined;
}

const dm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const dmy = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function weekOneOf(ctx: ToolContext): string {
  if (ctx.weekOne) return startOfWeek(ctx.weekOne);
  const earliest = ctx.data.commitments
    .filter(c => c.workId === ctx.workId)
    .reduce<string | undefined>((min, c) => (!min || c.weekStart < min ? c.weekStart : min), undefined);
  return startOfWeek(earliest ?? ctx.today);
}
/** A segunda-feira da semana pedida, ou o motivo de não entender. */
export function resolveWeek(value: unknown, ctx: ToolContext): { weekStart: string } | { error: string } {
  const current = startOfWeek(ctx.today);
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (!raw || raw === 'atual' || raw === 'esta' || raw === 'essa') return { weekStart: current };
  if (raw === 'anterior' || raw === 'passada') return { weekStart: addDays(current, -7) };
  if (raw === 'proxima' || raw === 'seguinte') return { weekStart: addDays(current, 7) };
  if (DATE.test(raw)) return { weekStart: startOfWeek(raw) };
  const number = Number(raw.replace(/^s(emana)?\s*/, ''));
  if (Number.isInteger(number) && number >= 1) return { weekStart: addDays(weekOneOf(ctx), (number - 1) * 7) };
  return {
    error: `Semana "${String(value)}" não entendida: use "atual", "anterior", "proxima", o número da semana ou uma data YYYY-MM-DD.`,
  };
}
const weekNumber = (weekStart: string, ctx: ToolContext) => weekNumberFrom(weekOneOf(ctx), weekStart);

// ─── Leitura ────────────────────────────────────────────────────────────────────

const statusOf = (row: WeeklyCommitment) =>
  row.fulfilled === true ? 'Sim' : row.fulfilled === false ? `Não${row.cause ? ` (${row.cause})` : ''}` : 'sem apontamento';
const teamOf = (teamId: string | undefined, teams: Team[]) => teams.find(t => t.id === teamId);

function listWeek(input: Record<string, unknown>, ctx: ToolContext): ToolOutcome {
  const week = resolveWeek(input.semana, ctx);
  if ('error' in week) return { result: week.error, error: true };
  const teams = ctx.data.teams.filter(t => t.workId === ctx.workId);
  const rows = ctx.data.commitments
    .filter(c => c.workId === ctx.workId && c.weekStart === week.weekStart)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const number = weekNumber(week.weekStart, ctx);
  if (!rows.length) return { result: `Semana ${number} (${dmy(week.weekStart)}): nenhuma linha na planilha.` };
  const p = ppc(rows);
  const lines = rows
    .slice(0, MAX_LIST)
    .map(
      row =>
        `c:${handleOf(row.id)} | ${row.name} | ${commitmentCompanyOf(row, teams) || '-'} | ${teamOf(row.teamId, teams)?.name ?? '-'} | ${dm(row.startDate)}–${dm(row.endDate)} | ${statusOf(row)}`,
    );
  const cut = rows.length > MAX_LIST ? `\n(Mostrando ${MAX_LIST} de ${rows.length} linhas.)` : '';
  return {
    result: `Semana ${number} (${dmy(week.weekStart)} a ${dmy(addDays(week.weekStart, 6))}): ${rows.length} linhas, ${p.fulfilled} Sim, ${rows.length - p.fulfilled - p.pending} Não, ${p.pending} sem apontamento (PPC ${Math.round(p.percent)}%).\napelido | atividade | empresa | equipe | período | apontamento\n${lines.join('\n')}${cut}`,
  };
}

function livePlan(ctx: ToolContext) {
  const plan = ctx.data.plans
    .filter(p => p.workId === ctx.workId && !p.baselineOf && !p.frozenAt)
    .sort((a, b) => b.month.localeCompare(a.month))[0];
  if (!plan) return undefined;
  const tasks = ctx.data.planTasks.filter(t => t.planId === plan.id).sort((a, b) => a.order - b.order);
  const rollUp = rollUpPlan(tasks);
  return { plan, leaves: tasks.filter(t => !rollUp.get(t.id)?.summary) };
}
const taskSituation = (task: PlanTask, today: string) => {
  if (task.progress >= 100 || task.actualEnd) return 'concluída';
  if (task.plannedEnd < today) return `vencida em ${dm(task.plannedEnd)}`;
  if (task.plannedStart <= today) {
    const target = targetPercent(task, today);
    return target - task.progress >= 20 ? `em andamento, abaixo do alvo (${Math.round(target)}%)` : 'em andamento';
  }
  return 'a iniciar';
};

function listMonthTasks(input: Record<string, unknown>, ctx: ToolContext): ToolOutcome {
  if (!ctx.levels.includes('medio')) return { result: 'O médio prazo não está liberado para esta pessoa.', error: true };
  const live = livePlan(ctx);
  if (!live) return { result: 'A obra não tem plano do mês vivo.' };
  const { today } = ctx;
  const weekStart = startOfWeek(today),
    weekEnd = addDays(weekStart, 6);
  const filter = String(input.filtro ?? 'todas');
  const teams = ctx.data.teams.filter(t => t.workId === ctx.workId);
  const open = (t: PlanTask) => t.progress < 100 && !t.actualEnd;
  const selected = live.leaves.filter(t => {
    switch (filter) {
      case 'semana_atual':
        return open(t) && t.plannedStart <= weekEnd && t.plannedEnd >= weekStart;
      case 'atrasadas':
        return open(t) && t.plannedEnd < today;
      case 'em_andamento':
        return open(t) && t.progress > 0;
      case 'proximas':
        return open(t) && t.plannedStart >= today && t.plannedStart <= addDays(today, 14);
      default:
        return true;
    }
  });
  if (!selected.length) return { result: `Plano "${live.plan.name}" (${live.plan.month}): nenhuma tarefa no filtro "${filter}".` };
  const lines = selected
    .slice(0, MAX_LIST)
    .map(
      t =>
        `t:${handleOf(t.id)} | ${t.name} | ${dm(t.plannedStart)}–${dm(t.plannedEnd)} | ${Math.round(t.progress)}% | ${teamOf(t.teamId, teams) ? `${teamOf(t.teamId, teams)!.company} · ${teamOf(t.teamId, teams)!.name}` : '-'} | ${taskSituation(t, today)}`,
    );
  const cut = selected.length > MAX_LIST ? `\n(Mostrando ${MAX_LIST} de ${selected.length} tarefas.)` : '';
  return {
    result: `Plano "${live.plan.name}" (${live.plan.month}), filtro ${filter}: ${selected.length} tarefas.\napelido | tarefa | período | % | equipe | situação\n${lines.join('\n')}${cut}`,
  };
}

function listMacroServices(ctx: ToolContext): ToolOutcome {
  if (!ctx.levels.includes('longo')) return { result: 'O longo prazo não está liberado para esta pessoa.', error: true };
  const doc = ctx.longTermPlan;
  const activities = doc?.activities.filter(a => a.visible) ?? [];
  if (!doc || !activities.length) return { result: 'A obra não tem plano de longo prazo preenchido.' };
  const measured = latestPercents(activities, doc.measurements, ctx.today);
  const lines = activities.slice(0, 100).map(a => {
    const slots = floorSchedule(a);
    const total = slots.reduce((sum, s) => sum + s.duration, 0);
    const done = slots.reduce((sum, s) => sum + Math.max(0, Math.min(s.duration, daysBetween(s.start, ctx.today))), 0);
    const planned = total ? Math.round((done / total) * 100) : 0;
    const start = slots[0]?.start,
      finish = slots.reduce((max, s) => (s.finish > max ? s.finish : max), slots[0]?.finish ?? '');
    const m = a.unit ? `${Math.round(measured[a.id] ?? 0)}%` : 'sem medição';
    return `${a.name} | pav. ${a.firstFloor}–${a.lastFloor} | ${start ? dmy(start) : '?'}–${finish ? dmy(finish) : '?'} | medido ${m} | previsto hoje ${planned}%`;
  });
  return {
    result: `Plano de longo prazo: ${activities.length} serviços.\nserviço | pavimentos | período | medido | previsto\n${lines.join('\n')}`,
  };
}

// ─── Propostas ──────────────────────────────────────────────────────────────────

function editGate(weekStart: string, ctx: ToolContext): string | undefined {
  if (ctx.actor.role === 'viewer') return 'Seu perfil permite apenas consulta: não é possível propor edições.';
  if (!canEditWeek(weekStart, ctx.today, ctx.actor.role))
    return `A semana ${weekNumber(weekStart, ctx)} (${dmy(weekStart)}) já está encerrada para edição; só o admin altera semanas encerradas.`;
  return undefined;
}
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

function proposeCarry(input: Record<string, unknown>, ctx: ToolContext): ToolOutcome {
  const handles = asArray(input.linhas).map(text).filter(Boolean);
  if (!handles.length) return { result: 'Informe os apelidos das linhas a levar.', error: true };
  if (handles.length > MAX_PROPOSAL_ITEMS) return { result: `Proponha até ${MAX_PROPOSAL_ITEMS} linhas por vez.`, error: true };
  const fixed = input.semana !== undefined && input.semana !== null && text(input.semana) ? resolveWeek(input.semana, ctx) : undefined;
  if (fixed && 'error' in fixed) return { result: fixed.error, error: true };
  const rows = ctx.data.commitments.filter(c => c.workId === ctx.workId);
  const teams = ctx.data.teams.filter(t => t.workId === ctx.workId);
  const commands: Command[] = [];
  const lines: string[] = [];
  const skipped: string[] = [];
  let weekStart = fixed?.weekStart ?? '';
  for (const handle of handles) {
    const row = resolveHandle(rows, handle);
    if (!row) {
      skipped.push(`${handle}: linha não encontrada nesta obra`);
      continue;
    }
    const target = fixed?.weekStart ?? addDays(row.weekStart, 7);
    if (target === row.weekStart) {
      skipped.push(`${row.name}: já está na semana ${weekNumber(target, ctx)}`);
      continue;
    }
    const gate = editGate(target, ctx);
    if (gate) return { result: gate, error: true };
    const already = rows.some(c => c.weekStart === target && c.name === row.name && c.supplier === row.supplier);
    if (already) {
      skipped.push(`${row.name}: já existe linha igual na semana ${weekNumber(target, ctx)}`);
      continue;
    }
    const shift = Math.round((Date.parse(target) - Date.parse(row.weekStart)) / 604800000) * 7;
    weekStart = weekStart || target;
    commands.push({
      type: 'create_commitment',
      workId: ctx.workId,
      name: row.name,
      weekStart: target,
      responsibleId: ctx.actor.id,
      supplier: row.supplier,
      teamId: row.teamId ?? null,
      startDate: addDays(row.startDate, shift),
      endDate: addDays(row.endDate, shift),
    });
    lines.push(
      `${row.name}${commitmentCompanyOf(row, teams) ? ` (${commitmentCompanyOf(row, teams)})` : ''} → semana ${weekNumber(target, ctx)}`,
    );
  }
  if (!commands.length) return { result: `Nada a levar.${skipped.length ? ` ${skipped.join('; ')}.` : ''}`, error: true };
  const proposal: AgentProposal = {
    id: ctx.newId(),
    kind: 'levar',
    title: `Levar ${commands.length === 1 ? '1 linha' : `${commands.length} linhas`} para a semana ${weekNumber(weekStart, ctx)}`,
    lines,
    commands,
    weekStart,
    skipped,
  };
  return { result: proposalText(proposal), proposal };
}

function proposeCreate(input: Record<string, unknown>, ctx: ToolContext): ToolOutcome {
  const week = resolveWeek(input.semana, ctx);
  if ('error' in week) return { result: week.error, error: true };
  const gate = editGate(week.weekStart, ctx);
  if (gate) return { result: gate, error: true };
  const items = asArray(input.itens).filter((i): i is Record<string, unknown> => !!i && typeof i === 'object');
  if (!items.length) return { result: 'Informe ao menos um item.', error: true };
  if (items.length > MAX_PROPOSAL_ITEMS) return { result: `Proponha até ${MAX_PROPOSAL_ITEMS} linhas por vez.`, error: true };
  const weekEnd = addDays(week.weekStart, 6);
  const teams = ctx.data.teams.filter(t => t.workId === ctx.workId);
  const rows = ctx.data.commitments.filter(c => c.workId === ctx.workId && c.weekStart === week.weekStart);
  const live = ctx.levels.includes('medio') ? livePlan(ctx) : undefined;
  const commands: Command[] = [];
  const lines: string[] = [];
  const skipped: string[] = [];
  const clamp = (date: string) => (date < week.weekStart ? week.weekStart : date > weekEnd ? weekEnd : date);
  for (const item of items) {
    const teamName = text(item.equipe);
    let name = text(item.nome),
      company = text(item.empresa),
      start = text(item.inicio),
      end = text(item.fim),
      activityNote = '';
    const taskHandle = text(item.tarefa);
    let team: Team | undefined;
    if (taskHandle) {
      const task = live ? resolveHandle(live.leaves, taskHandle) : undefined;
      if (!task) {
        skipped.push(`${taskHandle}: tarefa do plano do mês não encontrada`);
        continue;
      }
      name = name || task.name;
      team = teamOf(task.teamId, teams);
      company = company || team?.company || '';
      start = start || clamp(task.plannedStart);
      end = end || clamp(task.plannedEnd);
      activityNote = ` (do plano do mês: ${dm(task.plannedStart)}–${dm(task.plannedEnd)})`;
    }
    if (!name) {
      skipped.push('item sem nome');
      continue;
    }
    if (teamName) {
      const candidates = teams.filter(t => nameKey(t.name) === nameKey(teamName));
      team = candidates.find(t => !company || nameKey(t.company) === nameKey(company)) ?? candidates[0] ?? team;
      if (!candidates.length) skipped.push(`${name}: equipe "${teamName}" não cadastrada; a linha fica só com a empresa`);
      company = company || team?.company || '';
    }
    if (start && !DATE.test(start)) {
      skipped.push(`${name}: início "${start}" inválido`);
      continue;
    }
    if (end && !DATE.test(end)) {
      skipped.push(`${name}: fim "${end}" inválido`);
      continue;
    }
    const startDate = clamp(start || week.weekStart);
    const endDate = clamp(end || startDate) < startDate ? startDate : clamp(end || startDate);
    if (rows.some(c => nameKey(c.name) === nameKey(name) && nameKey(commitmentCompanyOf(c, teams)) === nameKey(company))) {
      skipped.push(`${name}: já existe linha igual na semana ${weekNumber(week.weekStart, ctx)}`);
      continue;
    }
    commands.push({
      type: 'create_commitment',
      workId: ctx.workId,
      name,
      weekStart: week.weekStart,
      responsibleId: ctx.actor.id,
      supplier: company,
      teamId: team?.id ?? null,
      startDate,
      endDate,
    });
    lines.push(`${name}${company ? ` (${company}${team ? ` · ${team.name}` : ''})` : ''} ${dm(startDate)}–${dm(endDate)}${activityNote}`);
  }
  if (!commands.length) return { result: `Nenhuma linha a criar.${skipped.length ? ` ${skipped.join('; ')}.` : ''}`, error: true };
  const proposal: AgentProposal = {
    id: ctx.newId(),
    kind: 'criar',
    title: `Criar ${commands.length === 1 ? '1 linha' : `${commands.length} linhas`} na semana ${weekNumber(week.weekStart, ctx)}`,
    lines,
    commands,
    weekStart: week.weekStart,
    skipped,
  };
  return { result: proposalText(proposal), proposal };
}

/** A causa da lista fechada: igual (sem acento nem caixa) ou, com cinco letras ou mais, a única que contém
 * o trecho. Trecho que cabe em mais de uma ("falta", "produtividade") não escolhe por ninguém: volta
 * as candidatas para o modelo perguntar. */
function causeOf(value: string): { cause: NonFulfillmentCause } | { candidates: NonFulfillmentCause[] } {
  const key = nameKey(value);
  const exact = NON_FULFILLMENT_CAUSES.find(c => nameKey(c) === key);
  if (exact) return { cause: exact };
  const candidates = key.length >= 5 ? NON_FULFILLMENT_CAUSES.filter(c => nameKey(c).includes(key)) : [];
  return candidates.length === 1 ? { cause: candidates[0] } : { candidates };
}

function proposeFulfillment(input: Record<string, unknown>, ctx: ToolContext): ToolOutcome {
  const items = asArray(input.itens).filter((i): i is Record<string, unknown> => !!i && typeof i === 'object');
  if (!items.length) return { result: 'Informe ao menos uma linha.', error: true };
  if (items.length > MAX_PROPOSAL_ITEMS) return { result: `Aponte até ${MAX_PROPOSAL_ITEMS} linhas por vez.`, error: true };
  const rows = ctx.data.commitments.filter(c => c.workId === ctx.workId);
  const fulfillments: FulfillmentItem[] = [];
  const lines: string[] = [];
  const skipped: string[] = [];
  let weekStart = '';
  for (const item of items) {
    const row = resolveHandle(rows, text(item.linha));
    if (!row) {
      skipped.push(`${text(item.linha) || '(sem apelido)'}: linha não encontrada nesta obra`);
      continue;
    }
    // Apontar é livre em qualquer semana para quem edita a obra (src/domain/week-lock.ts, 09/10/2026):
    // só a consulta fica de fora; a trava de semana encerrada vale para incluir e editar linha.
    if (ctx.actor.role === 'viewer') return { result: 'Seu perfil permite apenas consulta: não é possível propor edições.', error: true };
    const fulfilled = item.cumprido === true;
    if (fulfilled) {
      fulfillments.push({ commitmentId: row.id, fulfilled: true });
      lines.push(`${row.name}: Sim`);
    } else {
      const found = causeOf(text(item.causa));
      if (!('cause' in found)) {
        skipped.push(
          found.candidates.length
            ? `${row.name}: causa "${text(item.causa)}" é ambígua (${found.candidates.join(', ')}); pergunte qual`
            : `${row.name}: causa "${text(item.causa) || '(vazia)'}" não está na lista`,
        );
        continue;
      }
      const justification = text(item.justificativa).slice(0, 500);
      fulfillments.push({ commitmentId: row.id, fulfilled: false, cause: found.cause, justification: justification || undefined });
      lines.push(`${row.name}: Não — ${found.cause}${justification ? ` (${justification})` : ''}`);
    }
    weekStart = weekStart || row.weekStart;
  }
  if (!fulfillments.length)
    return { result: `Nenhum apontamento a propor.${skipped.length ? ` ${skipped.join('; ')}.` : ''}`, error: true };
  const proposal: AgentProposal = {
    id: ctx.newId(),
    kind: 'apontar',
    title: `Apontar ${fulfillments.length === 1 ? '1 linha' : `${fulfillments.length} linhas`}`,
    lines,
    commands: [{ type: 'record_fulfillments', items: fulfillments }],
    weekStart,
    skipped,
  };
  return { result: proposalText(proposal), proposal };
}

const proposalText = (p: AgentProposal) =>
  `Proposta ${p.id} criada: ${p.title}. Ela aparece na tela com o botão Aplicar; nada foi gravado ainda.\n${p.lines.map(l => `- ${l}`).join('\n')}${p.skipped.length ? `\nFicaram de fora: ${p.skipped.join('; ')}.` : ''}`;

/** Executa uma ferramenta pelo nome. Entrada inválida vira texto de erro para o modelo corrigir. */
export function runAgentTool(name: string, input: unknown, ctx: ToolContext): ToolOutcome {
  const args = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  switch (name) {
    case 'listar_semana':
      return listWeek(args, ctx);
    case 'listar_tarefas_mes':
      return listMonthTasks(args, ctx);
    case 'listar_servicos_macro':
      return listMacroServices(ctx);
    case 'propor_levar':
      return proposeCarry(args, ctx);
    case 'propor_criar_linhas':
      return proposeCreate(args, ctx);
    case 'propor_apontar':
      return proposeFulfillment(args, ctx);
    default:
      return { result: `Ferramenta "${name}" não existe.`, error: true };
  }
}
