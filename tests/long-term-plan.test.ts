import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activitySpan, dependsOn, earliestStart, examplePlanDocument, floorSchedule, latestPercents, minimumStart,
  physicalProgress, planSpan, precedenceLevels, readPlanFile, reschedule, teamDemand, validatePlanDocument,
  type LongTermActivity, type LongTermPlanDocument,
} from '../src/domain/long-term-plan';

const activity = (id: string, over: Partial<LongTermActivity> = {}): LongTermActivity => ({
  id, name: id, color: '#2563eb', firstFloor: 1, lastFloor: 5, start: '2026-01-05', duration: 5, interval: 7,
  visible: true, predecessors: [], teams: [], ...over,
});
const doc = (activities: LongTermActivity[], over: Partial<LongTermPlanDocument> = {}): LongTermPlanDocument =>
  ({ floorCount: 20, floorNames: {}, activities, baselines: [], measurements: [], ...over });

test('cada pavimento começa um ritmo depois do anterior e o término mostrado é o último dia trabalhado', () => {
  const slots = floorSchedule(activity('a', { lastFloor: 3 }));
  assert.deepEqual(slots.map(s => s.start), ['2026-01-05', '2026-01-12', '2026-01-19']);
  assert.equal(slots[0].finish, '2026-01-09'); // segunda a sexta: 5 dias
  assert.equal(slots[0].end, '2026-01-10');
});

test('o fim do serviço é o do pavimento que termina por último, não o do último pavimento', () => {
  const a = activity('a', { lastFloor: 3, floorDurations: { '1': 30 } });
  assert.equal(activitySpan(a).finish, '2026-02-03');
});

test('sem pavimento escolhido, a sucessora não cruza a predecessora em nenhum pavimento comum', () => {
  const slow = activity('p', { interval: 10 });
  const fast = activity('s', { interval: 5, predecessors: [{ activityId: 'p', lagDays: 0 }] });
  const start = minimumStart(slow, fast, fast.predecessors[0]);
  const moved = { ...fast, start };
  for (let floor = 1; floor <= 5; floor++) {
    const pred = floorSchedule(slow).find(s => s.floor === floor)!;
    const succ = floorSchedule(moved).find(s => s.floor === floor)!;
    assert.ok(succ.start >= pred.end, `pavimento ${floor}: ${succ.start} < ${pred.end}`);
  }
  // Converge no último pavimento: é ele que manda.
  assert.equal(start, '2026-01-30');
});

test('duração própria de um pavimento do meio também segura a sucessora (a original ignorava)', () => {
  const pred = activity('p', { floorDurations: { '3': 20 } });
  const succ = activity('s', { predecessors: [{ activityId: 'p', lagDays: 0 }] });
  const start = minimumStart(pred, succ, succ.predecessors[0]);
  // Pav. 3 da predecessora: começa 19/01 e dura 20 dias → livre em 08/02; a sucessora chega ao 3º 14 dias depois do início.
  assert.equal(start, '2026-01-25');
});

test('predecessora por pavimento específico libera o primeiro pavimento da sucessora', () => {
  const pred = activity('p');
  const succ = activity('s', { predecessors: [{ activityId: 'p', lagDays: 2, floor: 2 }] });
  assert.equal(earliestStart(succ, [pred, succ]), '2026-01-19'); // pav. 2 livre em 17/01 + 2 dias
});

test('faixas sem pavimento em comum encadeiam término-início do serviço inteiro', () => {
  const pred = activity('p', { firstFloor: 1, lastFloor: 2 });
  const succ = activity('s', { firstFloor: 3, lastFloor: 5, predecessors: [{ activityId: 'p', lagDays: 0 }] });
  assert.equal(earliestStart(succ, [pred, succ]), activitySpan(pred).end);
});

test('reprogramar empurra a cadeia inteira numa passada e só "Recalcular" remove folga', () => {
  const a = activity('a');
  const b = activity('b', { start: '2025-01-01', predecessors: [{ activityId: 'a', lagDays: 0 }] });
  const c = activity('c', { start: '2027-01-01', predecessors: [{ activityId: 'b', lagDays: 0 }] });
  const pushed = reschedule([c, b, a]);
  assert.equal(pushed.find(x => x.id === 'b')!.start, '2026-01-10');
  assert.equal(pushed.find(x => x.id === 'c')!.start, '2027-01-01'); // folga manual mantida
  const tight = reschedule([c, b, a], { removeSlack: true });
  assert.equal(tight.find(x => x.id === 'c')!.start, '2026-01-15');
  assert.equal(tight.find(x => x.id === 'a')!.start, '2026-01-05'); // sem predecessora não se mexe
});

test('níveis do fluxograma seguem a precedência mais longa', () => {
  const levels = precedenceLevels([
    activity('a'), activity('b', { predecessors: [{ activityId: 'a', lagDays: 0 }] }),
    activity('c', { predecessors: [{ activityId: 'a', lagDays: 0 }, { activityId: 'b', lagDays: 0 }] }), activity('d'),
  ]);
  assert.deepEqual(Object.fromEntries(levels), { a: 0, b: 1, c: 2, d: 0 });
});

test('dependsOn detecta o ciclo que o formulário não pode oferecer', () => {
  const list = [activity('a'), activity('b', { predecessors: [{ activityId: 'a', lagDays: 0 }] })];
  assert.equal(dependsOn(list, 'b', 'a'), true); // ligar b → a fecharia ciclo
  assert.equal(dependsOn(list, 'a', 'b'), false);
});

test('validação recusa ciclo, predecessora inexistente e pavimento fora da obra', () => {
  const cyc = doc([activity('a', { predecessors: [{ activityId: 'b', lagDays: 0 }] }), activity('b', { predecessors: [{ activityId: 'a', lagDays: 0 }] })]);
  assert.throws(() => validatePlanDocument(cyc), /ciclo/);
  assert.throws(() => validatePlanDocument(doc([activity('a', { predecessors: [{ activityId: 'x', lagDays: 0 }] })])), /não existe/);
  assert.throws(() => validatePlanDocument(doc([activity('a', { lastFloor: 30 })])), /pavimento final/);
  assert.throws(() => validatePlanDocument(doc([activity('a', { start: '2026-02-30' })])), /data inválida/);
});

test('validação limpa sobras: duração fora da faixa e medição de serviço excluído', () => {
  const clean = validatePlanDocument(doc([activity('a', { floorDurations: { '2': 9, '9': 4 } })], {
    measurements: [{ id: 'm1', number: 1, date: '2026-02-01', createdAt: '2026-02-01T10:00:00Z', createdBy: 'u', items: [{ activityId: 'a', value: 10 }, { activityId: 'sumiu', value: 50 }] }],
  }));
  assert.deepEqual(clean.activities[0].floorDurations, { '2': 9 });
  assert.deepEqual(clean.measurements[0].items.map(i => i.activityId), ['a']);
});

test('pico semanal de equipe soma serviços simultâneos e respeita a duração por pavimento', () => {
  const a = activity('a', { lastFloor: 1, teams: [{ name: 'Pedreiros', size: 4 }] });
  const b = activity('b', { lastFloor: 1, start: '2026-01-09', teams: [{ name: 'Pedreiros', size: 3 }] });
  const { weeks, matrix } = teamDemand([a, b]);
  assert.deepEqual(weeks, ['2026-01-05', '2026-01-12']);
  assert.equal(matrix['2026-01-05'].Pedreiros, 7);
  assert.equal(matrix['2026-01-12'].Pedreiros, 3);
});

test('avanço físico pondera por pavimento-dias e conta 0% para o serviço ainda não medido', () => {
  const big = activity('big', { unit: '%', lastFloor: 4 });   // 20 pavimento-dias
  const small = activity('small', { unit: 'm²', plannedTotal: 200, lastFloor: 1 }); // 5
  const plain = activity('plain');                             // sem unidade: fora da conta
  const measurements = [{ id: 'm', number: 1, date: '2026-02-01', createdAt: '', createdBy: 'u', items: [{ activityId: 'small', value: 100 }] }];
  assert.deepEqual(latestPercents([big, small, plain], measurements), { small: 50 });
  assert.equal(physicalProgress([big, small, plain], measurements), 10); // (20×0 + 5×50) / 25
  assert.equal(physicalProgress([big, small], measurements, '2026-01-31'), 0);
});

test('o plano de exemplo já nasce encadeado e válido', () => {
  const example = examplePlanDocument('2026-10-05');
  assert.deepEqual(validatePlanDocument(example).activities.length, 6);
  const alvenaria = example.activities.find(a => a.name === 'Alvenaria')!;
  assert.equal(alvenaria.start, earliestStart(alvenaria, example.activities));
  assert.ok(planSpan(example.activities)!.months > 6);
});

test('arquivo .plp.json da ferramenta antiga do App-ATR é convertido, inclusive a predecessora única', () => {
  const legacy = {
    id: '1715', nome: 'Obra Demo', numPavimentos: 20, nomePavimentos: { '1': 'Subsolo', '2': 'Térreo' }, updatedAt: '2026-05-20T10:00:00Z',
    atividades: [
      { id: 'a1', nome: 'Estrutura', cor: '#dc2626', paviInicial: 1, paviFinal: 20, dataInicio: '2025-01-06', duracaoLocal: 5, intervalo: 7, visivel: true, equipes: [{ nome: 'Armadores', quantidade: 6 }], unidadeMedida: '%' },
      { id: 'a2', nome: 'Alvenaria', cor: '#2563eb', paviInicial: 1, paviFinal: 20, dataInicio: '2025-02-03', duracaoLocal: 7, intervalo: 7, visivel: true, predecessoraId: 'a1', lagDias: 0, duracoesPorPavimento: { 2: 10 } },
      { id: 'a3', nome: 'Reboco', cor: '#059669', paviInicial: 1, paviFinal: 20, dataInicio: '2025-03-17', duracaoLocal: 10, intervalo: 7, visivel: false, predecessoras: [{ atividadeId: 'a2', lagDias: 3, pavimento: 5 }] },
    ],
    baselines: [{ id: 'b1', nome: 'LB 01', criadoEm: '2026-05-14T12:00:00Z', atividades: [] }],
    rodadasMedicao: [{ id: 'r1', numero: 1, data: '2026-05-15', criadoEm: '2026-05-15T12:00:00Z', itens: [{ atividadeId: 'a1', valor: 40 }] }],
  };
  const plan = readPlanFile(legacy);
  assert.equal(plan.floorCount, 20);
  assert.equal(plan.floorNames['2'], 'Térreo');
  assert.deepEqual(plan.activities[1].predecessors, [{ activityId: 'a1', lagDays: 0 }]);
  assert.deepEqual(plan.activities[1].floorDurations, { '2': 10 });
  assert.deepEqual(plan.activities[2].predecessors, [{ activityId: 'a2', lagDays: 3, floor: 5 }]);
  assert.equal(plan.activities[2].visible, false);
  assert.deepEqual(plan.activities[0].teams, [{ name: 'Armadores', size: 6 }]);
  assert.equal(plan.baselines[0].name, 'LB 01');
  assert.equal(plan.measurements[0].items[0].value, 40);
  // O arquivo exportado por este sistema volta igual.
  assert.deepEqual(readPlanFile({ format: 'obra360-longo-prazo', document: plan }), plan);
});
