import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GLOBAL_TOOL_SPECS,
  MAX_RESULT_CHARS,
  capResult,
  defaultPanoramaSelection,
  resolveWork,
  runGlobalTool,
  worksListText,
  type AgentDataLoader,
  type AgentWorkRef,
  type GlobalToolContext,
} from '../src/application/use-cases/agent-global-tools';
import { AGENT_TOOL_SPECS, runAgentTool, type ToolContext } from '../src/application/use-cases/agent-tools';
import {
  SAFETY_TOOL_SPEC,
  TERMINALITY_TOOL_SPEC,
  safetyReport,
  terminalityReport,
  type ModuleReportEntry,
} from '../src/application/use-cases/agent-module-reports';
import { getPlanning, type Planning } from '../src/application/use-cases/get-planning';
import type { AgentBriefing } from '../src/domain/agent-briefing';
import type { PlanningData } from '../src/domain/entities';
import type { LobData } from '../src/domain/lob';
import type { SafetyData } from '../src/domain/safety';
import type { TerminalityData } from '../src/domain/terminality';
import { TODAY, WEEK_ONE, fixture, longTermPlan, stamp } from './fixtures/agent-planning';

/** Claudia geral (08/11/2026): a despachante das ferramentas que atravessam obras, com um carregador falso. A obra
 * w1 é a do fixture do agente (Residencial Horizonte, semana atual 43 em 27/10/2026). */

const WORKS: AgentWorkRef[] = [
  { id: 'w1', name: 'Residencial Horizonte', code: 'OB1', active: true },
  { id: 'w2', name: 'Mozine', code: 'MZN', active: true },
  { id: 'w3', name: 'Tauá', code: 'TAU', active: false },
  { id: 'w4', name: 'Brizz Sul', code: 'BZS', active: true },
  { id: 'w5', name: 'Brizz Norte', code: 'BZN', active: true },
];

let seq = 0;
const toolCtx = (workId: string): ToolContext => ({
  data: fixture(),
  workId,
  today: TODAY,
  actor: { id: 'u-admin', role: 'admin' },
  levels: ['longo', 'medio', 'curto'],
  weekOne: WEEK_ONE,
  longTermPlan,
  newId: () => `prop-${++seq}`,
});

const emptyTerminality = (): TerminalityData => ({ floors: [], units: [], types: [], people: [], items: [], photos: [] });
const emptySafety = (): SafetyData => ({ types: [], items: [], photos: [] });
const briefingOf = (workId: string): AgentBriefing => ({
  workId,
  workCode: 'OB1',
  workName: 'Residencial Horizonte',
  today: TODAY,
  levels: ['longo', 'medio', 'curto'],
  findings: [],
  text: 'Obra: OB1 · Residencial Horizonte. Hoje: 27/10/2026 (terça-feira).\n## Radar\n- alerta de exemplo',
  hash: 'abc',
});

// ─── Vagões de exemplo: Torre A com um terminal, um em produção vencido e um com restrição vencida ─────────

function wagonsData(): PlanningData {
  const data = fixture();
  data.users.push({ id: 'u1', ...stamp, name: 'Ana', role: 'planner', workIds: ['w1'] });
  data.sequences.push({ id: 'seq1', ...stamp, workId: 'w1', name: 'Torre A', defaultTaktDays: 5, calendar: 'business_days' });
  const wagon = (id: string, number: number, start: string, end: string, actualStart?: string) => ({
    id,
    ...stamp,
    sequenceId: 'seq1',
    number,
    plannedStart: start,
    plannedEnd: end,
    taktDays: 5,
    responsibleIds: [],
    ...(actualStart ? { actualStart } : {}),
  });
  data.wagons.push(
    wagon('v1', 1, '2026-09-01', '2026-09-05', '2026-09-01'),
    wagon('v2', 2, '2026-10-05', '2026-10-09', '2026-10-05'),
    wagon('v3', 3, '2026-11-02', '2026-11-06'),
  );
  const activity = (id: string, wagonId: string, progress: number, status: 'not_started' | 'in_progress' | 'completed') => ({
    id,
    ...stamp,
    wagonId,
    name: `Atividade ${id}`,
    locationId: 'loc1',
    responsibleId: 'u1',
    plannedStart: '2026-09-01',
    plannedEnd: '2026-09-05',
    progress,
    status,
    weight: 1,
    mandatory: true,
    origin: 'manual' as const,
  });
  data.activities.push(
    activity('a1', 'v1', 100, 'completed'),
    activity('a2', 'v2', 60, 'in_progress'),
    activity('a3', 'v3', 0, 'not_started'),
  );
  data.restrictions.push({
    id: 'r1',
    ...stamp,
    wagonId: 'v3',
    description: 'Projeto de esquadrias não aprovado',
    responsibleId: 'u1',
    dueDate: '2026-10-20',
    status: 'open',
    blocksExecution: true,
    blocksTerminality: false,
    boardStatus: 'em_tratativa',
  });
  data.pendingItems.push({
    id: 'p1',
    ...stamp,
    wagonId: 'v2',
    description: 'Rejunte do banheiro',
    responsibleId: 'u1',
    dueDate: '2026-10-30',
    status: 'open',
    blocksTerminality: true,
  });
  data.releases.push({
    id: 'rel1',
    ...stamp,
    wagonId: 'v2',
    predecessorId: 'v1',
    type: 'normal',
    authorizedBy: 'u1',
    releasedAt: '2026-10-05T10:00:00Z',
    acceptedPendingIds: [],
    acknowledgedDebtIds: [],
  });
  return data;
}
const planningOf = (data: PlanningData): Promise<Planning> => getPlanning({ getSnapshot: async () => data } as never, TODAY);

// ─── Linha de Balanço de exemplo: Alvenaria atrasada no 1º pavimento, Pintura a iniciar ──────────────────

function lobData(): LobData {
  const base = { ...stamp, workId: 'w1' };
  return {
    locals: [
      { id: 'L2', ...base, name: '1º pavimento', orderIndex: 1 },
      { id: 'L1', ...base, name: 'Térreo', orderIndex: 0 },
    ],
    services: [
      { id: 'S2', ...base, name: 'Pintura', color: '#16a34a', orderIndex: 1 },
      { id: 'S1', ...base, name: 'Alvenaria', color: '#2563eb', team: 'Alfa', orderIndex: 0 },
    ],
    activities: [
      { id: 'b1', ...base, serviceId: 'S1', localId: 'L1', start: '2026-10-05', durationDays: 10 },
      { id: 'b2', ...base, serviceId: 'S1', localId: 'L2', start: '2026-10-19', durationDays: 10 },
      { id: 'b3', ...base, serviceId: 'S2', localId: 'L1', start: '2026-11-02', durationDays: 5 },
    ],
    dependencies: [],
    baselines: [],
    launches: [],
    measurements: [
      { id: 'm1', ...base, number: 1, date: '2026-10-23', status: 'closed', createdBy: 'u1' },
      { id: 'm2', ...base, number: 2, date: '2026-10-30', status: 'open', createdBy: 'u1' },
    ],
    items: [
      { id: 'i1', ...base, measurementId: 'm1', activityId: 'b1', value: 100, previousValue: 0, createdBy: 'u1' },
      {
        id: 'i2',
        ...base,
        measurementId: 'm1',
        activityId: 'b2',
        value: 20,
        previousValue: 0,
        delayCause: 'Falta de Material',
        createdBy: 'u1',
      },
      // A medição aberta ainda não conta.
      { id: 'i3', ...base, measurementId: 'm2', activityId: 'b2', value: 90, previousValue: 20, createdBy: 'u1' },
    ],
    photos: [],
  };
}

// ─── Carregador falso, com registro das chamadas ────────────────────────────────

type Call = { method: string; args: unknown[] };
function fakeLoader(over: Partial<AgentDataLoader> = {}) {
  const calls: Call[] = [];
  const base: AgentDataLoader = {
    workContext: async id => toolCtx(id),
    briefing: async id => briefingOf(id),
    planning: async () => planningOf(wagonsData()),
    terminality: async id => (id === 'w3' ? null : emptyTerminality()),
    safety: async id => (id === 'w3' ? null : emptySafety()),
    lob: async () => lobData(),
    workSettings: async () => ({ weekOne: WEEK_ONE, place: 'Vitória - ES' }),
    portfolio: async (_selection, ids) => ids.map(id => `${id} | PPC 50%`).join('\n'),
  };
  const merged = { ...base, ...over };
  const loader = Object.fromEntries(
    Object.entries(merged).map(([method, fn]) => [
      method,
      (...args: unknown[]) => {
        calls.push({ method, args });
        return (fn as (...a: unknown[]) => unknown)(...args);
      },
    ]),
  ) as unknown as AgentDataLoader;
  return { loader, calls };
}
const gctx = (over: Partial<GlobalToolContext> = {}): GlobalToolContext => ({
  works: WORKS,
  contextWorkId: 'w1',
  today: TODAY,
  actor: { id: 'u-admin', role: 'admin' },
  loader: fakeLoader().loader,
  newId: () => 'g-1',
  ...over,
});
const workOf = (value: unknown, ctx = gctx()) => {
  const resolved = resolveWork(value, ctx);
  return 'work' in resolved ? resolved.work.id : `erro: ${resolved.error}`;
};

// ─── Obras ──────────────────────────────────────────────────────────────────────

test('worksListText: uma linha por obra, sigla | nome | situação, sigla vazia vira "-"', () => {
  assert.equal(
    worksListText(WORKS),
    'OB1 | Residencial Horizonte | ativa\nMZN | Mozine | ativa\nTAU | Tauá | inativa\nBZS | Brizz Sul | ativa\nBZN | Brizz Norte | ativa',
  );
  assert.equal(worksListText([{ id: 'x', name: 'Sem sigla', code: '', active: false }]), '- | Sem sigla | inativa');
  assert.equal(worksListText([]), '');
});

test('resolveWork: id, sigla, nome sem acento nem caixa, trecho único, nome dentro de frase, vazio = obra da tela', () => {
  assert.equal(workOf('w2'), 'w2');
  assert.equal(workOf('mzn'), 'w2');
  assert.equal(workOf(' MZN '), 'w2');
  assert.equal(workOf('TAUA'), 'w3');
  assert.equal(workOf('tauá'), 'w3');
  assert.equal(workOf('Residencial Horizonte'), 'w1');
  assert.equal(workOf('horizonte'), 'w1');
  assert.equal(workOf('obra Mozine'), 'w2');
  assert.equal(workOf('MZN · Mozine'), 'w2');
  assert.equal(workOf('Brizz Sul'), 'w4');
  assert.equal(workOf('obra brizz sul'), 'w4');
  assert.equal(workOf(''), 'w1');
  assert.equal(workOf(undefined), 'w1');
  assert.equal(workOf(null), 'w1');
  // Entre "Brizz" e "Brizz Sul" citados numa frase, vence o nome mais longo.
  const nested = gctx({
    works: [
      { id: 'a', name: 'Brizz', code: 'BRZ', active: true },
      { id: 'b', name: 'Brizz Sul', code: 'BZS', active: true },
    ],
  });
  assert.equal(workOf('obra brizz sul', nested), 'b');
  assert.equal(workOf('brizz', nested), 'a');
});

test('resolveWork: ambíguo, não achado e vazio fora de uma obra devolvem erro com as obras', () => {
  const ambiguous = resolveWork('brizz', gctx());
  assert.ok('error' in ambiguous);
  assert.ok(ambiguous.error.includes('Brizz Sul (BZS)') && ambiguous.error.includes('Brizz Norte (BZN)'), ambiguous.error);
  const missing = resolveWork('Atmos', gctx());
  assert.ok('error' in missing);
  assert.ok(missing.error.includes('"Atmos" não encontrada'));
  assert.ok(missing.error.includes('MZN | Mozine | ativa'));
  const noContext = resolveWork('', gctx({ contextWorkId: undefined }));
  assert.ok('error' in noContext);
  assert.ok(noContext.error.startsWith('Diga de qual obra'));
  assert.ok(noContext.error.includes('TAU | Tauá | inativa'));
  // Obra da tela fora das obras liberadas: como se não houvesse obra na tela.
  assert.ok('error' in resolveWork(undefined, gctx({ contextWorkId: 'w9' })));
  assert.ok('error' in resolveWork('x', gctx({ works: [] })));
});

// ─── Especificações ─────────────────────────────────────────────────────────────

test('GLOBAL_TOOL_SPECS: as sete ferramentas da obra com `obra`, as novas e as dos módulos importadas como estão', () => {
  assert.deepEqual(
    GLOBAL_TOOL_SPECS.map(s => s.name),
    [
      'listar_semana',
      'listar_tarefas_mes',
      'listar_servicos_macro',
      'propor_levar',
      'propor_criar_linhas',
      'propor_apontar',
      'consultar_manual',
      'panorama_obras',
      'resumo_obra',
      'consultar_vagoes',
      'consultar_lob',
      'consultar_configuracoes_obra',
      TERMINALITY_TOOL_SPEC.name,
      SAFETY_TOOL_SPEC.name,
    ],
  );
  assert.ok(GLOBAL_TOOL_SPECS.includes(TERMINALITY_TOOL_SPEC));
  assert.ok(GLOBAL_TOOL_SPECS.includes(SAFETY_TOOL_SPEC));
  for (const spec of GLOBAL_TOOL_SPECS) {
    assert.ok(spec.description.length > 20, spec.name);
    assert.equal(spec.input_schema.type, 'object', spec.name);
    if (spec === TERMINALITY_TOOL_SPEC || spec === SAFETY_TOOL_SPEC) continue;
    assert.equal(spec.input_schema.additionalProperties, false, spec.name);
    const properties = spec.input_schema.properties as Record<string, { description?: string }>;
    if (spec.name === 'consultar_manual' || spec.name === 'panorama_obras') assert.equal(properties.obra, undefined, spec.name);
    else assert.ok(properties.obra?.description?.includes('obra da tela'), spec.name);
  }
  // Mesmo esquema da ferramenta da obra, mais `obra`; o original não muda.
  const original = AGENT_TOOL_SPECS.find(s => s.name === 'propor_levar')!;
  const wrapped = GLOBAL_TOOL_SPECS.find(s => s.name === 'propor_levar')!;
  assert.deepEqual(wrapped.input_schema.required, original.input_schema.required);
  assert.deepEqual(Object.keys(wrapped.input_schema.properties as object), ['obra', 'linhas', 'semana']);
  assert.equal((original.input_schema.properties as Record<string, unknown>).obra, undefined);
  assert.ok(GLOBAL_TOOL_SPECS.find(s => s.name === 'listar_servicos_macro')!.description.includes('consultar_lob'));
});

// ─── Ferramentas da obra ────────────────────────────────────────────────────────

test('listar_semana com obra: o texto da Claudia da obra prefixado pela obra, workIds e selo', async () => {
  const { loader, calls } = fakeLoader();
  const out = await runGlobalTool('listar_semana', { obra: 'OB1', semana: 'atual' }, gctx({ loader, contextWorkId: undefined }));
  const direct = runAgentTool('listar_semana', { semana: 'atual' }, toolCtx('w1'));
  assert.equal(out.result, `Obra Residencial Horizonte (OB1). ${direct.result}`);
  assert.ok(out.result.startsWith('Obra Residencial Horizonte (OB1). Semana 43 (26/10/2026 a 01/11/2026): 2 linhas'));
  assert.equal(out.error, undefined);
  assert.equal(out.proposal, undefined);
  assert.deepEqual(out.workIds, ['w1']);
  assert.equal(out.consulted, 'Curto prazo · Residencial Horizonte');
  assert.deepEqual(calls, [{ method: 'workContext', args: ['w1'] }]);
});

test('listar_semana: sem obra vale a da tela; outra obra e obra inativa entram no prefixo', async () => {
  const fromScreen = await runGlobalTool('listar_semana', { semana: 'atual' }, gctx());
  assert.ok(fromScreen.result.startsWith('Obra Residencial Horizonte (OB1). Semana 43'));
  const { loader, calls } = fakeLoader();
  const other = await runGlobalTool('listar_semana', { obra: 'Mozine', semana: 'atual' }, gctx({ loader }));
  assert.ok(other.result.startsWith('Obra Mozine (MZN). Semana 43'), other.result);
  assert.deepEqual(other.workIds, ['w2']);
  assert.deepEqual(calls[0], { method: 'workContext', args: ['w2'] });
  const inactive = await runGlobalTool('listar_tarefas_mes', { obra: 'taua', filtro: 'todas' }, gctx());
  assert.ok(inactive.result.startsWith('Obra Tauá (TAU, inativa). '), inactive.result);
  assert.equal(inactive.consulted, 'Médio prazo · Tauá');
});

test('ferramenta da obra: entrada recusada depois de ler a obra mantém o prefixo e o workId, sem selo', async () => {
  const out = await runGlobalTool('listar_semana', { obra: 'OB1', semana: 'quando?' }, gctx());
  assert.equal(out.error, true);
  assert.ok(out.result.startsWith('Obra Residencial Horizonte (OB1). Semana "quando?" não entendida'));
  assert.deepEqual(out.workIds, ['w1']);
  assert.equal(out.consulted, undefined);
  const unknown = await runGlobalTool('listar_semana', { obra: 'Atmos', semana: 'atual' }, gctx());
  assert.equal(unknown.error, true);
  assert.deepEqual(unknown.workIds, []);
  assert.ok(unknown.result.includes('não encontrada'));
});

test('propor_apontar com obra: a proposta leva workId e workName, comandos iguais aos da Claudia da obra', async () => {
  const out = await runGlobalTool('propor_apontar', { obra: 'OB1', itens: [{ linha: 'c:c43-0001', cumprido: true }] }, gctx());
  assert.equal(out.error, undefined);
  assert.equal(out.proposal?.kind, 'apontar');
  assert.equal(out.proposal?.workId, 'w1');
  assert.equal(out.proposal?.workName, 'Residencial Horizonte');
  assert.deepEqual(out.proposal?.commands, [
    { type: 'record_fulfillments', items: [{ commitmentId: 'c43-0001-reboco', fulfilled: true }] },
  ]);
  assert.ok(out.result.startsWith('Obra Residencial Horizonte (OB1). Proposta '));
  assert.deepEqual(out.workIds, ['w1']);
  assert.equal(out.consulted, 'Curto prazo · Residencial Horizonte');
  const carry = await runGlobalTool('propor_levar', { linhas: ['c:c42-0002'] }, gctx());
  assert.equal(carry.proposal?.workId, 'w1');
  assert.equal(carry.proposal?.kind, 'levar');
});

test('consultar_manual: passa direto, sem obra, sem ler o carregador e sem corte', async () => {
  const { loader, calls } = fakeLoader();
  const out = await runGlobalTool('consultar_manual', { tema: 'geral-glossario' }, gctx({ loader }));
  assert.equal(out.error, undefined);
  assert.equal(out.result, runAgentTool('consultar_manual', { tema: 'geral-glossario' }, toolCtx('w1')).result);
  assert.equal(out.consulted, 'Manual do sistema');
  assert.deepEqual(out.workIds, []);
  assert.deepEqual(calls, []);
  // Sem seção que case, o índice inteiro volta como erro: passa do limite das outras ferramentas e não é cortado.
  const index = await runGlobalTool('consultar_manual', { tema: 'zzzz qqqq wwww' }, gctx());
  assert.equal(index.error, true);
  assert.ok(index.result.length > MAX_RESULT_CHARS);
  assert.ok(!index.result.includes('lista cortada'));
});

// ─── Panorama ───────────────────────────────────────────────────────────────────

test('panorama_obras: sem período, as 4 últimas semanas até hoje e todas as obras', async () => {
  assert.deepEqual(defaultPanoramaSelection(TODAY), { scale: 'personalizado', from: '2026-10-05', to: '2026-10-27' });
  const { loader, calls } = fakeLoader();
  const out = await runGlobalTool('panorama_obras', {}, gctx({ loader }));
  assert.deepEqual(calls, [
    { method: 'portfolio', args: [{ scale: 'personalizado', from: '2026-10-05', to: '2026-10-27' }, ['w1', 'w2', 'w3', 'w4', 'w5']] },
  ]);
  assert.equal(
    out.result,
    'Panorama das obras — período: as 4 últimas semanas, de 05/10/2026 a 27/10/2026; 5 obras.\nw1 | PPC 50%\nw2 | PPC 50%\nw3 | PPC 50%\nw4 | PPC 50%\nw5 | PPC 50%',
  );
  assert.equal(out.consulted, 'Panorama das obras');
  assert.deepEqual(out.workIds, ['w1', 'w2', 'w3', 'w4', 'w5']);
});

test('panorama_obras: escalas fixas com chave, personalizado, obras pedidas e erros', async () => {
  const selectionOf = async (input: Record<string, unknown>) => {
    const { loader, calls } = fakeLoader();
    const out = await runGlobalTool('panorama_obras', input, gctx({ loader }));
    return { out, args: calls[0]?.args };
  };
  const month = await selectionOf({ escala: 'mes', chave: '2026-10', obras: ['MZN', 'horizonte', 'mzn'] });
  assert.deepEqual(month.args, [{ scale: 'mes', key: '2026-10' }, ['w2', 'w1']]);
  assert.ok(month.out.result.startsWith('Panorama das obras — período: outubro de 2026; 2 obras.'));
  assert.deepEqual(month.out.workIds, ['w2', 'w1']);
  assert.deepEqual((await selectionOf({ escala: 'Mês' })).args?.[0], { scale: 'mes' });
  assert.ok((await selectionOf({ escala: 'mes' })).out.result.includes('período: mês mais recente'));
  assert.deepEqual((await selectionOf({ escala: 'semana', chave: '2026-10-21' })).args?.[0], { scale: 'semana', key: '2026-10-19' });
  assert.deepEqual((await selectionOf({ escala: 'trimestre', chave: '2026-t4' })).args?.[0], { scale: 'trimestre', key: '2026-T4' });
  assert.deepEqual((await selectionOf({ escala: 'ano', chave: '2026' })).args?.[0], { scale: 'ano', key: '2026' });
  assert.deepEqual((await selectionOf({ escala: 'personalizado', de: '2026-09-01', ate: '2026-09-30' })).args?.[0], {
    scale: 'personalizado',
    from: '2026-09-01',
    to: '2026-09-30',
  });
  assert.deepEqual((await selectionOf({ escala: 'personalizado', ate: '2026-09-30' })).args?.[0], {
    scale: 'personalizado',
    from: '2026-09-07',
    to: '2026-09-30',
  });
  assert.deepEqual((await selectionOf({ de: '2026-10-20', ate: '2026-09-01' })).args?.[0], {
    scale: 'personalizado',
    from: '2026-09-01',
    to: '2026-10-20',
  });
  assert.deepEqual((await selectionOf({ obras: ['todas'] })).args?.[1], ['w1', 'w2', 'w3', 'w4', 'w5']);
  assert.deepEqual((await selectionOf({ obras: 'Mozine' })).args?.[1], ['w2']);
  for (const [input, message] of [
    [{ escala: 'decada' }, 'Escala "decada" inválida'],
    [{ escala: 'mes', chave: '2026-13' }, 'inválido para a escala mes'],
    [{ escala: 'mes', chave: '2026-12' }, 'ainda não começou'],
    [{ escala: 'personalizado', de: 'ontem' }, 'Data inicial "ontem" inválida'],
    [{ obras: ['MZN', 'Atmos', 'brizz'] }, 'as obras "Atmos", "brizz"'],
  ] as const) {
    const { out, args } = await selectionOf(input);
    assert.equal(out.error, true, message);
    assert.ok(out.result.includes(message), out.result);
    assert.deepEqual(out.workIds, []);
    assert.equal(args, undefined, 'o carregador não é chamado');
  }
});

// ─── Resumo, vagões, Linha de Balanço e configurações ───────────────────────────

test('resumo_obra: o dossiê do carregador, com a obra no cabeçalho', async () => {
  const { loader, calls } = fakeLoader();
  const out = await runGlobalTool('resumo_obra', { obra: 'OB1' }, gctx({ loader }));
  assert.equal(
    out.result,
    `Resumo da obra Residencial Horizonte (OB1): dossiê do sistema, com os achados do radar.\n${briefingOf('w1').text}`,
  );
  assert.equal(out.consulted, 'Resumo · Residencial Horizonte');
  assert.deepEqual(out.workIds, ['w1']);
  assert.deepEqual(calls, [{ method: 'briefing', args: ['w1'] }]);
});

test('consultar_vagoes: status, tabela por sequência, restrições, pendências, dívidas e liberações; filtros', async () => {
  const out = await runGlobalTool('consultar_vagoes', { obra: 'OB1' }, gctx());
  assert.equal(out.error, undefined);
  assert.equal(out.consulted, 'Vagões · Residencial Horizonte');
  assert.deepEqual(out.workIds, ['w1']);
  assert.deepEqual(out.result.split('\n'), [
    'Obra Residencial Horizonte (OB1). Vagões: 3 (1 terminal, 1 em produção, 1 com restrição, 0 não iniciado). Takt vencido: 1 (Vagão 02).',
    '',
    'Sequência Torre A (takt 5 dias úteis), filtro todos:',
    'vagão | status | previsto | início real | avanço | takt',
    'Vagão 01 | Terminal | 01/09–05/09/2026 | 01/09/2026 | 100% | concluído',
    'Vagão 02 | Em produção | 05/10–09/10/2026 | 05/10/2026 | 60% | takt vencido',
    'Vagão 03 | Com restrição | 02/11–06/11/2026 | - | 0% | no prazo',
    '',
    'Restrições abertas: 1 (1 vencidas).',
    '- Vagão 03 | Projeto de esquadrias não aprovado | limite 20/10/2026 (vencida) | bloqueia execução | Em tratativa | resp. Ana',
    '',
    'Pendências abertas: 1.',
    '- Vagão 02 | Rejunte do banheiro | prazo 30/10/2026 | bloqueia terminalidade | resp. Ana',
    '',
    'Dívidas de terminalidade abertas (pendências aceitas em liberação, ainda abertas): 0.',
    'Liberações recentes (1 de 1):',
    '- 05/10/2026: Vagão 02, liberação normal',
  ]);
  const late = await runGlobalTool('consultar_vagoes', { obra: 'OB1', filtro: 'atrasados' }, gctx());
  assert.ok(late.result.includes('Vagão 02 | Em produção'));
  assert.ok(!late.result.includes('Vagão 01 | Terminal'));
  assert.ok(late.result.includes('Restrições abertas: 0.'), 'as restrições seguem o filtro');
  const producing = await runGlobalTool('consultar_vagoes', { filtro: 'em_producao' }, gctx());
  assert.ok(producing.result.includes('Vagão 02 | Em produção'));
  assert.ok(!producing.result.includes('Vagão 03 | Com restrição'), 'com restrição sem início não está em produção');
  const bad = await runGlobalTool('consultar_vagoes', { filtro: 'parados' }, gctx());
  assert.equal(bad.error, true);
  assert.ok(bad.result.includes('em_producao, atrasados ou todos'));
  // Obra sem vagões.
  const empty = await runGlobalTool(
    'consultar_vagoes',
    {},
    gctx({ loader: fakeLoader({ planning: async () => planningOf(fixture()) }).loader }),
  );
  assert.equal(empty.result, 'Obra Residencial Horizonte (OB1). Sem vagões gerados para esta obra.');
});

test('consultar_lob: avanço medido × previsto, serviços em ordem, blocos atrasados com motivo e medição aberta', async () => {
  const out = await runGlobalTool('consultar_lob', { obra: 'OB1' }, gctx());
  assert.equal(out.error, undefined);
  assert.equal(out.consulted, 'Linha de Balanço · Residencial Horizonte');
  assert.deepEqual(out.workIds, ['w1']);
  assert.deepEqual(out.result.split('\n'), [
    'Obra Residencial Horizonte (OB1). Linha de Balanço: 2 serviços, 2 locais, 3 blocos; cronograma de 05/10/2026 a 06/11/2026.',
    'Avanço físico medido: 48%; previsto para hoje: 68% (20 pontos abaixo do previsto).',
    'Última medição fechada: nº 1, de 23/10/2026.',
    'Medição nº 2 aberta (em preenchimento), com data 30/10/2026: os valores dela ainda não contam.',
    'Blocos atrasados (previsto para hoje ao menos 10 pontos acima do medido): 1 de 3.',
    '',
    'serviço | equipe | locais | período | previsto hoje | medido | situação',
    'Alvenaria | Alfa | 2 | 05/10/2026–30/10/2026 | 85% | 60% | atrasado: 1 de 2 blocos, até 5 dias úteis',
    'Pintura | - | 1 | 02/11/2026–06/11/2026 | 0% | 0% | a iniciar',
    '',
    'Blocos mais atrasados (1 de 1):',
    '- Alvenaria · 1º pavimento | previsto 70% | medido 20% | atraso de 5 dias úteis | motivo: Falta de Material',
  ]);
  const unavailable = await runGlobalTool('consultar_lob', {}, gctx({ loader: fakeLoader({ lob: async () => null }).loader }));
  assert.equal(unavailable.result, 'Obra Residencial Horizonte (OB1). A Linha de Balanço ainda não está disponível no sistema.');
  assert.equal(unavailable.error, undefined);
  const empty = await runGlobalTool(
    'consultar_lob',
    {},
    gctx({ loader: fakeLoader({ lob: async () => ({ ...lobData(), activities: [] }) }).loader }),
  );
  assert.equal(empty.result, 'Obra Residencial Horizonte (OB1). A Linha de Balanço não tem blocos lançados.');
});

test('consultar_configuracoes_obra: situação, semana 1 e atual, local, equipes e locais de baixo para cima', async () => {
  const out = await runGlobalTool('consultar_configuracoes_obra', { obra: 'OB1' }, gctx());
  assert.equal(out.consulted, 'Configurações · Residencial Horizonte');
  assert.deepEqual(out.workIds, ['w1']);
  assert.deepEqual(out.result.split('\n'), [
    'Obra Residencial Horizonte (OB1). Configurações da obra:',
    '- Situação: ativa.',
    '- Semana 1: a que começa na segunda-feira 05/01/2026; semana atual: 43 (segunda-feira 26/10/2026).',
    '- Local (cidade/endereço): Vitória - ES.',
    '- Equipes cadastradas: 2 (empresa · equipe, capacidade em atividades simultâneas por semana).',
    '  - Alfa · Alvenaria (capacidade 1)',
    '  - Beta · Acabamento (capacidade 2)',
    '- Locais da obra (2, de baixo para cima): Térreo, 1º pavimento.',
  ]);
  // Leitura parcial: o que falhou é dito; sem semana 1 nas configurações, vale a do contexto da obra.
  const partial = await runGlobalTool(
    'consultar_configuracoes_obra',
    {},
    gctx({
      loader: fakeLoader({
        workSettings: async () => ({}),
        lob: async () => {
          throw new Error('sem rede');
        },
      }).loader,
    }),
  );
  assert.equal(partial.error, undefined);
  assert.ok(partial.result.includes('semana atual: 43'));
  assert.ok(partial.result.includes('- Local (cidade/endereço): não informado.'));
  assert.ok(partial.result.includes('- Locais da obra: não foi possível ler agora.'));
});

// ─── Terminalidade e segurança ──────────────────────────────────────────────────

test('consultar_terminalidade "todas": uma entrada por obra lida, sem as indisponíveis e as que falharam (ditas no fim)', async () => {
  const errors: unknown[] = [];
  const { loader, calls } = fakeLoader({
    terminality: async id => {
      if (id === 'w3') return null;
      if (id === 'w4') throw new Error('tempo esgotado');
      return emptyTerminality();
    },
  });
  const out = await runGlobalTool(
    'consultar_terminalidade',
    { obra: 'todas' },
    gctx({ loader, onError: (_cause, info) => errors.push(info) }),
  );
  const entries: ModuleReportEntry<TerminalityData>[] = [
    { workId: 'w1', workName: 'Residencial Horizonte', data: emptyTerminality() },
    { workId: 'w2', workName: 'Mozine', data: emptyTerminality() },
    { workId: 'w5', workName: 'Brizz Norte', data: emptyTerminality() },
  ];
  assert.equal(
    out.result,
    [
      terminalityReport(entries, {}, TODAY),
      'Sem a terminalidade disponível no sistema: Tauá.',
      'Não foi possível ler agora: Brizz Sul.',
    ].join('\n'),
  );
  assert.equal(out.error, undefined);
  assert.equal(out.consulted, 'Terminalidade · todas as obras');
  assert.deepEqual(out.workIds, ['w1', 'w2', 'w5']);
  assert.deepEqual(
    calls.map(c => c.args[0]),
    ['w1', 'w2', 'w3', 'w4', 'w5'],
  );
  assert.deepEqual(errors, [{ tool: 'consultar_terminalidade', workId: 'w4' }]);
});

test('consultar_terminalidade e consultar_seguranca de uma obra: relatório do módulo com a entrada sem `obra`', async () => {
  const one = await runGlobalTool('consultar_terminalidade', { obra: 'MZN', extra: 1 }, gctx());
  assert.equal(
    one.result,
    `Obra Mozine (MZN). ${terminalityReport([{ workId: 'w2', workName: 'Mozine', data: emptyTerminality() }], { extra: 1 }, TODAY)}`,
  );
  assert.equal(one.consulted, 'Terminalidade · Mozine');
  assert.deepEqual(one.workIds, ['w2']);
  const safety = await runGlobalTool('consultar_seguranca', {}, gctx());
  assert.equal(
    safety.result,
    `Obra Residencial Horizonte (OB1). ${safetyReport([{ workId: 'w1', workName: 'Residencial Horizonte', data: emptySafety() }], {}, TODAY)}`,
  );
  assert.equal(safety.consulted, 'Segurança do trabalho · Residencial Horizonte');
  const all = await runGlobalTool('consultar_seguranca', { obra: 'Todas as obras' }, gctx());
  assert.equal(all.consulted, 'Segurança do trabalho · todas as obras');
  assert.deepEqual(all.workIds, ['w1', 'w2', 'w4', 'w5']);
  assert.ok(all.result.endsWith('Sem a segurança do trabalho disponível no sistema: Tauá.'));
  const unavailable = await runGlobalTool('consultar_terminalidade', { obra: 'TAU' }, gctx());
  assert.equal(unavailable.result, 'Obra Tauá (TAU, inativa). Terminalidade ainda não está disponível no sistema.');
  assert.equal(unavailable.error, undefined);
  const failed = await runGlobalTool(
    'consultar_terminalidade',
    { obra: 'MZN' },
    gctx({
      loader: fakeLoader({
        terminality: async () => {
          throw new Error('x');
        },
      }).loader,
    }),
  );
  assert.equal(failed.error, true);
  assert.equal(failed.result, 'Não foi possível ler a terminalidade da obra Mozine agora. Tente de novo em instantes.');
  assert.deepEqual(failed.workIds, []);
});

// ─── Falhas e limites ───────────────────────────────────────────────────────────

test('falha do carregador vira resultado de erro em português, nunca exceção', async () => {
  const errors: unknown[] = [];
  const boom = () => {
    throw new Error('conexão recusada');
  };
  const ctx = gctx({
    onError: (_cause, info) => errors.push(info),
    loader: fakeLoader({
      workContext: async () => boom(),
      briefing: () => Promise.reject(new Error('x')),
      planning: async () => boom(),
      // Exceção síncrona também é pega.
      portfolio: (() => boom()) as AgentDataLoader['portfolio'],
      workSettings: async () => boom(),
      lob: async () => boom(),
    }).loader,
  });
  const week = await runGlobalTool('listar_semana', { semana: 'atual' }, ctx);
  assert.deepEqual(week, {
    result: 'Não foi possível ler o planejamento da obra Residencial Horizonte agora. Tente de novo em instantes.',
    error: true,
    workIds: [],
  });
  const summary = await runGlobalTool('resumo_obra', { obra: 'MZN' }, ctx);
  assert.equal(summary.result, 'Não foi possível ler o dossiê da obra Mozine agora. Tente de novo em instantes.');
  assert.equal(summary.error, true);
  assert.equal((await runGlobalTool('consultar_vagoes', {}, ctx)).error, true);
  assert.equal((await runGlobalTool('consultar_lob', {}, ctx)).error, true);
  assert.equal((await runGlobalTool('consultar_configuracoes_obra', {}, ctx)).error, true);
  const portfolio = await runGlobalTool('panorama_obras', {}, ctx);
  assert.equal(portfolio.result, 'Não foi possível montar o panorama das obras agora. Tente de novo em instantes.');
  assert.deepEqual(portfolio.workIds, []);
  assert.deepEqual(errors[0], { tool: 'listar_semana', workId: 'w1' });
  assert.ok(errors.some(e => (e as { tool: string }).tool === 'panorama_obras'));
  // Dado malformado que estoura no meio da ferramenta: a despachante pega.
  const broken = await runGlobalTool(
    'consultar_vagoes',
    {},
    gctx({ loader: fakeLoader({ planning: async () => ({}) as Planning }).loader }),
  );
  assert.equal(broken.error, true);
  assert.equal(broken.result, 'Não foi possível concluir esta consulta agora. Tente de novo em instantes.');
  // Ferramenta desconhecida e entrada que não é objeto.
  assert.deepEqual(await runGlobalTool('apagar_obra', {}, gctx()), {
    result: 'Ferramenta "apagar_obra" não existe.',
    error: true,
    workIds: [],
  });
  assert.ok((await runGlobalTool('listar_semana', null, gctx())).result.startsWith('Obra Residencial Horizonte (OB1). Semana 43'));
  assert.ok((await runGlobalTool('listar_semana', ['x'], gctx())).result.startsWith('Obra Residencial Horizonte (OB1). Semana 43'));
});

test('todo resultado é cortado no limite, numa quebra de linha, com aviso', async () => {
  const long = Array.from({ length: 2000 }, (_, i) => `obra ${i} | PPC ${i % 100}%`).join('\n');
  const out = await runGlobalTool('panorama_obras', {}, gctx({ loader: fakeLoader({ portfolio: async () => long }).loader }));
  assert.ok(out.result.length <= MAX_RESULT_CHARS, String(out.result.length));
  assert.ok(out.result.endsWith('(lista cortada no limite de 12.000 caracteres: peça um filtro, um período menor ou uma obra por vez.)'));
  assert.ok(/\| PPC \d+%\n\(lista cortada/.test(out.result), 'corta numa quebra de linha');
  assert.equal(out.consulted, 'Panorama das obras');
  assert.equal(capResult('curto'), 'curto');
  // Sem quebra de linha perto do limite, corta no caractere.
  const flat = capResult('a'.repeat(20_000));
  assert.ok(flat.length <= MAX_RESULT_CHARS);
  assert.ok(flat.startsWith('aaaa') && flat.includes('\n(lista cortada'));
});
