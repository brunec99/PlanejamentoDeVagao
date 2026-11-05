import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, type Command } from '../src/application/use-cases/commands';
import { createMockData } from '../src/mocks/planning';
import type { WeeklyCommitment } from '../src/domain/entities';
import {
  NO_LOCAL,
  carryCommand,
  localChoices,
  localCommand,
  localFill,
  localKeyOf,
  localSelectionFromFilter,
  printLocalOptions,
} from '../src/modules/curto-prazo/commitment-local';
import { listParam, localCutLabel, printSearchParams, printableRows } from '../src/modules/curto-prazo/print-options';
import { recreateCommand, undoUpdateCommand } from '../src/modules/curto-prazo/undo';

/* Local da linha do curto prazo (05/11/2026): a coluna Local da planilha, o local que acompanha as cópias da
 * linha e o Desfazer, e o recorte por local do PDF. */

const LOCALS = [
  { id: 'l-cob', name: 'Cobertura' },
  { id: 'l-2', name: '2º pavimento' },
  { id: 'l-1', name: '1º pavimento' },
];
const known = new Set(LOCALS.map(l => l.id));

const base: WeeklyCommitment = {
  id: 'c1',
  createdAt: '2026-10-19T10:00:00.000Z',
  updatedAt: '2026-10-19T10:00:00.000Z',
  workId: 'obra-1',
  name: 'Reboco',
  supplier: 'SM MARTINS',
  weekStart: '2026-10-19',
  weekEnd: '2026-10-25',
  responsibleId: 'user-2',
  teamId: 'equipe-1',
  startDate: '2026-10-20',
  endDate: '2026-10-21',
};

test('local da linha: id fora da lista (apagado, lista que não carregou) conta como sem local', () => {
  assert.equal(localKeyOf('l-2', known), 'l-2');
  assert.equal(localKeyOf(undefined, known), NO_LOCAL);
  assert.equal(localKeyOf('l-apagado', known), NO_LOCAL);
  assert.equal(localKeyOf('l-2', new Set()), NO_LOCAL);
});

test('lista da célula: "(sem local)" só aparece quando a linha tem local, para tirá-lo', () => {
  assert.deepEqual(
    localChoices(LOCALS, '').map(o => o.label),
    ['Cobertura', '2º pavimento', '1º pavimento'],
  );
  assert.deepEqual(localChoices(LOCALS, 'l-2')[0], { value: '', label: '(sem local)' });
  assert.equal(localChoices(LOCALS, 'l-2').length, 4);
});

test('gravar o local manda as células atuais e o local explícito; tirar manda null', () => {
  assert.deepEqual(localCommand(base, 'l-2'), {
    type: 'update_commitment',
    commitmentId: 'c1',
    name: 'Reboco',
    supplier: 'SM MARTINS',
    teamId: 'equipe-1',
    weekStart: '2026-10-19',
    startDate: '2026-10-20',
    endDate: '2026-10-21',
    localId: 'l-2',
  });
  assert.equal((localCommand({ ...base, localId: 'l-2' }, null) as { localId?: string | null }).localId, null);
});

test('"Levar ›" leva o local junto, uma semana depois; sem local, o comando não fala de local', () => {
  assert.deepEqual(carryCommand({ ...base, localId: 'l-1' }, 'user-9'), {
    type: 'create_commitment',
    workId: 'obra-1',
    name: 'Reboco',
    weekStart: '2026-10-26',
    responsibleId: 'user-9',
    supplier: 'SM MARTINS',
    teamId: 'equipe-1',
    startDate: '2026-10-27',
    endDate: '2026-10-28',
    localId: 'l-1',
  });
  assert.equal('localId' in carryCommand(base, 'user-9'), false);
});

test('Desfazer: a edição volta com o local anterior, inclusive "sem local"; a exclusão desfeita recria com o local', () => {
  assert.equal((undoUpdateCommand({ ...base, localId: 'l-cob' }) as { localId?: string | null }).localId, 'l-cob');
  assert.equal((undoUpdateCommand(base) as { localId?: string | null }).localId, null);
  assert.equal((recreateCommand({ ...base, localId: 'l-cob' }, 'user-1', 'c9') as { localId?: string }).localId, 'l-cob');
  assert.equal('localId' in recreateCommand(base, 'user-1'), false);
});

test('no servidor: local ausente mantém, null tira, e o inverso de uma escolha devolve o local anterior', () => {
  const data = createMockData();
  data.users.find(u => u.id === 'user-2')!.role = 'planner';
  let seq = 0;
  const run = (command: Command) =>
    applyCommand(data, command, { actorId: 'user-2', today: '2026-10-02', now: '2026-10-02T12:00:00.000Z', newId: () => `loc-${++seq}` });
  const id = run({
    type: 'create_commitment',
    workId: 'obra-1',
    name: 'Forro 701',
    weekStart: '2026-09-28',
    responsibleId: 'user-2',
    localId: 'l-1',
  });
  const row = () => data.commitments.find(c => c.id === id)!;
  assert.equal(row().localId, 'l-1');
  // Escolher outro local e desfazer: volta ao 1º pavimento.
  const before = { ...row() };
  run(localCommand(row(), 'l-2'));
  assert.equal(row().localId, 'l-2');
  run(undoUpdateCommand(before));
  assert.equal(row().localId, 'l-1');
  // Editar outra célula (sem local no comando) não mexe no local.
  const current = row();
  run({
    type: 'update_commitment',
    commitmentId: id,
    name: 'Forro 702',
    supplier: current.supplier,
    teamId: current.teamId ?? null,
    weekStart: current.weekStart,
    startDate: current.startDate,
    endDate: current.endDate,
  });
  assert.deepEqual([row().name, row().localId], ['Forro 702', 'l-1']);
  // Tirar o local e desfazer a partir de uma linha que não tinha local: o inverso manda null.
  const without = { ...row(), localId: undefined };
  run(undoUpdateCommand(without));
  assert.equal(row().localId, undefined);
  // "Levar ›" cria a linha da semana seguinte com o local da origem.
  run(localCommand(row(), 'l-cob'));
  const carried = run(carryCommand(row(), 'user-2'));
  assert.equal(data.commitments.find(c => c.id === carried)?.localId, 'l-cob');
});

test('alça no Local: copia o local da origem, pula a linha que não se edita e a que já tem o local', () => {
  const source = { ...base, id: 's', localId: 'l-2' };
  const targets = [
    { ...base, id: 'a' },
    { ...base, id: 'b', localId: 'l-2' },
    { ...base, id: 'c', localId: 'l-1', weekStart: '2026-10-12' },
    { ...base, id: 'd', localId: 'l-apagado' },
  ];
  const editable = (row: WeeklyCommitment) => row.weekStart === '2026-10-19';
  const fill = localFill(source, targets, known, editable);
  assert.equal(fill.localId, 'l-2');
  assert.deepEqual(
    fill.changes.map(r => r.id),
    ['a', 'd'],
  );
  assert.equal(fill.skipped, 1);
  // Origem sem local: a alça tira o local das vizinhas (null), e a que já está sem local fica.
  const clear = localFill({ ...base, id: 's' }, targets, known, () => true);
  assert.equal(clear.localId, null);
  assert.deepEqual(
    clear.changes.map(r => r.id),
    ['b', 'c'],
  );
});

test('filtro da coluna Local (por nome) vira a seleção inicial do PDF (por id), com "(vazias)" = sem local', () => {
  assert.equal(localSelectionFromFilter(undefined, LOCALS), undefined);
  assert.deepEqual([...localSelectionFromFilter(new Set(['Cobertura', '']), LOCALS)!].sort(), ['', 'l-cob']);
  assert.deepEqual([...localSelectionFromFilter(new Set(['1º pavimento']), LOCALS)!], ['l-1']);
});

test('lista "Local" da janela do PDF: sem local primeiro, locais da semana de cima para baixo, com a contagem', () => {
  assert.deepEqual(printLocalOptions(['l-1', '', 'l-cob', 'l-1', ''], LOCALS), [
    { value: '', label: '(sem local)', count: 2 },
    { value: 'l-cob', label: 'Cobertura', count: 1 },
    { value: 'l-1', label: '1º pavimento', count: 2 },
  ]);
  // Nenhuma linha com local na semana: não há o que recortar.
  assert.deepEqual(printLocalOptions(['', ''], LOCALS), []);
  assert.deepEqual(printLocalOptions(['l-1'], LOCALS), [{ value: 'l-1', label: '1º pavimento', count: 1 }]);
});

test('URL da impressão: excluir e excluir-local repetidos, vazio para "sem", painel só quando desmarcado', () => {
  const params = printSearchParams({
    week: '2026-10-19',
    kind: 'fechamento',
    order: 'inicio',
    panel: false,
    excludedCompanies: ['ATR ENG', ''],
    excludedLocals: ['l-cob', ''],
  });
  assert.equal(
    params.toString(),
    'semana=2026-10-19&tipo=fechamento&ordem=inicio&painel=0&excluir=ATR+ENG&excluir=&excluir-local=l-cob&excluir-local=',
  );
  assert.deepEqual(params.getAll('excluir-local'), ['l-cob', '']);
  // Tudo marcado: nada de excluir; no planejamento, o painel não existe.
  const all = printSearchParams({
    week: '2026-10-19',
    kind: 'planejamento',
    order: 'empreiteiro',
    panel: false,
    excludedCompanies: [],
    excludedLocals: [],
  });
  assert.equal(all.toString(), 'semana=2026-10-19&tipo=planejamento&ordem=empreiteiro');
  assert.deepEqual(listParam(undefined), []);
  assert.deepEqual(listParam(''), ['']);
  assert.deepEqual(listParam(['l-cob', '']), ['l-cob', '']);
});

test('PDF: recorte por empreiteiro e por local juntos, e o cabeçalho diz os locais impressos', () => {
  const rows = [
    { company: 'RC', local: 'l-1' },
    { company: 'RC', local: '' },
    { company: 'SM', local: 'l-cob' },
    { company: 'SM', local: 'l-1' },
  ];
  const printed = printableRows(
    rows,
    r => r.company,
    r => r.local,
    ['SM'],
    [''],
  );
  assert.deepEqual(printed, [{ company: 'RC', local: 'l-1' }]);
  assert.deepEqual(
    printableRows(
      rows,
      r => r.company,
      r => r.local,
      [],
      [],
    ),
    rows,
  );
  assert.equal(localCutLabel(['l-1', 'l-cob', 'l-1'], LOCALS, ['l-2']), 'Local: Cobertura, 1º pavimento');
  assert.equal(localCutLabel(['l-1', ''], LOCALS, ['l-cob']), 'Local: 1º pavimento, sem local');
  // Sem local desmarcado não há recorte a anunciar; sem linha impressa, também não.
  assert.equal(localCutLabel(['l-1'], LOCALS, []), undefined);
  assert.equal(localCutLabel([], LOCALS, ['l-1']), undefined);
});
