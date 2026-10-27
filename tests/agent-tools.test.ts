import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_TOOL_SPECS,
  handleOf,
  resolveHandle,
  resolveWeek,
  runAgentTool,
  type ToolContext,
} from '../src/application/use-cases/agent-tools';
import type { Command } from '../src/application/use-cases/commands';
import type { User } from '../src/domain/entities';
import { S35, S42, S43, S44, TODAY, WEEK_ONE, WORK, fixture, longTermPlan, stamp } from './fixtures/agent-planning';

let seq = 0;
const ctx = (over: Partial<ToolContext> = {}): ToolContext => ({
  data: fixture(),
  workId: WORK,
  today: TODAY,
  actor: { id: 'u-planner', role: 'planner' },
  levels: ['longo', 'medio', 'curto'],
  weekOne: WEEK_ONE,
  longTermPlan,
  newId: () => `prop-${++seq}`,
  ...over,
});
const as = (role: User['role']) => ctx({ actor: { id: `u-${role}`, role } });
const creates = (commands: Command[]) =>
  commands.filter((c): c is Extract<Command, { type: 'create_commitment' }> => c.type === 'create_commitment');

// ─── Apelidos e semanas ─────────────────────────────────────────────────────────

test('handleOf e resolveHandle: prefixo único resolve, ambíguo não, id inteiro passa, caixa e "c:"/"t:" são ignorados', () => {
  assert.equal(handleOf('c42-0001-reboco'), 'c42-0001');
  const rows = [{ id: 'abcd1234-x' }, { id: 'abcd5678-y' }, { id: 'zz' }];
  assert.equal(resolveHandle(rows, 'c:abcd1234'), rows[0]);
  assert.equal(resolveHandle(rows, 'abcd'), undefined); // ambíguo
  assert.equal(resolveHandle(rows, 'ab'), undefined);
  assert.equal(resolveHandle(rows, 'C:ABCD12'), rows[0]);
  assert.equal(resolveHandle(rows, 't:abcd5'), rows[1]);
  assert.equal(resolveHandle(rows, 'abcd5678-y'), rows[1]);
  assert.equal(resolveHandle(rows, 'zz'), rows[2]);
  assert.equal(resolveHandle(rows, ''), undefined);
  assert.equal(resolveHandle(rows, 'c:'), undefined);
  assert.equal(resolveHandle(rows, 'naoexiste'), undefined);
});

test('resolveWeek: atual, anterior, próxima, número, "S42", data dentro da semana e entrada inválida', () => {
  const c = ctx();
  assert.deepEqual(resolveWeek('atual', c), { weekStart: S43 });
  assert.deepEqual(resolveWeek('', c), { weekStart: S43 });
  assert.deepEqual(resolveWeek(undefined, c), { weekStart: S43 });
  assert.deepEqual(resolveWeek('Anterior', c), { weekStart: S42 });
  assert.deepEqual(resolveWeek('passada', c), { weekStart: S42 });
  assert.deepEqual(resolveWeek('próxima', c), { weekStart: S44 });
  assert.deepEqual(resolveWeek('seguinte', c), { weekStart: S44 });
  assert.deepEqual(resolveWeek('35', c), { weekStart: S35 });
  assert.deepEqual(resolveWeek(43, c), { weekStart: S43 });
  assert.deepEqual(resolveWeek('S42', c), { weekStart: S42 });
  assert.deepEqual(resolveWeek('semana 44', c), { weekStart: S44 });
  assert.deepEqual(resolveWeek('2026-10-21', c), { weekStart: S42 });
  assert.deepEqual(resolveWeek('2026-11-01', c), { weekStart: S43 }); // domingo ainda é a semana 43
  assert.ok('error' in resolveWeek('xyz', c));
  assert.ok('error' in resolveWeek('0', c));
  assert.ok('error' in resolveWeek('-2', c));
  assert.ok('error' in resolveWeek('2,5', c));
  // Sem semana 1 configurada, a semana 1 é a da linha mais antiga (31/08).
  assert.deepEqual(resolveWeek('1', ctx({ weekOne: undefined })), { weekStart: S35 });
  assert.deepEqual(resolveWeek('9', ctx({ weekOne: undefined })), { weekStart: S43 });
});

test('as especificações das ferramentas têm nome, descrição e esquema de entrada', () => {
  assert.deepEqual(
    AGENT_TOOL_SPECS.map(s => s.name),
    ['listar_semana', 'listar_tarefas_mes', 'listar_servicos_macro', 'propor_levar', 'propor_criar_linhas', 'propor_apontar'],
  );
  for (const spec of AGENT_TOOL_SPECS) {
    assert.ok(spec.description.length > 20, spec.name);
    assert.equal(spec.input_schema.type, 'object');
  }
});

// ─── Leitura ────────────────────────────────────────────────────────────────────

test('listar_semana: semana atual com apelido, empresa, equipe, período e apontamento', () => {
  const out = runAgentTool('listar_semana', { semana: 'atual' }, ctx());
  assert.equal(out.error, undefined);
  assert.equal(out.proposal, undefined);
  const lines = out.result.split('\n');
  assert.equal(lines[0], 'Semana 43 (26/10/2026 a 01/11/2026): 2 linhas, 0 Sim, 0 Não, 2 sem apontamento (PPC 0%).');
  assert.equal(lines[1], 'apelido | atividade | empresa | equipe | período | apontamento');
  assert.equal(lines[2], 'c:c43-0001 | Reboco apto 501 | Alfa | Alvenaria | 26/10–28/10 | sem apontamento');
  assert.equal(lines[3], 'c:c43-0002 | GFIP | - | - | 26/10–26/10 | sem apontamento');
  assert.equal(lines.length, 4);
  assert.ok(!out.result.includes('Fora da obra'));
});

test('listar_semana: anterior, por número, por data, sem linhas e inválida', () => {
  const anterior = runAgentTool('listar_semana', { semana: 'anterior' }, ctx());
  const lines = anterior.result.split('\n');
  assert.equal(lines[0], 'Semana 42 (19/10/2026 a 25/10/2026): 4 linhas, 1 Sim, 2 Não, 1 sem apontamento (PPC 25%).');
  assert.deepEqual(lines.slice(2), [
    'c:c42-0001 | Reboco apto 501 | Alfa | Alvenaria | 19/10–21/10 | Não (Falta de Mão de Obra)',
    'c:c42-0002 | Contrapiso apto 602 | Beta | Acabamento | 20/10–23/10 | Não (Falta de Material)',
    'c:c42-0003 | Diário de obra | - | - | 19/10–24/10 | Sim',
    'c:c42-0004 | Pintura externa | Gama | - | 19/10–23/10 | sem apontamento',
  ]);
  assert.ok(
    runAgentTool('listar_semana', { semana: '35' }, ctx()).result.startsWith('Semana 35 (31/08/2026 a 06/09/2026): 1 linhas, 1 Sim'),
  );
  assert.ok(runAgentTool('listar_semana', { semana: '2026-10-21' }, ctx()).result.startsWith('Semana 42 ('));
  assert.equal(runAgentTool('listar_semana', { semana: '40' }, ctx()).result, 'Semana 40 (05/10/2026): nenhuma linha na planilha.');
  // Sem entrada nenhuma, lista a semana atual.
  assert.ok(runAgentTool('listar_semana', null, ctx()).result.startsWith('Semana 43 ('));
  const invalid = runAgentTool('listar_semana', { semana: 'quando?' }, ctx());
  assert.equal(invalid.error, true);
  assert.ok(invalid.result.includes('não entendida'));
});

test('listar_tarefas_mes: filtros do plano vivo, com situação de cada tarefa', () => {
  const todas = runAgentTool('listar_tarefas_mes', { filtro: 'todas' }, ctx());
  const lines = todas.result.split('\n');
  assert.equal(lines[0], 'Plano "Outubro" (2026-10), filtro todas: 5 tarefas.');
  assert.deepEqual(lines.slice(2), [
    't:ta000001 | Impermeabilização cobertura | 22/10–29/10 | 0% | Alfa · Alvenaria | em andamento, abaixo do alvo (67%)',
    't:ta000002 | Pintura externa fachada norte | 05/10–16/10 | 40% | - | vencida em 16/10',
    't:ta000003 | Reboco apto 501 | 13/10–06/11 | 10% | Alfa · Alvenaria | em andamento, abaixo do alvo (58%)',
    't:ta000004 | Forro de gesso apto 301 | 01/10–09/10 | 100% | - | concluída',
    't:ta000005 | Contramarco janelas | 03/11–10/11 | 0% | - | a iniciar',
  ]);
  const names = (filtro: string) =>
    runAgentTool('listar_tarefas_mes', { filtro }, ctx())
      .result.split('\n')
      .slice(2)
      .map(l => l.split(' | ')[0]);
  assert.deepEqual(names('semana_atual'), ['t:ta000001', 't:ta000003']);
  assert.deepEqual(names('atrasadas'), ['t:ta000002']);
  assert.deepEqual(names('em_andamento'), ['t:ta000002', 't:ta000003']);
  assert.deepEqual(names('proximas'), ['t:ta000005']);
  // Filtro desconhecido cai em "todas".
  assert.equal(
    runAgentTool('listar_tarefas_mes', { filtro: 'outro' }, ctx()).result.split('\n')[0],
    'Plano "Outubro" (2026-10), filtro outro: 5 tarefas.',
  );
});

test('listar_tarefas_mes: recusa sem o médio prazo liberado; sem plano vivo, diz isso sem erro', () => {
  const recusa = runAgentTool('listar_tarefas_mes', { filtro: 'todas' }, ctx({ levels: ['curto'] }));
  assert.equal(recusa.error, true);
  assert.ok(recusa.result.includes('médio prazo não está liberado'));
  const data = fixture();
  data.plans = data.plans.filter(p => p.id !== 'plan-out');
  const semPlano = runAgentTool('listar_tarefas_mes', { filtro: 'todas' }, ctx({ data }));
  assert.equal(semPlano.error, undefined);
  assert.equal(semPlano.result, 'A obra não tem plano do mês vivo.');
  // Filtro sem tarefa: resposta curta, sem erro.
  data.plans = fixture().plans;
  data.planTasks = data.planTasks.filter(t => t.id !== 'ta000002-pintura');
  const vazio = runAgentTool('listar_tarefas_mes', { filtro: 'atrasadas' }, ctx({ data }));
  assert.equal(vazio.result, 'Plano "Outubro" (2026-10): nenhuma tarefa no filtro "atrasadas".');
});

test('listar_servicos_macro: só os serviços visíveis, com medido e previsto; recusa sem o longo prazo', () => {
  const out = runAgentTool('listar_servicos_macro', {}, ctx());
  const lines = out.result.split('\n');
  assert.equal(lines[0], 'Plano de longo prazo: 2 serviços.');
  assert.equal(lines[2], 'Alvenaria | pav. 1–5 | 03/08/2026–06/09/2026 | medido 70% | previsto hoje 100%');
  assert.equal(lines[3], 'Pintura | pav. 1–5 | 09/11/2026–13/12/2026 | medido sem medição | previsto hoje 0%');
  assert.ok(!out.result.includes('Oculto'));
  const recusa = runAgentTool('listar_servicos_macro', {}, ctx({ levels: ['medio', 'curto'] }));
  assert.equal(recusa.error, true);
  assert.ok(recusa.result.includes('longo prazo não está liberado'));
  assert.equal(
    runAgentTool('listar_servicos_macro', {}, ctx({ longTermPlan: undefined })).result,
    'A obra não tem plano de longo prazo preenchido.',
  );
});

// ─── propor_levar ───────────────────────────────────────────────────────────────

test('propor_levar: cria a linha na semana seguinte com o período deslocado 7 dias; pula a já levada e o apelido inexistente', () => {
  const out = runAgentTool('propor_levar', { linhas: ['c:c42-0001', 'c:c42-0002', 'c:zzzz9999'] }, ctx());
  assert.equal(out.error, undefined);
  const p = out.proposal!;
  assert.equal(p.kind, 'levar');
  assert.equal(p.weekStart, S43);
  assert.equal(p.title, 'Levar 1 linha para a semana 43');
  assert.deepEqual(p.lines, ['Contrapiso apto 602 (Beta) → semana 43']);
  assert.deepEqual(p.commands, [
    {
      type: 'create_commitment',
      workId: WORK,
      name: 'Contrapiso apto 602',
      weekStart: S43,
      responsibleId: 'u-planner',
      supplier: 'Beta',
      teamId: 'tB',
      startDate: '2026-10-27',
      endDate: '2026-10-30',
    },
  ]);
  // O Reboco já tem linha igual (mesmo nome e fornecedor) na semana 43; o apelido inexistente fica de fora.
  assert.deepEqual(p.skipped, ['Reboco apto 501: já existe linha igual na semana 43', 'c:zzzz9999: linha não encontrada nesta obra']);
  assert.ok(out.result.startsWith(`Proposta ${p.id} criada: Levar 1 linha para a semana 43.`));
  assert.ok(out.result.includes('Ficaram de fora:'));
});

test('propor_levar: semana fixa desloca o período pelo número de semanas; mesma semana é pulada', () => {
  const out = runAgentTool('propor_levar', { linhas: ['c:c42-0002'], semana: 'proxima' }, ctx());
  const [cmd] = creates(out.proposal!.commands);
  assert.equal(out.proposal!.weekStart, S44);
  assert.equal(out.proposal!.title, 'Levar 1 linha para a semana 44');
  assert.equal(cmd.weekStart, S44);
  assert.equal(cmd.startDate, '2026-11-03');
  assert.equal(cmd.endDate, '2026-11-06');
  // Linha de outra obra não resolve, mesmo com o apelido certo.
  const outra = runAgentTool('propor_levar', { linhas: ['c:c43-0009'] }, ctx());
  assert.equal(outra.error, true);
  assert.ok(outra.result.includes('linha não encontrada nesta obra'));
  const mesma = runAgentTool('propor_levar', { linhas: ['c:c42-0001'], semana: '2026-10-19' }, ctx());
  assert.equal(mesma.error, true);
  assert.ok(mesma.result.startsWith('Nada a levar.'));
  assert.ok(mesma.result.includes('já está na semana 42'));
  assert.equal(runAgentTool('propor_levar', { linhas: [] }, ctx()).error, true);
  assert.equal(runAgentTool('propor_levar', {}, ctx()).error, true);
  assert.equal(runAgentTool('propor_levar', { linhas: ['c:c42-0002'], semana: 'ontem' }, ctx()).error, true);
});

test('propor_levar: consulta não propõe; semana encerrada recusa o planejador e aceita o admin', () => {
  const viewer = runAgentTool('propor_levar', { linhas: ['c:c42-0002'] }, as('viewer'));
  assert.equal(viewer.error, true);
  assert.ok(viewer.result.includes('apenas consulta'));
  // A linha da semana 35 iria para a semana 36 (07/09), encerrada desde 16/09 para quem não é admin.
  const planner = runAgentTool('propor_levar', { linhas: ['c:c35-0001'] }, as('planner'));
  assert.equal(planner.error, true);
  assert.ok(planner.result.includes('A semana 36 (07/09/2026) já está encerrada para edição'));
  const manager = runAgentTool('propor_levar', { linhas: ['c:c35-0001'] }, as('manager'));
  assert.equal(manager.error, true);
  const admin = runAgentTool('propor_levar', { linhas: ['c:c35-0001'] }, as('admin'));
  assert.equal(admin.error, undefined);
  const [cmd] = creates(admin.proposal!.commands);
  assert.equal(cmd.weekStart, '2026-09-07');
  assert.equal(cmd.startDate, '2026-09-07');
  assert.equal(cmd.endDate, '2026-09-09');
  assert.equal(cmd.supplier, 'Alfa');
  assert.equal(cmd.teamId, null);
  assert.equal(cmd.responsibleId, 'u-admin');
});

// ─── propor_criar_linhas ────────────────────────────────────────────────────────

test('propor_criar_linhas: a partir da tarefa do plano do mês, com nome, equipe e período recortado na semana', () => {
  const out = runAgentTool('propor_criar_linhas', { semana: 'atual', itens: [{ tarefa: 't:ta000001' }] }, ctx());
  assert.equal(out.error, undefined);
  const p = out.proposal!;
  assert.equal(p.kind, 'criar');
  assert.equal(p.weekStart, S43);
  assert.equal(p.title, 'Criar 1 linha na semana 43');
  assert.deepEqual(p.commands, [
    {
      type: 'create_commitment',
      workId: WORK,
      name: 'Impermeabilização cobertura',
      weekStart: S43,
      responsibleId: 'u-planner',
      supplier: 'Alfa',
      teamId: 'tA',
      startDate: '2026-10-26',
      endDate: '2026-10-29',
    },
  ]);
  assert.deepEqual(p.lines, ['Impermeabilização cobertura (Alfa · Alvenaria) 26/10–29/10 (do plano do mês: 22/10–29/10)']);
  assert.deepEqual(p.skipped, []);
  // Nome e datas escritos no item valem sobre os da tarefa.
  const custom = runAgentTool(
    'propor_criar_linhas',
    { semana: 'atual', itens: [{ tarefa: 't:ta000001', nome: 'Imper. cobertura (1ª demão)', inicio: '2026-10-28', fim: '2026-10-28' }] },
    ctx(),
  );
  const [cmd] = creates(custom.proposal!.commands);
  assert.equal(cmd.name, 'Imper. cobertura (1ª demão)');
  assert.equal(cmd.startDate, '2026-10-28');
  assert.equal(cmd.endDate, '2026-10-28');
  assert.equal(cmd.teamId, 'tA');
  // Tarefa da linha de base e apelido inexistente não servem; sem o médio prazo liberado, tarefa nenhuma resolve.
  const base = runAgentTool('propor_criar_linhas', { semana: 'atual', itens: [{ tarefa: 't:tb000001' }, { tarefa: 't:ta999999' }] }, ctx());
  assert.equal(base.error, true);
  assert.ok(base.result.startsWith('Nenhuma linha a criar.'));
  assert.ok(base.result.includes('t:tb000001: tarefa do plano do mês não encontrada'));
  assert.ok(base.result.includes('t:ta999999: tarefa do plano do mês não encontrada'));
  const semMedio = runAgentTool('propor_criar_linhas', { semana: 'atual', itens: [{ tarefa: 't:ta000001' }] }, ctx({ levels: ['curto'] }));
  assert.equal(semMedio.error, true);
});

test('propor_criar_linhas: item escrito resolve a equipe cadastrada; equipe desconhecida fica só com a empresa', () => {
  const out = runAgentTool(
    'propor_criar_linhas',
    {
      semana: 'atual',
      itens: [
        { nome: 'Contramarco janelas', equipe: 'acabamento', inicio: '2026-10-28', fim: '2026-10-29' },
        { nome: 'Limpeza final', empresa: 'Delta', equipe: 'Faxina' },
        { nome: 'Vistoria', empresa: 'Delta' },
      ],
    },
    ctx(),
  );
  assert.equal(out.error, undefined);
  const p = out.proposal!;
  assert.equal(p.title, 'Criar 3 linhas na semana 43');
  const cmds = creates(p.commands);
  assert.deepEqual(
    cmds.map(c => [c.name, c.supplier, c.teamId, c.startDate, c.endDate]),
    [
      ['Contramarco janelas', 'Beta', 'tB', '2026-10-28', '2026-10-29'],
      ['Limpeza final', 'Delta', null, S43, S43],
      ['Vistoria', 'Delta', null, S43, S43],
    ],
  );
  assert.deepEqual(p.skipped, ['Limpeza final: equipe "Faxina" não cadastrada; a linha fica só com a empresa']);
  assert.equal(p.lines[0], 'Contramarco janelas (Beta · Acabamento) 28/10–29/10');
  assert.equal(p.lines[1], 'Limpeza final (Delta) 26/10–26/10');
  // Equipe com o mesmo nome em duas empresas: a empresa escrita desempata.
  const data = fixture();
  data.teams.push({ id: 'tC', ...stamp, workId: WORK, company: 'Gama', name: 'Alvenaria', weeklyCapacity: 1 });
  const gama = runAgentTool(
    'propor_criar_linhas',
    { semana: 'atual', itens: [{ nome: 'Alvenaria apto 601', empresa: 'Gama', equipe: 'Alvenaria' }] },
    ctx({ data }),
  );
  assert.equal(creates(gama.proposal!.commands)[0].teamId, 'tC');
  const alfa = runAgentTool(
    'propor_criar_linhas',
    { semana: 'atual', itens: [{ nome: 'Alvenaria apto 601', equipe: 'Alvenaria' }] },
    ctx({ data }),
  );
  assert.equal(creates(alfa.proposal!.commands)[0].teamId, 'tA');
  assert.equal(creates(alfa.proposal!.commands)[0].supplier, 'Alfa');
});

test('propor_criar_linhas: datas recortadas na semana, fim antes do início, data inválida, duplicada e sem itens', () => {
  const out = runAgentTool(
    'propor_criar_linhas',
    {
      semana: '44',
      itens: [
        { nome: 'Atravessa', inicio: '2026-10-20', fim: '2026-11-20' },
        { nome: 'Invertida', inicio: '2026-11-05', fim: '2026-11-03' },
        { nome: 'Data ruim', inicio: '05/11' },
        { nome: 'Fim ruim', fim: 'sexta' },
        {},
        { nome: '   ' },
      ],
    },
    ctx(),
  );
  const cmds = creates(out.proposal!.commands);
  assert.deepEqual(
    cmds.map(c => [c.name, c.startDate, c.endDate]),
    [
      ['Atravessa', S44, '2026-11-08'],
      ['Invertida', '2026-11-05', '2026-11-05'],
    ],
  );
  assert.deepEqual(out.proposal!.skipped, [
    'Data ruim: início "05/11" inválido',
    'Fim ruim: fim "sexta" inválido',
    'item sem nome',
    'item sem nome',
  ]);
  // Mesmo nome e empresa já na semana (a empresa da linha existente vem da equipe Alfa).
  const dup = runAgentTool(
    'propor_criar_linhas',
    { semana: 'atual', itens: [{ nome: 'reboco APTO 501', equipe: 'Alvenaria' }, { nome: 'GFIP' }] },
    ctx(),
  );
  assert.equal(dup.error, true);
  assert.ok(dup.result.includes('reboco APTO 501: já existe linha igual na semana 43'));
  assert.ok(dup.result.includes('GFIP: já existe linha igual na semana 43'));
  // Mesmo nome com outra empresa é linha nova.
  const outra = runAgentTool('propor_criar_linhas', { semana: 'atual', itens: [{ nome: 'Reboco apto 501', empresa: 'Gama' }] }, ctx());
  assert.equal(outra.error, undefined);
  assert.equal(runAgentTool('propor_criar_linhas', { semana: 'atual', itens: [] }, ctx()).error, true);
  assert.equal(runAgentTool('propor_criar_linhas', { semana: 'atual' }, ctx()).error, true);
  assert.equal(runAgentTool('propor_criar_linhas', { semana: 'atual', itens: ['texto', 5, null] }, ctx()).error, true);
  assert.equal(runAgentTool('propor_criar_linhas', { semana: 'nunca', itens: [{ nome: 'X' }] }, ctx()).error, true);
});

test('propor_criar_linhas: consulta não propõe; semana encerrada recusa o planejador e aceita o admin', () => {
  assert.ok(
    runAgentTool('propor_criar_linhas', { semana: 'atual', itens: [{ nome: 'X' }] }, as('viewer')).result.includes('apenas consulta'),
  );
  const planner = runAgentTool('propor_criar_linhas', { semana: '35', itens: [{ nome: 'Forma vigas' }] }, as('planner'));
  assert.equal(planner.error, true);
  assert.ok(planner.result.includes('A semana 35 (31/08/2026) já está encerrada'));
  // A semana 42 ainda aceita quem não é admin até a terça 27/10, inclusive.
  assert.equal(
    runAgentTool('propor_criar_linhas', { semana: 'anterior', itens: [{ nome: 'Forma vigas' }] }, as('planner')).error,
    undefined,
  );
  assert.equal(
    runAgentTool('propor_criar_linhas', { semana: 'anterior', itens: [{ nome: 'Forma vigas' }] }, ctx({ today: '2026-10-28' })).error,
    true,
  );
  const admin = runAgentTool('propor_criar_linhas', { semana: '35', itens: [{ nome: 'Forma vigas' }] }, as('admin'));
  assert.equal(admin.error, undefined);
  assert.equal(creates(admin.proposal!.commands)[0].weekStart, S35);
});

// ─── propor_apontar ─────────────────────────────────────────────────────────────

test('propor_apontar: Sim, Não com causa exata e aproximada, causa inválida pulada, um único record_fulfillments', () => {
  const out = runAgentTool(
    'propor_apontar',
    {
      itens: [
        { linha: 'c:c43-0001', cumprido: true },
        { linha: 'c:c43-0002', cumprido: false, causa: 'Falta de Material' },
        { linha: 'c:c42-0004', cumprido: false, causa: 'mão de obra', justificativa: '  Equipe não veio  ' },
        { linha: 'c:c42-0003', cumprido: false, causa: 'Chuva' },
        { linha: 'c:c42-0002', cumprido: false },
        { linha: 'c:nada', cumprido: true },
        { linha: 'c:c43-0009', cumprido: true },
      ],
    },
    ctx(),
  );
  assert.equal(out.error, undefined);
  const p = out.proposal!;
  assert.equal(p.kind, 'apontar');
  assert.equal(p.title, 'Apontar 3 linhas');
  assert.equal(p.weekStart, S43); // a semana da primeira linha apontada
  assert.equal(p.commands.length, 1);
  assert.deepEqual(p.commands[0], {
    type: 'record_fulfillments',
    items: [
      { commitmentId: 'c43-0001-reboco', fulfilled: true },
      { commitmentId: 'c43-0002-gfip', fulfilled: false, cause: 'Falta de Material', justification: undefined },
      { commitmentId: 'c42-0004-pintura', fulfilled: false, cause: 'Falta de Mão de Obra', justification: 'Equipe não veio' },
    ],
  });
  assert.deepEqual(p.lines, [
    'Reboco apto 501: Sim',
    'GFIP: Não — Falta de Material',
    'Pintura externa: Não — Falta de Mão de Obra (Equipe não veio)',
  ]);
  assert.deepEqual(p.skipped, [
    'Diário de obra: causa "Chuva" não está na lista',
    'Contrapiso apto 602: causa "(vazia)" não está na lista',
    'c:nada: linha não encontrada nesta obra',
    'c:c43-0009: linha não encontrada nesta obra',
  ]);
});

test('propor_apontar: causas por aproximação exigem cinco letras e só valem quando apontam uma causa só', () => {
  const cause = (causa: string) => {
    const out = runAgentTool('propor_apontar', { itens: [{ linha: 'c:c43-0002', cumprido: false, causa }] }, ctx());
    const cmd = out.proposal?.commands[0];
    return cmd?.type === 'record_fulfillments' && 'cause' in cmd.items[0] ? cmd.items[0].cause : out.result;
  };
  assert.equal(cause('falta de material'), 'Falta de Material');
  assert.equal(cause('FALTA DE MATERIAL'), 'Falta de Material');
  assert.equal(cause('intemperies'), 'Intempéries');
  assert.equal(cause('retrabalho'), 'Retrabalho');
  assert.ok(String(cause('produtividade')).includes('é ambígua (Baixa Produtividade, Superestimação da produtividade)')); // duas causas contêm
  assert.equal(cause('documentação'), 'Falta de documentação');
  assert.equal(cause('Falha de Equipamento'), 'Falha de Equipamento');
  assert.equal(cause('Falta de equipamento'), 'Falta de equipamento');
  assert.ok(String(cause('obra')).includes('causa "obra" não está na lista')); // quatro letras: não aproxima
  // Palavra genérica de cinco letras cabe em várias causas: a ferramenta não escolhe por ninguém, lista
  // as candidatas e pede ao modelo que pergunte qual (27/10/2026).
  assert.ok(
    String(cause('falta')).includes(
      'causa "falta" é ambígua (Falta de equipamento, Falta de Mão de Obra, Falta de Material, Falta de documentação)',
    ),
  );
  assert.ok(String(cause('falha')).includes('é ambígua (Falha de comunicação, Falha de definição de projeto, Falha de Equipamento'));
});

test('propor_apontar: sem itens, tudo pulado, consulta e "cumprido" fora de booleano', () => {
  assert.equal(runAgentTool('propor_apontar', { itens: [] }, ctx()).error, true);
  assert.equal(runAgentTool('propor_apontar', {}, ctx()).error, true);
  const pulado = runAgentTool('propor_apontar', { itens: [{ linha: 'c:c43-0002', cumprido: false, causa: 'Greve' }] }, ctx());
  assert.equal(pulado.error, true);
  assert.ok(pulado.result.startsWith('Nenhum apontamento a propor.'));
  const viewer = runAgentTool('propor_apontar', { itens: [{ linha: 'c:c43-0001', cumprido: true }] }, as('viewer'));
  assert.equal(viewer.error, true);
  assert.ok(viewer.result.includes('apenas consulta'));
  // "cumprido" que não é exatamente true vale como Não, e aí a causa é obrigatória.
  const texto = runAgentTool('propor_apontar', { itens: [{ linha: 'c:c43-0001', cumprido: 'sim' }] }, ctx());
  assert.equal(texto.error, true);
  assert.ok(texto.result.includes('causa "(vazia)" não está na lista'));
});

test('propor_apontar: o admin aponta em semana encerrada', () => {
  const admin = runAgentTool('propor_apontar', { itens: [{ linha: 'c:c35-0001', cumprido: false, causa: 'Retrabalho' }] }, as('admin'));
  assert.equal(admin.error, undefined);
  assert.equal(admin.proposal!.weekStart, S35);
});

// A regra do curto prazo (src/domain/week-lock.ts, 09/10/2026) deixa o apontamento livre em qualquer
// semana para quem edita a obra, e o servidor (`record_fulfillments` em commands.ts) não trava a semana
// encerrada: a ferramenta segue a planilha e só recusa a consulta.
test('propor_apontar: o planejador aponta em semana encerrada, como na planilha', () => {
  const planner = runAgentTool('propor_apontar', { itens: [{ linha: 'c:c35-0001', cumprido: false, causa: 'Retrabalho' }] }, as('planner'));
  assert.equal(planner.error, undefined);
  assert.equal(planner.proposal!.weekStart, S35);
});

// ─── Diversos ───────────────────────────────────────────────────────────────────

test('ferramenta desconhecida e entrada que não é objeto', () => {
  const out = runAgentTool('apagar_tudo', {}, ctx());
  assert.equal(out.error, true);
  assert.equal(out.result, 'Ferramenta "apagar_tudo" não existe.');
  assert.equal(runAgentTool('propor_levar', 'c:c42-0002', ctx()).error, true);
  assert.equal(runAgentTool('propor_apontar', 42, ctx()).error, true);
});

test('cada proposta recebe um id novo do contexto', () => {
  const c = ctx();
  const a = runAgentTool('propor_apontar', { itens: [{ linha: 'c:c43-0001', cumprido: true }] }, c).proposal!;
  const b = runAgentTool('propor_apontar', { itens: [{ linha: 'c:c43-0002', cumprido: true }] }, c).proposal!;
  assert.notEqual(a.id, b.id);
  assert.match(a.id, /^prop-\d+$/);
});
